import { type APIRequestContext, type Page, expect, request } from '@playwright/test';
import { ADMIN_EMAIL, DEPARTMENT_SLUG, URLS, runId, seedPassword } from './env';
import { mailMark, waitForMailLink } from './mail';

/** Neue, eindeutige Test-Adresse pro Lauf (bleibt wie die Spitznamen-Profile in der lokalen DB) */
export function testEmail(name: string): string {
  return `e2e-${name}-${runId}@example.com`;
}

/**
 * Passwort-Konto anlegen und per Link aus der Mail bestätigen (ohne Browser).
 * Für Tests, die ein frisches Konto brauchen (z. B. 2FA), ohne die Seed-Konten zu verändern.
 */
export async function createVerifiedAccount(email: string, password: string, firstName = 'E2E') {
  const api = await request.newContext({ baseURL: URLS.api });
  const since = mailMark();
  const reg = await api.post('/api/auth/register-helper', { data: { email, password, firstName } });
  expect(reg.ok(), `Registrierung: ${reg.status()} ${await reg.text()}`).toBeTruthy();
  const link = await waitForMailLink(email, '/verify-email', since);
  const token = new URL(link).searchParams.get('token');
  const verify = await api.post('/api/auth/verify-email', { data: { token } });
  expect(verify.ok(), `Bestätigung: ${verify.status()} ${await verify.text()}`).toBeTruthy();
  await api.dispose();
}

export interface TestDepartment {
  id: string;
  slug: string;
  name: string;
}

/** Weitere Abteilung über die Admin-Schnittstelle anlegen (Demo-Admin ist globaler Admin) */
export async function createDepartment(
  api: APIRequestContext,
  input: { slug: string; name: string; organization?: 'CEVI' | 'PFADI' | 'JUBLA' | 'OTHER'; membersOnly?: boolean }
): Promise<TestDepartment> {
  const res = await api.post('/api/admin/departments', {
    data: { membersOnly: true, organization: 'CEVI', ...input },
  });
  expect(res.ok(), `Abteilung anlegen: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return { id: body.id ?? body.department?.id, slug: input.slug, name: input.name };
}

export async function deleteDepartment(api: APIRequestContext, dept: TestDepartment | undefined) {
  if (!dept?.id) return;
  await api.delete(`/api/admin/departments/${dept.id}`, { data: { confirm: dept.slug } });
}

/** Adresse der Abteilungsseite einer anderen Abteilung (lokal: <slug>.localhost bzw. <slug>.pfadi.localhost) */
export function departmentUrl(slug: string, org: 'cevi' | 'pfadi' | 'jubla' | 'verein' = 'cevi'): string {
  const base = new URL(URLS.web);
  const host = org === 'cevi' ? `${slug}.localhost` : `${slug}.${org}.localhost`;
  return `${base.protocol}//${host}:${base.port}`;
}

/**
 * Nach dem Login im Portal angemeldet: Die Seite verlässt Login und «/zwei-faktor». Ein frisches Konto hat noch
 * keine Abteilung und landet darum auf der Auswahl im Portal statt in der Demo-Abteilung.
 */
export async function expectLoggedInOnPortal(page: Page) {
  await page.waitForURL((url) => !url.pathname.startsWith('/zwei-faktor') && url.pathname !== '/');
  await expect.poll(async () => (await page.request.get(`${URLS.login}/api/auth/me`)).status()).toBe(200);
}

/** fetch() im Kontext der geöffneten Seite (gleiche Cookies, gleicher Proxy wie die App) */
export async function pageFetch(page: Page, url: string, init: { method?: string; body?: unknown } = {}) {
  return page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method: method ?? 'GET',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        // keine JSON-Antwort
      }
      return { status: res.status, json: json as Record<string, unknown> | null };
    },
    { url, method: init.method, body: init.body }
  );
}

/**
 * API als Demo-Admin, direkt am Backend (lokal bestimmt x-tenant-slug die Abteilung).
 * Nur für Testdaten, die Abläufe selbst laufen im Browser.
 */
export async function adminApi(): Promise<APIRequestContext> {
  const api = await request.newContext({
    baseURL: URLS.api,
    extraHTTPHeaders: { 'x-tenant-slug': DEPARTMENT_SLUG },
  });
  const res = await api.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: seedPassword() } });
  expect(res.ok(), `Admin-Login fehlgeschlagen (${res.status()}). Stimmt SEED_PASSWORD?`).toBeTruthy();
  return api;
}

export interface TestEvent {
  slug: string;
  title: string;
  shiftTitle: string;
}

/** Öffentlicher Anlass in der Zukunft mit einer Schicht (3 Plätze), eigener Slug pro Lauf */
export async function createTestEvent(api: APIRequestContext, name: string): Promise<TestEvent> {
  const slug = `e2e-${name}-${runId}`;
  const title = `E2E ${name} ${runId}`;
  const shiftTitle = `E2E-Schicht ${runId}`;
  const start = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  start.setUTCHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const event = await api.post('/api/events', {
    data: { title, slug, startDate: start.toISOString(), accessType: 'PUBLIC' },
  });
  expect(event.ok(), `Anlass anlegen: ${event.status()} ${await event.text()}`).toBeTruthy();
  const { id } = await event.json();

  const shift = await api.post('/api/shifts', {
    data: { eventId: id, title: shiftTitle, startTime: start.toISOString(), endTime: end.toISOString(), requiredSlots: 3 },
  });
  expect(shift.ok(), `Schicht anlegen: ${shift.status()} ${await shift.text()}`).toBeTruthy();
  return { slug, title, shiftTitle };
}

export async function deleteTestEvent(api: APIRequestContext, slug: string) {
  await api.delete(`/api/events/${slug}`, { data: { confirm: slug } });
}

/**
 * Im Browser auf der Abteilungsseite anmelden. Lokal gilt das Cookie des Login-Portals (localhost:3002)
 * nicht für demo.localhost:3000, darum direkt über den API-Proxy der Abteilungsseite.
 * Den Login über das Portal selbst prüft login.spec.ts.
 */
export async function loginOnDepartment(page: Page, email: string, baseUrl: string = URLS.web) {
  await page.goto(`${baseUrl}/`);
  const status = await page.evaluate(
    async ({ email, password }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      return res.status;
    },
    { email, password: seedPassword() }
  );
  expect(status, `Login als ${email}`).toBe(200);
}
