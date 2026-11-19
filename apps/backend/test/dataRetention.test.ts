import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sentInactiveMails: string[] = [];
vi.mock('../src/services/email.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/email.js')>();
  return {
    ...actual,
    sendInactiveAccountEmail: vi.fn(async ({ to }: { to: string }) => {
      sentInactiveMails.push(to);
      return true;
    }),
  };
});

import { runDataRetention, lastActivity, LAST_SEEN_TRACKING_START } from '../src/services/dataRetention.js';
import { DELETED_PERSON_LABEL } from '../src/services/userErasure.js';
import {
  addMember,
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

describe('lastActivity', () => {
  it('nimmt ohne letzte Nutzung den späteren von Konto-Erstellung und Erfassungsbeginn', () => {
    const old = new Date('2020-01-01T00:00:00Z');
    expect(lastActivity({ lastSeenOn: null, createdAt: old })).toEqual(LAST_SEEN_TRACKING_START);
    const recent = new Date('2027-03-01T00:00:00Z');
    expect(lastActivity({ lastSeenOn: null, createdAt: recent })).toEqual(recent);
    expect(lastActivity({ lastSeenOn: old, createdAt: recent })).toEqual(old);
  });
});

describe.skipIf(!hasTestDb)('Datenschutz: Löschung und Aufbewahrung', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    sentInactiveMails.length = 0;
    await resetDb(app);
  });

  async function seedTraces(userId: string, name: string) {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    await app.prisma.shiftSignupLog.create({
      data: { eventId: event.id, shiftId: shift.id, action: 'SIGNUP', helperUserId: userId, helperName: name, shiftTitle: 'Bar' },
    });
    await app.prisma.eventMessage.create({
      data: {
        eventId: event.id,
        sentByUserId: userId,
        sentByName: name,
        subject: 'Hallo',
        body: 'Text',
        target: 'ALL',
        targetLabel: 'Alle',
        recipientCount: 2,
        recipientUserIds: [userId, 'andere-id'],
      },
    });
    await app.prisma.departmentAuditLog.create({
      data: { departmentId: department.id, actorName: 'Leitung', action: 'PERMISSIONS_SET', targetUserId: userId, targetLabel: name, details: { email: 'x@y.ch' } },
    });
    await app.prisma.adminAuditLog.create({
      data: { adminName: 'Admin', action: 'USER_ADMIN_GRANT', targetType: 'USER', targetId: userId, targetLabel: name, ip: '1.2.3.4' },
    });
    return { department, event, shift };
  }

  it('Selbstlöschung entfernt Namen und IDs aus Protokollen und Nachrichten', async () => {
    const user = await createUser(app, { passwordHash: 'x', firstName: 'Anna', lastName: 'Muster' });
    await seedTraces(user.id, 'Anna Muster');

    const res = await inject(app, { method: 'DELETE', url: '/api/auth/me', cookie: authCookie(app, user) });
    expect(res.statusCode).toBe(200);

    const log = await app.prisma.shiftSignupLog.findFirstOrThrow();
    expect(log).toMatchObject({ helperUserId: null, helperName: DELETED_PERSON_LABEL });
    const message = await app.prisma.eventMessage.findFirstOrThrow();
    expect(message).toMatchObject({ sentByUserId: null, sentByName: DELETED_PERSON_LABEL, recipientUserIds: ['andere-id'] });
    const deptLog = await app.prisma.departmentAuditLog.findFirstOrThrow();
    expect(deptLog).toMatchObject({ targetUserId: null, targetLabel: DELETED_PERSON_LABEL, details: null });
    const adminLog = await app.prisma.adminAuditLog.findFirstOrThrow();
    expect(adminLog).toMatchObject({ targetId: null, targetLabel: DELETED_PERSON_LABEL });
    const all = JSON.stringify([log, message, deptLog, adminLog]);
    expect(all).not.toContain('Anna');
    expect(all).not.toContain(user.id);
  });

  it('löscht alte Protokolle und Nachrichten und entfernt alte IP-Adressen', async () => {
    const user = await createUser(app);
    await seedTraces(user.id, 'Test Person');
    // Anlass endet 2030-06-02; ein Jahr und ein Tag später
    const now = new Date('2031-06-04T00:00:00Z');
    await app.prisma.departmentAuditLog.updateMany({ data: { createdAt: new Date('2029-01-01T00:00:00Z') } });
    await app.prisma.adminAuditLog.updateMany({ data: { createdAt: new Date('2031-01-01T00:00:00Z') } });

    const result = await runDataRetention(app.prisma, undefined, now);
    expect(result).toMatchObject({ signupLogs: 1, messages: 1, auditLogs: 1, auditIps: 1 });
    expect(await app.prisma.shiftSignupLog.count()).toBe(0);
    expect(await app.prisma.eventMessage.count()).toBe(0);
    expect(await app.prisma.departmentAuditLog.count()).toBe(0);
    expect(await app.prisma.adminAuditLog.findFirstOrThrow()).toMatchObject({ ip: null });
  });

  it('kündigt inaktive Konten an, löscht sie nach 30 Tagen und lässt die Eintragung anonym stehen', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const user = await createUser(app, { firstName: 'Inaktiv', lastName: 'Person', phone: '079 000 00 00' });
    await app.prisma.user.update({ where: { id: user.id }, data: { lastSeenOn: new Date('2028-01-01') } });
    const signup = await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: user.id, notes: 'privat' } });
    const active = await createUser(app);
    await app.prisma.user.update({ where: { id: active.id }, data: { lastSeenOn: new Date('2030-11-01') } });

    const now = new Date('2030-12-01T00:00:00Z');
    const first = await runDataRetention(app.prisma, undefined, now);
    expect(first).toMatchObject({ warned: 1, deletedAccounts: 0 });
    expect(sentInactiveMails).toEqual([user.email]);

    // Noch in der Frist: nichts passiert, keine zweite Mail
    const second = await runDataRetention(app.prisma, undefined, new Date('2030-12-20T00:00:00Z'));
    expect(second).toMatchObject({ warned: 0, deletedAccounts: 0 });

    const third = await runDataRetention(app.prisma, undefined, new Date('2031-01-02T00:00:00Z'));
    expect(third).toMatchObject({ deletedAccounts: 1 });
    expect(await app.prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await app.prisma.user.findUnique({ where: { id: active.id } })).not.toBeNull();

    const kept = await app.prisma.shiftSignup.findUniqueOrThrow({ where: { id: signup.id } });
    expect(kept).toMatchObject({ userId: null, guestName: DELETED_PERSON_LABEL, guestPhone: null, notes: null });
  });

  it('löscht Konten ohne E-Mail direkt, verschont aber die einzige Leitung', async () => {
    const department = await createDepartment(app);
    const leader = await createUser(app, { email: null });
    const guest = await createUser(app, { email: null, nickname: 'Schnägg' });
    await addMember(app, department.id, leader.id, 'ADMIN');
    await app.prisma.user.updateMany({ data: { lastSeenOn: new Date('2027-01-01') } });

    const result = await runDataRetention(app.prisma, undefined, new Date('2030-12-01T00:00:00Z'));
    expect(result).toMatchObject({ warned: 0, deletedAccounts: 1 });
    expect(await app.prisma.user.findUnique({ where: { id: guest.id } })).toBeNull();
    expect(await app.prisma.user.findUnique({ where: { id: leader.id } })).not.toBeNull();
  });

  it('verlangt die Einwilligung für Gesundheitsangaben und speichert den Zeitpunkt', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const user = await createUser(app);
    const question = await app.prisma.eventQuestion.create({
      data: { eventId: event.id, label: 'Allergien', retentionDays: 0, sensitive: true },
    });
    const put = (body: object) =>
      inject(app, {
        method: 'PUT',
        url: `/api/events/${event.slug}/participation`,
        tenant: department.slug,
        cookie: authCookie(app, user),
        payload: body,
      });

    const without = await put({ answers: { [question.id]: 'Nüsse' } });
    expect(without.statusCode).toBe(400);
    expect(await app.prisma.eventAnswer.count()).toBe(0);

    const withConsent = await put({ answers: { [question.id]: 'Nüsse' }, sensitiveConsent: true });
    expect(withConsent.statusCode).toBe(200);
    const answer = await app.prisma.eventAnswer.findFirstOrThrow();
    expect(answer.consentAt).toBeInstanceOf(Date);
  });

  it('lehnt sensible Fragen ohne Löschfrist ab', async () => {
    const { UpdateEventSchema } = await import('@schichtplan/shared');
    const parsed = UpdateEventSchema.safeParse({ questions: [{ label: 'Allergien', sensitive: true, retentionDays: null }] });
    expect(parsed.success).toBe(false);
    const ok = UpdateEventSchema.safeParse({ questions: [{ label: 'Allergien', sensitive: true, retentionDays: 30 }] });
    expect(ok.success).toBe(true);
  });

  it('liefert die eigenen Daten als JSON-Download', async () => {
    const user = await createUser(app, { firstName: 'Export', lastName: 'Person' });
    const res = await inject(app, { method: 'GET', url: '/api/auth/me/export', cookie: authCookie(app, user) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    const body = res.json();
    expect(body).toMatchObject({ id: user.id, firstName: 'Export', email: user.email });
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });
});
