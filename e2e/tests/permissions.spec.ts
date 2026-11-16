import { type APIRequestContext, expect, test } from '@playwright/test';
import { ADMIN_EMAIL, URLS, runId } from './env';
import {
  type TestDepartment,
  type TestEvent,
  adminApi,
  createDepartment,
  createTestEvent,
  deleteDepartment,
  deleteTestEvent,
  departmentUrl,
  loginOnDepartment,
  pageFetch,
} from './helpers';

/**
 * Datenschutz und Rechte im Browser, über denselben Proxy wie die App: Personenlisten, Protokolle und
 * Anlass-Listen nur für Berechtigte, keine Daten aus fremden Abteilungen, Admin-API nur für globale Admins.
 */
const HELPER = 'helfer2@example.com';

/** Endpunkte mit Personendaten der Abteilung: nur Leitung bzw. Rechte «Personen ansehen» */
const DEPARTMENT_PEOPLE = ['/api/departments/current/people', '/api/departments/current/members', '/api/departments/current/audit'];

test.describe('Datenschutz und Rechte', () => {
  let api: APIRequestContext;
  let event: TestEvent;
  let other: TestDepartment;

  test.beforeAll(async () => {
    api = await adminApi();
    event = await createTestEvent(api, 'rechte');
    other = await createDepartment(api, { slug: `e2e-fremd-${runId}`.slice(0, 30), name: `E2E Fremd ${runId}` });
  });
  test.afterAll(async () => {
    await deleteTestEvent(api, event.slug);
    await deleteDepartment(api, other);
    await api.dispose();
  });

  test('ohne Anmeldung: kein Profil, keine Schichten, keine Personen', async ({ page }) => {
    await page.goto(`${URLS.web}/`);
    for (const url of ['/api/auth/me', '/api/shifts/my', ...DEPARTMENT_PEOPLE, `/api/events/${event.slug}/roster`]) {
      const res = await pageFetch(page, url);
      expect(res.status, url).toBe(401);
    }
  });

  test('Leitung sieht die Personen der eigenen Abteilung (Gegenprobe)', async ({ page }) => {
    await loginOnDepartment(page, ADMIN_EMAIL);
    const people = await pageFetch(page, '/api/departments/current/people');
    expect(people.status).toBe(200);
    const roster = await pageFetch(page, `/api/events/${event.slug}/roster`);
    expect(roster.status).toBe(200);
  });

  test('Helfende ohne Rechte: keine Personenlisten, kein Protokoll, keine Anlass-Listen', async ({ page }) => {
    await loginOnDepartment(page, HELPER);
    for (const url of DEPARTMENT_PEOPLE) {
      const res = await pageFetch(page, url);
      expect(res.status, url).toBe(403);
    }
    const someone = 'person-history?userId=00000000-0000-4000-8000-000000000000';
    for (const part of ['roster', 'participants', 'messages', 'logs', 'organizers', someone]) {
      const url = `/api/events/${event.slug}/${part}`;
      const res = await pageFetch(page, url);
      expect([403, 404], `${url} → ${res.status}`).toContain(res.status);
      expect(res.status, url).not.toBe(200);
    }
  });

  test('Helfende kommen nicht an die Admin-Schnittstelle', async ({ page }) => {
    await loginOnDepartment(page, HELPER);
    for (const url of ['/api/admin/users', '/api/admin/departments', '/api/admin/overview']) {
      const res = await pageFetch(page, url);
      expect([401, 403], `${url} → ${res.status}`).toContain(res.status);
    }
  });

  test('fremde Abteilung «nur für Mitglieder»: keine Anlässe, keine Personen', async ({ page }) => {
    const otherUrl = departmentUrl(other.slug);
    await loginOnDepartment(page, HELPER, otherUrl);

    const current = await pageFetch(page, '/api/departments/current');
    expect(current.status).toBe(200);
    expect(current.json?.slug).toBe(other.slug);
    expect(current.json?.viewerIsMember).toBe(false);
    // Einladungs-Token nur für die Leitung
    expect(current.json?.inviteToken).toBeUndefined();

    for (const url of DEPARTMENT_PEOPLE) {
      const res = await pageFetch(page, url);
      expect(res.status, url).toBe(403);
    }
    const tasks = await pageFetch(page, '/api/tasks');
    expect([401, 403], `/api/tasks → ${tasks.status}`).toContain(tasks.status);

    await page.goto(`${otherUrl}/`);
    await expect(page.getByText(/zeigt ihre Anlässe nur Mitgliedern/)).toBeVisible();
  });

  test('Anlass der Demo-Abteilung ist unter der fremden Subdomain nicht erreichbar', async ({ page }) => {
    await loginOnDepartment(page, ADMIN_EMAIL, departmentUrl(other.slug));
    const res = await pageFetch(page, `/api/events/${event.slug}`);
    expect(res.status).toBe(404);
  });
});
