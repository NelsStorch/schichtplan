import { type APIRequestContext, expect, test } from '@playwright/test';
import { HELPER_EMAIL, URLS, runId } from './env';
import { type TestDepartment, adminApi, createDepartment, deleteDepartment, departmentUrl, loginOnDepartment, pageFetch } from './helpers';

/**
 * Mehrere Verbände: Eine Cevi- und eine Pfadi-Abteilung mit derselben Subdomain sind getrennt
 * (Unique über Verband + Slug). Lokal steht der Verband im Host: <slug>.localhost = Cevi, <slug>.pfadi.localhost = Pfadi.
 */
test.describe('Verbände getrennt', () => {
  let api: APIRequestContext;
  const slug = `e2e-org-${runId}`.slice(0, 30);
  let cevi: TestDepartment;
  let pfadi: TestDepartment;

  test.beforeAll(async () => {
    api = await adminApi();
    cevi = await createDepartment(api, { slug, name: `E2E Cevi ${runId}`, organization: 'CEVI', membersOnly: false });
    pfadi = await createDepartment(api, { slug, name: `E2E Pfadi ${runId}`, organization: 'PFADI', membersOnly: false });
  });
  test.afterAll(async () => {
    await deleteDepartment(api, cevi);
    await deleteDepartment(api, pfadi);
    await api.dispose();
  });

  test('gleiche Subdomain, je Verband die eigene Abteilung', async ({ page }) => {
    await page.goto(`${departmentUrl(slug)}/`);
    const ceviDept = await pageFetch(page, '/api/departments/current');
    expect(ceviDept.status).toBe(200);
    expect(ceviDept.json?.id).toBe(cevi.id);
    expect(ceviDept.json?.name).toBe(cevi.name);

    await page.goto(`${departmentUrl(slug, 'pfadi')}/`);
    const pfadiDept = await pageFetch(page, '/api/departments/current');
    expect(pfadiDept.status).toBe(200);
    expect(pfadiDept.json?.id).toBe(pfadi.id);
    expect(pfadiDept.json?.name).toBe(pfadi.name);
    await expect(page.getByText(pfadi.name).first()).toBeVisible();
  });

  test('Verzeichnis zeigt nur Abteilungen des eigenen Verbands', async ({ page }) => {
    await page.goto(`${departmentUrl(slug)}/`);
    const ceviList = await pageFetch(page, '/api/departments/directory');
    expect(ceviList.status).toBe(200);
    const ceviIds = (ceviList.json as unknown as { id: string }[]).map((d) => d.id);
    expect(ceviIds).toContain(cevi.id);
    expect(ceviIds).not.toContain(pfadi.id);

    await page.goto(`${departmentUrl(slug, 'pfadi')}/`);
    const pfadiList = await pageFetch(page, '/api/departments/directory');
    const pfadiIds = (pfadiList.json as unknown as { id: string }[]).map((d) => d.id);
    expect(pfadiIds).toContain(pfadi.id);
    expect(pfadiIds).not.toContain(cevi.id);
  });

  test('Cevi-Mitglied ist in der Pfadi-Abteilung kein Mitglied', async ({ page }) => {
    await loginOnDepartment(page, HELPER_EMAIL, departmentUrl(slug, 'pfadi'));
    const dept = await pageFetch(page, '/api/departments/current');
    expect(dept.json?.id).toBe(pfadi.id);
    expect(dept.json?.viewerIsMember).toBe(false);
    const people = await pageFetch(page, '/api/departments/current/people');
    expect(people.status).toBe(403);
  });

  test('Login-Portal zeigt je Verband den passenden Verbands-Login', async ({ page }) => {
    const login = new URL(URLS.login);
    await page.goto(`${login.protocol}//pfadi.localhost:${login.port}/`);
    await expect(page.getByRole('link', { name: /Mit PBS MiData anmelden/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Mit Cevi\.DB anmelden/ })).toHaveCount(0);

    await page.goto(`${URLS.login}/`);
    await expect(page.getByRole('link', { name: /Mit Cevi\.DB anmelden/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Mit PBS MiData anmelden/ })).toHaveCount(0);
  });
});
