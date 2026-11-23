import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  authCookie,
  createDepartment,
  createEvent,
  createShift,
  createTestApp,
  createUser,
  hasTestDb,
  inject,
  resetDb,
} from './helpers.js';

describe.skipIf(!hasTestDb)('Fehlermeldungen der API in der Sprache der Person', () => {
  let app: FastifyInstance;
  const original = process.env.I18N_ENABLED_LOCALES;

  beforeAll(async () => {
    process.env.I18N_ENABLED_LOCALES = 'de,fr,it,en';
    app = await createTestApp();
  });
  afterAll(async () => {
    process.env.I18N_ENABLED_LOCALES = original;
    await app?.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  const signup = (tenant: string, shiftId: string, cookie: string, extra: Record<string, string> = {}) =>
    inject(app, { method: 'POST', url: `/api/shifts/${shiftId}/signup`, tenant, cookie, payload: {}, headers: extra });

  it('volle Schicht: Deutsch ohne Wahl, Französisch per Cookie, Englisch per Browser', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id, { requiredSlots: 1 });
    const [first, second] = await Promise.all([createUser(app), createUser(app)]);
    expect((await signup(department.slug, shift.id, authCookie(app, first))).statusCode).toBe(200);

    const de = await signup(department.slug, shift.id, authCookie(app, second));
    expect(de.statusCode).toBe(409);
    expect(de.json()).toMatchObject({ error: 'Diese Schicht ist bereits voll belegt', code: 'SIGNUP_SHIFT_FULL' });

    const fr = await signup(department.slug, shift.id, `${authCookie(app, second)}; NEXT_LOCALE=fr`);
    expect(fr.json().error).toBe('Ce créneau est déjà complet');

    const en = await signup(department.slug, shift.id, authCookie(app, second), { 'accept-language': 'en-GB,en;q=0.9' });
    expect(en.json().error).toBe('This shift is already full');
  });

  it('Standardsprache der Abteilung gilt ohne eigene Wahl', async () => {
    const department = await createDepartment(app);
    await app.prisma.department.update({ where: { id: department.id }, data: { defaultLocale: 'IT' } });
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const res = await inject(app, { method: 'POST', url: `/api/shifts/${shift.id}/signup`, tenant: department.slug, payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ requiresLogin: true, code: 'SIGNUP_ACCOUNT_REQUIRED' });
    expect(res.json().error).toBe('Per iscriverti ti serve un account. Basta un Cevi-Name senza password.');
  });

  it('bestehende Codes bleiben erhalten (Zeitkollision)', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const a = await createShift(app, event.id, { title: 'Bar' });
    const b = await createShift(app, event.id, { title: 'Grill' });
    const user = await createUser(app);
    const cookie = `${authCookie(app, user)}; NEXT_LOCALE=en`;
    expect((await signup(department.slug, a.id, cookie)).statusCode).toBe(200);
    const res = await signup(department.slug, b.id, cookie);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('TIME_COLLISION');
    expect(res.json().error).toBe('You are already signed up for the shift «Bar» (Bar, 20:00–00:00) at the same time.');
  });

  it('nicht freigeschaltete Sprache fällt auf Deutsch zurück, unbekannte Route übersetzt', async () => {
    process.env.I18N_ENABLED_LOCALES = 'de';
    try {
      const res = await inject(app, { method: 'GET', url: '/api/gibt-es-nicht', headers: { cookie: 'NEXT_LOCALE=fr' } });
      expect(res.json().error).toBe('Nicht gefunden.');
    } finally {
      process.env.I18N_ENABLED_LOCALES = 'de,fr,it,en';
    }
    const res = await inject(app, { method: 'GET', url: '/api/gibt-es-nicht', headers: { cookie: 'NEXT_LOCALE=fr' } });
    expect(res.json().error).toBe('Introuvable.');
  });

  it('Validierungsfehler in der gewählten Sprache', async () => {
    const user = await createUser(app);
    const res = await inject(app, {
      method: 'PATCH',
      url: '/api/auth/me',
      cookie: `${authCookie(app, user)}; NEXT_LOCALE=fr`,
      payload: { firstName: 'A' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/^Trop petit/);
  });
});
