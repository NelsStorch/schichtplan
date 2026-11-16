import { type Page, expect, test } from '@playwright/test';
import { URLS, runId } from './env';
import { createVerifiedAccount, expectLoggedInOnPortal, pageFetch, testEmail } from './helpers';
import { nextCode, totpCode } from './totp';

/**
 * Zwei-Faktor-Anmeldung (Authenticator-App) mit einem frischen Konto: einschalten, Login nur mit Code,
 * falscher Code, Wiederherstellungscode, Ausschalten nur mit Code. Die Seed-Konten bleiben unberührt.
 */
test.describe.configure({ mode: 'serial' });

const email = testEmail('2fa');
const password = `Zwei-Faktor-${runId}-x9`;
const returnTo = `${URLS.web}/`;
const loginPage = `${URLS.login}/?return_to=${encodeURIComponent(returnTo)}`;

let secret = '';
let lastStep: number | null = null;
let recoveryCodes: string[] = [];

async function passwordStep(page: Page) {
  // Die vorherige Anmeldung kann noch weiterleiten: abwarten, sonst bricht goto ab
  await page.waitForLoadState('load');
  await page.context().clearCookies();
  await page.goto(loginPage).catch(() => page.goto(loginPage));
  await page.getByText('Mit E-Mail & Passwort').click();
  await page.getByRole('textbox', { name: 'E-Mail' }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click();
  await page.waitForURL(/\/zwei-faktor/);
  await expect(page.getByRole('heading', { name: 'Code aus der App' })).toBeVisible();
}

/** Ohne Login-Cookie: /api/auth/me auf dem Login-Portal antwortet 401 */
async function expectLoggedOut(page: Page) {
  const me = await pageFetch(page, '/api/auth/me');
  expect(me.status).toBe(401);
}

test.beforeAll(async () => {
  await createVerifiedAccount(email, password);
});

test('einschalten mit Passwort und erstem Code', async ({ page }) => {
  await page.goto(`${URLS.login}/`);
  const login = await pageFetch(page, '/api/auth/login', { method: 'POST', body: { email, password } });
  expect(login.status).toBe(200);

  const wrongPw = await pageFetch(page, '/api/auth/2fa/setup', { method: 'POST', body: { currentPassword: 'falsch-123' } });
  expect(wrongPw.status).toBe(401);

  const setup = await pageFetch(page, '/api/auth/2fa/setup', { method: 'POST', body: { currentPassword: password } });
  expect(setup.status, JSON.stringify(setup.json)).toBe(200);
  secret = String(setup.json?.secret ?? '');
  expect(secret.replace(/\s/g, '')).toMatch(/^[A-Z2-7]{32}$/);

  const first = await nextCode(secret, lastStep);
  const enable = await pageFetch(page, '/api/auth/2fa/enable', { method: 'POST', body: { code: first.code } });
  expect(enable.status, JSON.stringify(enable.json)).toBe(200);
  lastStep = first.step;
  recoveryCodes = (enable.json?.recoveryCodes as string[]) ?? [];
  expect(recoveryCodes).toHaveLength(10);
});

test('Passwort allein meldet nicht an', async ({ page }) => {
  await passwordStep(page);
  await expectLoggedOut(page);
});

test('falscher Code wird abgelehnt, richtiger Code meldet an', async ({ page }) => {
  await passwordStep(page);
  const field = page.getByPlaceholder('123456');
  // Sechs Ziffern schicken das Formular selbst ab
  const current = await nextCode(secret, lastStep);
  const wrong = current.code === '000000' ? '111111' : '000000';
  await field.fill(wrong);
  await expect(page.getByText('Der Code stimmt nicht oder wurde schon verwendet.')).toBeVisible();
  await expectLoggedOut(page);

  const ok = await nextCode(secret, lastStep);
  await field.fill(ok.code);
  lastStep = ok.step;
  await expectLoggedInOnPortal(page);
});

test('ein schon verwendeter Code gilt nicht nochmals', async ({ page }) => {
  await passwordStep(page);
  await page.getByPlaceholder('123456').fill(totpCode(secret, lastStep!));
  await expect(page.getByText('Der Code stimmt nicht oder wurde schon verwendet.')).toBeVisible();
  await expectLoggedOut(page);
});

test('Wiederherstellungscode meldet an und gilt nur einmal', async ({ page }) => {
  await passwordStep(page);
  await page.getByRole('button', { name: /Wiederherstellungscode verwenden/ }).click();
  await page.getByPlaceholder('xxxxx-xxxxx').fill(recoveryCodes[0]);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expectLoggedInOnPortal(page);

  await passwordStep(page);
  await page.getByRole('button', { name: /Wiederherstellungscode verwenden/ }).click();
  await page.getByPlaceholder('xxxxx-xxxxx').fill(recoveryCodes[0]);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByText('Der Code stimmt nicht oder wurde schon verwendet.')).toBeVisible();
  await expectLoggedOut(page);
});

test('ausschalten nur mit gültigem Code, danach Login ohne Code', async ({ page }) => {
  await passwordStep(page);
  const login = await nextCode(secret, lastStep);
  await page.getByPlaceholder('123456').fill(login.code);
  lastStep = login.step;
  await expectLoggedInOnPortal(page);

  // Ausschalten über das Login-Portal (gleiches Cookie wie dort)
  await page.goto(`${URLS.login}/`);
  const denied = await pageFetch(page, '/api/auth/2fa/disable', { method: 'POST', body: { code: '123456' } });
  expect(denied.status).toBe(401);
  const off = await nextCode(secret, lastStep);
  const disable = await pageFetch(page, '/api/auth/2fa/disable', { method: 'POST', body: { code: off.code } });
  expect(disable.status, JSON.stringify(disable.json)).toBe(200);

  await page.context().clearCookies();
  await page.goto(loginPage);
  await page.getByText('Mit E-Mail & Passwort').click();
  await page.getByRole('textbox', { name: 'E-Mail' }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click();
  await expectLoggedInOnPortal(page);
});
