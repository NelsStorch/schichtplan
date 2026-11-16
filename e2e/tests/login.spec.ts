import { expect, test } from '@playwright/test';
import { HELPER_EMAIL, URLS, seedPassword } from './env';
import { loginOnDepartment, pageFetch } from './helpers';

const returnTo = `${URLS.web}/`;
const loginPage = `${URLS.login}/?return_to=${encodeURIComponent(returnTo)}`;

test.describe('Login-Portal', () => {
  test('Anmelden mit E-Mail und Passwort führt zurück zur Abteilung', async ({ page }) => {
    await page.goto(loginPage);
    await page.getByText('Mit E-Mail & Passwort').click();
    await page.getByRole('textbox', { name: 'E-Mail' }).fill(HELPER_EMAIL);
    await page.locator('input[type="password"]').fill(seedPassword());
    await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click();
    await page.waitForURL((url) => url.href.startsWith(returnTo));
  });

  test('falsches Passwort zeigt eine Meldung und bleibt auf dem Login', async ({ page }) => {
    await page.goto(loginPage);
    await page.getByText('Mit E-Mail & Passwort').click();
    await page.getByRole('textbox', { name: 'E-Mail' }).fill(HELPER_EMAIL);
    await page.locator('input[type="password"]').fill('ganz-sicher-falsch-123');
    await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click();
    await expect(page.getByText('E-Mail oder Passwort falsch')).toBeVisible();
    expect(page.url()).toContain(URLS.login);
  });

  test('Abmelden beendet die Sitzung', async ({ page }) => {
    // Lokal gilt das Cookie des Portals nicht für demo.localhost: dort direkt anmelden, dann im Menü abmelden
    await loginOnDepartment(page, HELPER_EMAIL);
    expect((await pageFetch(page, '/api/auth/me')).status).toBe(200);
    await page.goto(`${URLS.web}/meine-schichten`);
    await page.getByRole('button', { name: 'Konto öffnen' }).first().click();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    // Nach dem Abmelden lädt die Seite neu: eine Abfrage mitten in der Navigation zählt nicht (Status 0)
    await expect
      .poll(async () => (await pageFetch(page, '/api/auth/me').catch(() => ({ status: 0 }))).status)
      .toBe(401);
  });

  test('fremdes Rücksprungziel wird nicht übernommen (kein offener Redirect)', async ({ page }) => {
    await page.goto(`${URLS.login}/?return_to=${encodeURIComponent('https://boese.example/')}`);
    await expect(page.getByText('boese.example')).toHaveCount(0);
  });
});
