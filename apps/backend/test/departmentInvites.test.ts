import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDepartmentInviteToken } from '../src/services/inviteToken.js';
import { addMember, authCookie, createDepartment, createTestApp, createUser, hasTestDb, inject, resetDb } from './helpers.js';

const BASE = 'basis-token-abcdefghijkl';

describe.skipIf(!hasTestDb)('Einladungen und Beitritt', () => {
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

  async function closedDepartment() {
    const dept = await createDepartment(app);
    return app.prisma.department.update({ where: { id: dept.id }, data: { joinMode: 'INVITE_ONLY', inviteToken: BASE } });
  }

  const passwordUser = (email: string, homeDepartmentId: string | null = null) =>
    createUser(app, { email, passwordHash: 'hash', emailVerified: true, homeDepartmentId });

  it('gibt Rechte aus einer persönlichen Einladung nur der eingeladenen Adresse und nur einmal', async () => {
    const dept = await closedDepartment();
    const anna = await passwordUser('anna@example.com');
    const mallory = await passwordUser('mallory@example.com');
    const token = createDepartmentInviteToken(dept.id, BASE, 'ADMINISTRATION', 'anna@example.com');

    // Weitergeleitet: andere Adresse
    const forwarded = await inject(app, {
      method: 'PUT',
      url: '/api/auth/me/department',
      cookie: authCookie(app, mallory),
      payload: { departmentId: dept.id, inviteToken: token, stufen: [] },
    });
    expect(forwarded.statusCode).toBe(403);
    expect(forwarded.json().code).toBe('INVITE_OTHER_EMAIL');

    const res = await inject(app, {
      method: 'PUT',
      url: '/api/auth/me/department',
      cookie: authCookie(app, anna),
      payload: { departmentId: dept.id, inviteToken: token, stufen: [] },
    });
    expect(res.statusCode).toBe(200);
    const member = await app.prisma.departmentMember.findUniqueOrThrow({
      where: { departmentId_userId: { departmentId: dept.id, userId: anna.id } },
    });
    expect(member.permissions.length).toBeGreaterThan(0);
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: anna.id } });
    expect(user).toMatchObject({ homeDepartmentSource: 'CONFIRMED', homeDepartmentConfirmSource: 'INVITE' });
    expect(await app.prisma.departmentInviteRedemption.count()).toBe(1);

    // Rechte entzogen: dieselbe Einladung bringt sie nicht zurück
    await app.prisma.departmentMember.update({ where: { id: member.id }, data: { permissions: [] } });
    const again = await inject(app, {
      method: 'PUT',
      url: '/api/auth/me/department',
      cookie: authCookie(app, anna),
      payload: { departmentId: dept.id, inviteToken: token, stufen: [] },
    });
    expect(again.statusCode).toBe(200);
    const after = await app.prisma.departmentMember.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.permissions).toEqual([]);
  });

  it('lässt eine entfernte Person mit dem alten Link nicht wieder hinein, mit neuer Einladung schon', async () => {
    const home = await createDepartment(app);
    const dept = await closedDepartment();
    const leader = await passwordUser('leitung@example.com', dept.id);
    await addMember(app, dept.id, leader.id, 'ADMIN');
    const bea = await passwordUser('bea@example.com', home.id);

    const join = (inviteToken: string) =>
      inject(app, {
        method: 'POST',
        url: '/api/auth/me/memberships',
        cookie: authCookie(app, bea),
        payload: { departmentId: dept.id, inviteToken, stufen: [] },
      });

    expect((await join(BASE)).statusCode).toBe(200);
    const removed = await inject(app, {
      method: 'DELETE',
      url: `/api/departments/current/people/${bea.id}`,
      tenant: dept.slug,
      cookie: authCookie(app, leader),
    });
    expect(removed.statusCode).toBe(200);
    const member = await app.prisma.departmentMember.findUniqueOrThrow({
      where: { departmentId_userId: { departmentId: dept.id, userId: bea.id } },
    });
    expect(member.joinedAt).toBeNull();
    expect(member.removedAt).not.toBeNull();

    const blocked = await join(BASE);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('INVITE_REMOVED');

    const fresh = createDepartmentInviteToken(dept.id, BASE, 'MEMBER', 'bea@example.com');
    expect((await join(fresh)).statusCode).toBe(200);
    const rejoined = await app.prisma.departmentMember.findUniqueOrThrow({ where: { id: member.id } });
    expect(rejoined.joinedAt).not.toBeNull();
    expect(rejoined.confirmedAt).not.toBeNull();
  });

  it('lässt Beitritte aus der Verbands-DB nicht durch die Leitung entfernen', async () => {
    const dept = await createDepartment(app);
    const leader = await passwordUser('leitung@example.com', dept.id);
    await addMember(app, dept.id, leader.id, 'ADMIN');
    const carla = await createUser(app, { providerId: '4711' });
    await app.prisma.departmentMember.create({
      data: { departmentId: dept.id, userId: carla.id, joinedAt: new Date(), confirmedAt: new Date(), joinSource: 'CEVIDB' },
    });
    const res = await inject(app, {
      method: 'DELETE',
      url: `/api/departments/current/people/${carla.id}`,
      tenant: dept.slug,
      cookie: authCookie(app, leader),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('FROM_PROVIDER');
  });

  it('legt bei der Registrierung auf einer Abteilung keinen Gast-Eintrag an (E-Mail noch unbestätigt)', async () => {
    const dept = await createDepartment(app);
    const res = await inject(app, {
      method: 'POST',
      url: '/api/auth/register-helper',
      tenant: dept.slug,
      payload: { email: 'neu@example.com', password: 'ein-langes-passwort-123', firstName: 'Neue' },
    });
    expect(res.statusCode).toBe(200);
    expect(await app.prisma.departmentMember.count({ where: { departmentId: dept.id } })).toBe(0);
  });

  it('nimmt die Einladung beim Verbands-Login mit (auch auf die Fehlerseite)', async () => {
    const res = await inject(app, {
      method: 'GET',
      url: `/api/auth/cevidb/login?org=cevi&invite=${encodeURIComponent(`${BASE}.MEMBER.abc.def`)}`,
    });
    expect(res.statusCode).toBe(302);
    const location = String(res.headers.location);
    // Ohne Zugangsdaten in der Testumgebung: Fehlerseite, mit Konfiguration: state-Cookie mit Einladung
    if (location.includes('error=')) {
      expect(location).toContain(`invite=${encodeURIComponent(`${BASE}.MEMBER.abc.def`)}`);
    } else {
      const cookie = String(res.headers['set-cookie'] ?? '');
      const state = /cevidb_oauth_state=([^;]+)/.exec(cookie)?.[1] ?? '';
      expect(JSON.parse(Buffer.from(state, 'base64url').toString('utf8')).invite).toBe(`${BASE}.MEMBER.abc.def`);
    }
  });
});
