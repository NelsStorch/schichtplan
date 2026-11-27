import { type APIRequestContext, type Page, devices, expect, test } from '@playwright/test';
import { HELPER_EMAIL, PUBLIC_EVENT_SLUG, URLS } from './env';
import { type TestEvent, adminApi, createTestEvent, deleteTestEvent, loginOnDepartment } from './helpers';

/**
 * Mobile first: Auf Handybreite darf keine Seite seitlich scrollen (ein einziges zu breites Element
 * verschiebt sonst auch die feste Tab-Leiste und alle Sheets), und Knöpfe müssen gut antippbar sein.
 */

// iPhone-Masse, Touch und Mobile-User-Agent – aber im Chromium-Projekt (der Browsertyp lässt sich hier nicht wechseln)
const { defaultBrowserType: _browser, ...iphone } = devices['iPhone 13'];

/** Kleinste Trefferfläche für Knöpfe (WCAG 2.5.8 AA: 24 × 24 px; die unsichtbare Touch-Fläche ist grösser) */
const MIN_TARGET = 24;

async function expectNoHorizontalOverflow(page: Page, name: string) {
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      // Nur das äusserste Element melden, nicht alle Kinder
      const parent = el.parentElement?.getBoundingClientRect();
      if (parent && parent.right > vw + 1) continue;
      // Bewusst seitlich scrollbare Leisten (Chips, Tabellen-Container) sind erlaubt
      if (el.closest('[class*="overflow-x-auto"], [class*="overflow-auto"]')) continue;
      offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} (rechts ${Math.round(r.right)} px)`);
    }
    return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 10) };
  });
  expect(result.offenders, `Zu breite Elemente auf «${name}»`).toEqual([]);
  expect(result.scrollWidth, `Seitenbreite auf «${name}»`).toBeLessThanOrEqual(result.vw);
}

async function expectTappableButtons(page: Page, name: string) {
  const tooSmall = await page.evaluate((min) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"], summary')) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
      // Unsichtbare Touch-Fläche (::after der Utility «touch-hitbox») mitzählen
      const after = getComputedStyle(el, '::after');
      const w = Math.max(r.width, after.content !== 'none' ? Number.parseFloat(after.width) || 0 : 0);
      const h = Math.max(r.height, after.content !== 'none' ? Number.parseFloat(after.height) || 0 : 0);
      if (w < min || h < min) {
        out.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)} (${Math.round(w)}×${Math.round(h)})`);
      }
    }
    return out;
  }, MIN_TARGET);
  expect(tooSmall, `Zu kleine Knöpfe auf «${name}»`).toEqual([]);
}

async function expectMobileFriendly(page: Page, name: string) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await expectNoHorizontalOverflow(page, name);
  await expectTappableButtons(page, name);
}

test.describe('Mobile', () => {
  test.use({ ...iphone, reducedMotion: 'reduce' });

  let api: APIRequestContext;
  let event: TestEvent;

  test.beforeAll(async () => {
    api = await adminApi();
    event = await createTestEvent(api, 'mobile');
  });
  test.afterAll(async () => {
    await deleteTestEvent(api, event.slug);
    await api.dispose();
  });

  test('Landingpage und Login-Portal', async ({ page }) => {
    await page.goto(`${URLS.landing}/`);
    await expectMobileFriendly(page, 'Landingpage');
    await page.goto(`${URLS.login}/?return_to=${encodeURIComponent(`${URLS.web}/`)}`);
    await expectMobileFriendly(page, 'Login-Portal');
  });

  test('öffentlich: Abteilungsseite und Anlass', async ({ page }) => {
    await page.goto(`${URLS.web}/`);
    await expectMobileFriendly(page, 'Abteilungsseite');
    await page.goto(`${URLS.web}/events/${PUBLIC_EVENT_SLUG}`);
    await expectMobileFriendly(page, 'Anlass');
    // Auf dem Handy gibt es nur die Listenansicht (das Raster wäre eine breite Tabelle)
    await expect(page.getByRole('radiogroup')).toBeHidden();
  });

  test('angemeldet: Anlass, Schicht-Sheet und Meine Schichten', async ({ page }) => {
    await loginOnDepartment(page, HELPER_EMAIL);
    await page.goto(`${URLS.web}/events/${event.slug}`);
    await expect(page.getByRole('heading', { name: event.title })).toBeVisible();
    await expectMobileFriendly(page, 'Anlass (angemeldet)');

    // Schicht-Sheet öffnen: Hauptaktion steht gross unten
    const card = new RegExp(String.raw`\d{2}:\d{2} ${event.shiftTitle}`);
    await page.getByRole('button', { name: card }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expectMobileFriendly(page, 'Schicht-Sheet');

    // Am Griff nach unten wischen schliesst das Sheet
    const box = await sheet.boundingBox();
    if (!box) throw new Error('Sheet ohne Grösse');
    const x = box.x + box.width / 2;
    const y = box.y + 12;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 250, { steps: 8 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();

    await page.goto(`${URLS.web}/meine-schichten`);
    await expectMobileFriendly(page, 'Meine Schichten');
  });
});
