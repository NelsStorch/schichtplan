import { type Page, expect, test } from '@playwright/test';
import { ADMIN_EMAIL, HELPER_EMAIL, seedPassword } from './env';
import { pageFetch } from './helpers';

/**
 * Admin-Portal (lokal localhost:3003): nur globale Admins sehen Daten. Lokal reicht der Passwort-Login,
 * in Produktion verlangt das Backend zusätzlich den Verbands-Login (ADMIN_REQUIRE_CEVIDB_LOGIN, Unit-Tests).
 */
const ADMIN_URL = process.env.E2E_ADMIN_URL || 'http://localhost:3003';

async function loginOnAdmin(page: Page, email: string) {
  await page.goto(`${ADMIN_URL}/api/health`);
  const res = await pageFetch(page, '/api/auth/login', { method: 'POST', body: { email, password: seedPassword() } });
  expect(res.status, `Login als ${email}`).toBe(200);
}

test.describe('Admin-Portal', () => {
  test('ohne Anmeldung keine Admin-Daten', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/api/health`);
    const res = await pageFetch(page, '/api/admin/users');
    expect(res.status).toBe(401);
  });

  test('Helfer*in sieht «Kein Zugriff» und bekommt keine Personenliste', async ({ page }) => {
    await loginOnAdmin(page, HELPER_EMAIL);
    await page.goto(`${ADMIN_URL}/`);
    await expect(page.getByRole('heading', { name: 'Kein Zugriff' })).toBeVisible();
    const res = await pageFetch(page, '/api/admin/users');
    expect(res.status).toBe(403);
  });

  test('globale Admin sieht die Übersicht und die Personen', async ({ page }) => {
    await loginOnAdmin(page, ADMIN_EMAIL);
    await page.goto(`${ADMIN_URL}/`);
    await expect(page.getByRole('heading', { name: 'Kein Zugriff' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const res = await pageFetch(page, '/api/admin/users');
    expect(res.status).toBe(200);
  });

  test('Admin-API lehnt Aufrufe von einer fremden Seite ab', async ({ page }) => {
    await loginOnAdmin(page, ADMIN_EMAIL);
    // Gleiches Cookie (page.request teilt die Cookies des Browsers), aber Herkunft Abteilungsseite:
    // So sähe eine Anfrage aus, die eine fremde Seite im Browser der Admin auslöst (CSRF)
    const res = await page.request.get(`${ADMIN_URL}/api/admin/users`, {
      headers: { origin: 'http://demo.localhost:3000', 'sec-fetch-site': 'same-site' },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe('ADMIN_ORIGIN');
  });
});
