import { type Page, expect, test } from '@playwright/test';
import { URLS, runId } from './env';
import { expectLoggedInOnPortal, testEmail } from './helpers';
import { mailMark, waitForMailLink } from './mail';

/**
 * Konto mit Passwort: Registrierung im Login-Portal, Login erst nach Bestätigung der Adresse,
 * Passwort vergessen mit Link aus der Mail. Die Links liest der Test aus dem Mail-Log des Backends.
 */
test.describe.configure({ mode: 'serial' });

const email = testEmail('konto');
const firstPassword = `Erstes-Pw-${runId}-a1`;
const newPassword = `Neues-Pw-${runId}-b2`;
const returnTo = `${URLS.web}/`;
const loginPage = `${URLS.login}/?return_to=${encodeURIComponent(returnTo)}`;

async function openEmailLogin(page: Page) {
  await page.goto(loginPage);
  await page.getByText('Mit E-Mail & Passwort').click();
}

async function submitLogin(page: Page, password: string) {
  await openEmailLogin(page);
  await page.getByRole('textbox', { name: 'E-Mail' }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click();
}

test('Konto erstellen schickt eine Bestätigungsmail', async ({ page }) => {
  await openEmailLogin(page);
  await page.getByRole('button', { name: 'Konto erstellen', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Neues Konto erstellen' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Vorname' }).fill('E2E Konto');
  await page.getByRole('textbox', { name: 'E-Mail' }).fill(email);
  await page.locator('input[type="password"]').fill(firstPassword);
  const since = mailMark();
  await page.getByRole('button', { name: 'Konto erstellen', exact: true }).last().click();
  await expect(page.getByText(/Bestätigungs|Postfach|bestätige/i).first()).toBeVisible();
  await waitForMailLink(email, '/verify-email', since);
});

test('vor der Bestätigung kein Login', async ({ page }) => {
  await submitLogin(page, firstPassword);
  await expect(page.getByText(/bestätige zuerst deine E-Mail-Adresse/)).toBeVisible();
  expect(page.url()).toContain(URLS.login);
});

test('Link aus der Mail bestätigt die Adresse, danach klappt der Login', async ({ page }) => {
  // Neue Bestätigungsmail anfordern ist nicht nötig: der Link aus der Registrierung gilt 24 Stunden
  const link = await waitForMailLink(email, '/verify-email', new Date(Date.now() - 10 * 60_000).toISOString());
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'E-Mail bestätigt!' })).toBeVisible();

  await page.context().clearCookies();
  await submitLogin(page, firstPassword);
  await expectLoggedInOnPortal(page);
});

test('Passwort vergessen: Link aus der Mail setzt ein neues Passwort, das alte gilt nicht mehr', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(`${URLS.login}/passwort-vergessen`);
  await page.getByRole('textbox', { name: 'E-Mail' }).fill(email);
  const since = mailMark();
  await page.getByRole('button', { name: 'Link schicken' }).click();
  await expect(page.getByRole('heading', { name: 'Schau in dein Postfach' })).toBeVisible();

  const link = await waitForMailLink(email, '/passwort-zuruecksetzen', since);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Neues Passwort' })).toBeVisible();
  const fields = page.locator('input[type="password"]');
  await fields.nth(0).fill(newPassword);
  await fields.nth(1).fill(newPassword);
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Passwort geändert' })).toBeVisible();

  // Der Link gilt nur einmal (geprüft wird beim Absenden)
  await page.goto(link);
  await fields.nth(0).fill(`${newPassword}-nochmals`);
  await fields.nth(1).fill(`${newPassword}-nochmals`);
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Link abgelaufen' })).toBeVisible();

  // Altes Passwort abgelehnt, neues angenommen
  await page.context().clearCookies();
  await submitLogin(page, firstPassword);
  await expect(page.getByText('E-Mail oder Passwort falsch')).toBeVisible();
  await submitLogin(page, newPassword);
  await expectLoggedInOnPortal(page);
});
