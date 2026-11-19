import { type Page, expect, test } from '@playwright/test';
import { URLS, runId } from './env';

/**
 * Verbands-Login mit der simulierten Cevi.DB (lokal ist localhost die Cevi-Domain). Prüft die Rollenlogik vom
 * Login bis zur Seite «Abteilung anlegen»: Leitung darf anlegen, Stufenleitung sieht den Grund und ihre Rollen,
 * passive Rollen zählen nicht. Setzt die Simulation vorher und nachher zurück.
 */
test.describe.configure({ mode: 'serial' });

const loginPage = `${URLS.login}/`;

/** Vom Login-Portal über «Mit Cevi.DB anmelden» auf die Auswahlseite der Simulation */
async function openSimulation(page: Page) {
  await page.context().clearCookies();
  await page.goto(loginPage);
  await page.getByRole('link', { name: /Mit Cevi\.DB anmelden/ }).click();
  await expect(page.getByRole('heading', { name: 'Wie willst du dich anmelden?' })).toBeVisible();
}

async function resetSimulation(page: Page) {
  await openSimulation(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Simulation zurücksetzen' }).click();
  await expect(page.getByRole('status')).toContainText('Zurückgesetzt');
}

async function loginAs(page: Page, persona: string) {
  await openSimulation(page);
  await page.getByRole('link', { name: new RegExp(`^${persona}`) }).click();
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await resetSimulation(page);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await resetSimulation(page);
  await page.close();
});

test('Auswahlseite bietet echte DB, Personas und eigene Rollen an', async ({ page }) => {
  await openSimulation(page);
  await expect(page.getByRole('link', { name: /Weiter zur echten Cevi\.DB/ })).toHaveAttribute('href', /real=1/);
  await expect(page.getByRole('link', { name: /^Abteilungsleitung Sim-Dorf/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mit diesen Rollen anmelden' })).toBeVisible();
});

test('Stufenleiterin ohne Schichtplan sieht Grund, eigene Rollen und den Link für die Leitung', async ({ page }) => {
  await loginAs(page, 'Stufenleiterin');
  await page.waitForURL(/\/abteilung-erstellen/);
  await expect(page.getByRole('heading', { name: /Sim-Dorf gibt es noch keinen Schichtplan/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Deine Rollen in Cevi\.DB/ })).toBeVisible();
  await expect(page.getByText('keine Leitung')).toBeVisible();
  await expect(page.getByRole('button', { name: /An .*-Leitung senden/ })).toBeVisible();
});

test('Abteilungsleitung legt den Schichtplan an', async ({ page }) => {
  await loginAs(page, 'Abteilungsleitung Sim-Dorf');
  await page.waitForURL(/\/abteilung-erstellen/);
  await expect(page.getByRole('heading', { name: /Sim-Dorf hat noch keinen Schichtplan/ })).toBeVisible();
  const slug = `e2e-sim-${runId}`.slice(0, 30);
  await page.getByLabel('Subdomain').fill(slug);
  await page.getByRole('checkbox', { name: /Nutzungsbedingungen/ }).check();
  await page.getByRole('button', { name: /anlegen$/ }).first().click();
  await page.waitForURL((url) => url.hostname.startsWith(`${slug}.`), { timeout: 60_000 });
});

test('Stufenleiterin gehört danach automatisch dazu', async ({ page }) => {
  await loginAs(page, 'Stufenleiterin');
  // Nicht mehr auf «Anlegen»: Die Schar hat jetzt einen Schichtplan, die Person ist dort zu Hause
  await page.waitForURL((url) => !url.pathname.startsWith('/abteilung-erstellen'));
  const me = await page.request.get(`${URLS.login}/api/auth/me`);
  expect(me.ok()).toBeTruthy();
  const user = await me.json();
  expect(user.homeDepartment?.slug).toMatch(/^e2e-sim-/);
  expect(user.homeDepartmentSource).toBe('CEVIDB');
});

test('eigene Rollen: Leitung in zwei Abteilungen', async ({ page }) => {
  await openSimulation(page);
  await page.getByRole('checkbox', { name: /Abteilungsleiter\*in in JS Sim-Dorf/ }).check();
  await page.getByRole('checkbox', { name: /Abteilungsleiter\*in in JS Sim-Stadt Nord/ }).check();
  await page.getByRole('button', { name: 'Mit diesen Rollen anmelden' }).click();
  await page.waitForURL((url) => url.href.startsWith(URLS.login) || url.hostname.endsWith('localhost'));
  const me = await page.request.get(`${URLS.login}/api/auth/me`);
  const user = await me.json();
  expect(user.departmentLeader).toBe(true);
  expect(user.lastName).toBe('(Simulation)');
});
