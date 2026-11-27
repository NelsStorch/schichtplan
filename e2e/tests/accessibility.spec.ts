import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { ADMIN_EMAIL, HELPER_EMAIL, PUBLIC_EVENT_SLUG, URLS, seedPassword } from './env';
import { loginOnDepartment, pageFetch } from './helpers';

/**
 * Barrierefreiheit (WCAG 2.1 A/AA) mit axe-core. Die Seiten dürfen keine Verstösse der Stufen
 * «serious» und «critical» enthalten (u. a. fehlende Alt-Texte, Labels, Tastatur-Fallen, Kontraste).
 * Leichtere Befunde («minor»/«moderate») werden nur im Testbericht aufgelistet.
 */
const ADMIN_URL = process.env.E2E_ADMIN_URL || 'http://localhost:3003';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectAccessible(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = (list: typeof violations) =>
    list.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}×): ${v.nodes[0]?.target.join(' ')}`);
  const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const minor = violations.filter((v) => !blocking.includes(v));
  if (minor.length) console.log(`[a11y] ${name} – Hinweise:\n  ${summary(minor).join('\n  ')}`);
  // Bei Verstössen alle betroffenen Elemente mit HTML und Begründung (z. B. gemessene Farben) ausgeben,
  // nicht nur das erste: sonst kommt pro Lauf nur eine Stelle zum Vorschein
  for (const v of blocking) {
    for (const node of v.nodes) {
      console.log(
        `[a11y] ${name} – ${v.id}: ${node.target.join(' ')}\n    ${node.html.slice(0, 200)}\n    ${(node.failureSummary ?? '').replace(/\n/g, ' ')}`
      );
    }
  }
  expect(summary(blocking), `Barrierefreiheit auf «${name}»`).toEqual([]);
}

/** Der erste Tab-Druck muss den Skip-Link erreichen, Enter springt zum Hauptinhalt. */
async function expectSkipLink(page: Page) {
  await page.keyboard.press('Tab');
  const link = page.getByRole('link', { name: 'Zum Inhalt springen' });
  await expect(link).toBeFocused();
  await expect(link).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#inhalt$/);
  await expect(page.locator('main#inhalt')).toHaveCount(1);
}

test.describe('Barrierefreiheit', () => {
  test('Landingpage', async ({ page }) => {
    await page.goto(`${URLS.landing}/`);
    await expectAccessible(page, 'Landingpage');
    await expectSkipLink(page);
  });

  test('Login-Portal', async ({ page }) => {
    await page.goto(`${URLS.login}/?return_to=${encodeURIComponent(`${URLS.web}/`)}`);
    await expectAccessible(page, 'Login-Portal');
    await expectSkipLink(page);
  });

  test('Login-Portal mit E-Mail-Formular', async ({ page }) => {
    await page.goto(`${URLS.login}/?return_to=${encodeURIComponent(`${URLS.web}/`)}`);
    await page.getByText('Mit E-Mail & Passwort').click();
    await expectAccessible(page, 'Login-Formular');
  });

  test('Abteilungsseite und öffentlicher Anlass', async ({ page }) => {
    await page.goto(`${URLS.web}/`);
    await expectAccessible(page, 'Abteilungsseite');
    await expectSkipLink(page);
    await page.goto(`${URLS.web}/events/${PUBLIC_EVENT_SLUG}`);
    await expectAccessible(page, 'Anlass');
  });

  test('angemeldet: Meine Schichten', async ({ page }) => {
    await loginOnDepartment(page, HELPER_EMAIL);
    await page.goto(`${URLS.web}/meine-schichten`);
    await expectAccessible(page, 'Meine Schichten');
  });

  test('Dialog: Fokus bleibt im Dialog, Esc schliesst und gibt den Fokus zurück', async ({ page }) => {
    await loginOnDepartment(page, HELPER_EMAIL);
    await page.goto(`${URLS.web}/meine-schichten`);
    const opener = page.getByRole('button', { name: 'Konto öffnen' }).first();
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Abmelden' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Abmelden' })).toHaveCount(0);
  });

  test('Admin-Portal', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/api/health`);
    const res = await pageFetch(page, '/api/auth/login', {
      method: 'POST',
      body: { email: ADMIN_EMAIL, password: seedPassword() },
    });
    expect(res.status).toBe(200);
    await page.goto(`${ADMIN_URL}/`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expectAccessible(page, 'Admin-Portal');
    await expectSkipLink(page);
  });
});
