import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addMember, authCookie, createDepartment, createTestApp, createUser, hasTestDb, inject, resetDb } from './helpers.js';

describe.skipIf(!hasTestDb)('Sprache von Person und Abteilung', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it('Person wählt eine Sprache und setzt sie wieder auf automatisch', async () => {
    const user = await createUser(app);
    const cookie = authCookie(app, user);

    const initial = await inject(app, { method: 'GET', url: '/api/auth/me', cookie });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().locale).toBeNull();

    const set = await inject(app, { method: 'PATCH', url: '/api/auth/me', cookie, payload: { locale: 'fr' } });
    expect(set.statusCode).toBe(200);
    expect(set.json().locale).toBe('fr');
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).locale).toBe('FR');

    const reset = await inject(app, { method: 'PATCH', url: '/api/auth/me', cookie, payload: { locale: null } });
    expect(reset.json().locale).toBeNull();

    const invalid = await inject(app, { method: 'PATCH', url: '/api/auth/me', cookie, payload: { locale: 'rm' } });
    expect(invalid.statusCode).toBe(400);
  });

  it('Andere Profiländerungen lassen die Sprache unverändert', async () => {
    const user = await createUser(app);
    await app.prisma.user.update({ where: { id: user.id }, data: { locale: 'IT' } });
    const res = await inject(app, {
      method: 'PATCH',
      url: '/api/auth/me',
      cookie: authCookie(app, user),
      payload: { emailNotifyMessages: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().locale).toBe('it');
  });

  it('Abteilung hat Deutsch als Standard, nur mit Recht «Abteilung bearbeiten» änderbar', async () => {
    const department = await createDepartment(app);
    const leader = await createUser(app);
    const helper = await createUser(app);
    await addMember(app, department.id, leader.id, 'ADMIN');
    await addMember(app, department.id, helper.id, 'HELPER');

    const info = await inject(app, { method: 'GET', url: '/api/departments/current', tenant: department.slug });
    expect(info.statusCode).toBe(200);
    expect(info.json().defaultLocale).toBe('de');

    const denied = await inject(app, {
      method: 'PATCH',
      url: '/api/departments/current',
      tenant: department.slug,
      cookie: authCookie(app, helper),
      payload: { defaultLocale: 'fr' },
    });
    expect(denied.statusCode).toBe(403);

    const updated = await inject(app, {
      method: 'PATCH',
      url: '/api/departments/current',
      tenant: department.slug,
      cookie: authCookie(app, leader),
      payload: { defaultLocale: 'fr' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().defaultLocale).toBe('fr');

    // Ohne Angabe bleibt die Standardsprache, auch wenn anderes geändert wird
    const other = await inject(app, {
      method: 'PATCH',
      url: '/api/departments/current',
      tenant: department.slug,
      cookie: authCookie(app, leader),
      payload: { membersOnly: true },
    });
    expect(other.json().defaultLocale).toBe('fr');

    const reread = await inject(app, { method: 'GET', url: '/api/departments/current', tenant: department.slug });
    expect(reread.json().defaultLocale).toBe('fr');
  });
});
