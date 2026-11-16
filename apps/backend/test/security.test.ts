import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPendingLink, PENDING_LINK_COOKIE } from '../src/services/authSession.js';
import { mergeCeviNameProfilesInto } from '../src/services/mergeProfiles.js';
import { totpCode, totpStep } from '../src/services/twoFactor.js';
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

describe.skipIf(!hasTestDb)('Sicherheit der API', () => {
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

  describe('Anmeldung', () => {
    it('lehnt Tokens gelöschter Konten ab', async () => {
      const user = await createUser(app);
      const cookie = authCookie(app, user);
      await app.prisma.user.delete({ where: { id: user.id } });
      const res = await inject(app, { method: 'GET', url: '/api/auth/me', cookie });
      expect(res.statusCode).toBe(401);
    });

    it('nimmt globale Admin-Rechte aus der DB, nicht aus dem Token', async () => {
      const department = await createDepartment(app);
      const user = await createUser(app, { isGlobalAdmin: false });
      // Token behauptet Admin, die DB sagt nein
      const cookie = authCookie(app, { ...user, isGlobalAdmin: true });
      const res = await inject(app, {
        method: 'POST',
        url: '/api/tasks',
        tenant: department.slug,
        cookie,
        payload: { title: 'Grill' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('signiert Tokens mit Ablaufdatum', async () => {
      const user = await createUser(app);
      const token = authCookie(app, user).slice('token='.length);
      const payload = app.jwt.decode<{ exp?: number }>(token);
      expect(payload?.exp).toBeTypeOf('number');
    });

    it('bremst das Durchprobieren von Passwörtern', async () => {
      const passwordHash = await bcrypt.hash('richtiges-passwort', 4);
      const user = await createUser(app, { passwordHash });
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await inject(app, {
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: user.email, password: `falsch-${i}` },
          remoteAddress: `10.0.0.${i}`,
        });
        statuses.push(res.statusCode);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.at(-1)).toBe(429);

      // Auch das richtige Passwort wartet, bis die Sperre vorbei ist
      const blocked = await inject(app, {
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: 'richtiges-passwort' },
      });
      expect(blocked.statusCode).toBe(429);
    });

    it('liefert das Token nicht im JSON aus', async () => {
      const passwordHash = await bcrypt.hash('richtiges-passwort', 4);
      const user = await createUser(app, { passwordHash });
      const res = await inject(app, {
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: 'richtiges-passwort' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().token).toBeUndefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('übernimmt bei der Registrierung kein bestehendes Konto ohne Passwort', async () => {
      const profile = await createUser(app, { email: 'opfer@example.com', emailVerified: false, ceviName: 'Opfer' });
      const res = await inject(app, {
        method: 'POST',
        url: '/api/auth/register-helper',
        payload: { email: 'opfer@example.com', password: 'geheim12345', firstName: 'Fremd', lastName: 'Person' },
      });
      // Gleiche Antwort wie bei einem neuen Konto (verrät nicht, dass es die E-Mail schon gibt)
      expect(res.statusCode).toBe(200);
      expect(res.json().requiresVerification).toBe(true);
      const after = await app.prisma.user.findUniqueOrThrow({ where: { id: profile.id } });
      expect(after.passwordHash).toBeNull();
      expect(after.firstName).toBe('Test');
    });

    it('markiert eine selbst eingetragene E-Mail als unbestätigt', async () => {
      const user = await createUser(app, { email: null, ceviDbId: 4711, emailVerified: true });
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/auth/me',
        cookie: authCookie(app, user),
        payload: { email: 'neu@example.com' },
      });
      expect(res.statusCode).toBe(200);
      const after = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.email).toBe('neu@example.com');
      expect(after.emailVerified).toBe(false);
    });

    it('lässt das Geburtsdatum aus Cevi.DB nicht überschreiben', async () => {
      const user = await createUser(app, { ceviDbId: 4712, birthDate: new Date('2010-01-01T00:00:00Z') });
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/auth/me',
        cookie: authCookie(app, user),
        payload: { birthDate: '1990-01-01' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('CORS', () => {
    it('erlaubt Cookies nur für die eigene Domain', async () => {
      const own = await inject(app, {
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://illnau.cevi-schichtplan.ch' },
      });
      expect(own.headers['access-control-allow-origin']).toBe('https://illnau.cevi-schichtplan.ch');

      const foreign = await inject(app, { method: 'GET', url: '/health', headers: { origin: 'https://evil.example' } });
      expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Datenschutz', () => {
    it('zeigt die Mitgliederliste (mit E-Mails) nur Planenden', async () => {
      const department = await createDepartment(app);
      const helper = await createUser(app, { homeDepartmentId: department.id });
      await addMember(app, department.id, helper.id, 'HELPER');
      const outsider = await createUser(app);

      for (const user of [helper, outsider]) {
        const res = await inject(app, {
          method: 'GET',
          url: '/api/departments/current/members',
          tenant: department.slug,
          cookie: authCookie(app, user),
        });
        expect(res.statusCode).toBe(403);
      }

      const okLead = await createUser(app);
      await createEvent(app, department.id, { organizerId: okLead.id });
      const ok = await inject(app, {
        method: 'GET',
        url: '/api/departments/current/members',
        tenant: department.slug,
        cookie: authCookie(app, okLead),
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().some((m: { userId: string }) => m.userId === helper.id)).toBe(true);
    });

    it('zeigt Vorlagen nur Planenden', async () => {
      const department = await createDepartment(app);
      const anonymous = await inject(app, { method: 'GET', url: '/api/event-templates', tenant: department.slug });
      expect(anonymous.statusCode).toBe(401);

      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const res = await inject(app, {
        method: 'GET',
        url: '/api/event-templates',
        tenant: department.slug,
        cookie: authCookie(app, admin),
      });
      expect(res.statusCode).toBe(200);
    });

    it('liefert beim Bearbeiten einer Schicht keine Passwort-Hashes aus', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const event = await createEvent(app, department.id);
      const shift = await createShift(app, event.id);
      const helper = await createUser(app, { passwordHash: await bcrypt.hash('x', 4) });
      await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: helper.id, taskId: shift.tasks[0].id } });

      const res = await inject(app, {
        method: 'PATCH',
        url: `/api/shifts/${shift.id}`,
        tenant: department.slug,
        cookie: authCookie(app, admin),
        payload: { title: 'Bar neu' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('passwordHash');
      expect(res.body).not.toContain(helper.email!);
    });
  });

  describe('Uploads', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>').toString('base64');
    const evilSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');

    it('erlaubt Uploads nur Planenden', async () => {
      const helper = await createUser(app);
      const res = await inject(app, {
        method: 'POST',
        url: '/api/uploads',
        cookie: authCookie(app, helper),
        payload: { filename: 'x.svg', mimeType: 'image/svg+xml', base64: svg },
      });
      expect(res.statusCode).toBe(403);
    });

    it('lehnt SVGs mit Skripten und getarnte Dateien ab', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const upload = (payload: object) =>
        inject(app, { method: 'POST', url: '/api/uploads', cookie: authCookie(app, admin), payload });

      expect((await upload({ filename: 'x.svg', mimeType: 'image/svg+xml', base64: evilSvg })).statusCode).toBe(400);
      const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
      expect((await upload({ filename: 'x.png', mimeType: 'image/png', base64: html })).statusCode).toBe(400);
      // Gültiges SVG, aber als PNG ausgegeben
      expect((await upload({ filename: 'x.png', mimeType: 'image/png', base64: svg })).statusCode).toBe(400);
      expect(await app.prisma.upload.count()).toBe(0);
    });

    it('nimmt grosse Bodies nur auf der Upload-Route an', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/departments/current',
        tenant: department.slug,
        cookie: authCookie(app, admin),
        payload: { name: 'x'.repeat(3 * 1024 * 1024) },
      });
      expect(res.statusCode).toBe(413);
    });

    it('liefert hochgeladene Bilder in einer Sandbox aus', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const upload = await inject(app, {
        method: 'POST',
        url: '/api/uploads',
        cookie: authCookie(app, admin),
        payload: { filename: 'x.svg', mimeType: 'image/svg+xml', base64: svg },
      });
      expect(upload.statusCode).toBe(200);

      const res = await inject(app, { method: 'GET', url: upload.json().url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-security-policy']).toContain('sandbox');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('Eintragen', () => {
    it('verlangt bei Mindestalter ein Geburtsdatum', async () => {
      const department = await createDepartment(app);
      const event = await createEvent(app, department.id);
      const shift = await createShift(app, event.id, { minAge: 18 });
      const user = await createUser(app, { birthDate: null });

      const res = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: department.slug,
        cookie: authCookie(app, user),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'MISSING_INFO', missingFields: ['BIRTH_DATE'] });

      await app.prisma.user.update({ where: { id: user.id }, data: { birthDate: new Date('2015-01-01T00:00:00Z') } });
      const tooYoung = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: department.slug,
        cookie: authCookie(app, user),
        payload: {},
      });
      expect(tooYoung.statusCode).toBe(403);

      await app.prisma.user.update({ where: { id: user.id }, data: { birthDate: new Date('1990-01-01T00:00:00Z') } });
      const ok = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: department.slug,
        cookie: authCookie(app, user),
        payload: {},
      });
      expect(ok.statusCode).toBe(200);
    });
  });

  describe('Eingaben', () => {
    it('lehnt gefährliche Bild-Adressen und Farben ab', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const cookie = authCookie(app, admin);

      for (const payload of [
        { logoUrl: 'javascript:alert(1)' },
        { logoUrl: '//evil.example/x.png' },
        { primaryColor: 'red;background:url(x)' },
      ]) {
        const res = await inject(app, { method: 'PATCH', url: '/api/departments/current', tenant: department.slug, cookie, payload });
        expect(res.statusCode).toBe(400);
      }

      const ok = await inject(app, {
        method: 'PATCH',
        url: '/api/departments/current',
        tenant: department.slug,
        cookie,
        payload: { logoUrl: '/api/uploads/abc', primaryColor: '#2563eb' },
      });
      expect(ok.statusCode).toBe(200);
    });

    it('lässt globale Admins die Abteilung bearbeiten, auch ohne Mitgliedschaft', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app, { isGlobalAdmin: true });
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/departments/current',
        tenant: department.slug,
        cookie: authCookie(app, admin),
        payload: { name: 'Neuer Name' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Helfer-Pool', () => {
    it('zeigt mit ?alle=1 nur die eigene Abteilung ohne Zugang, nie fremde Abteilungen', async () => {
      const host = await createDepartment(app);
      const other = await createDepartment(app);
      const ok = await createUser(app, { homeDepartmentId: host.id });
      const event = await createEvent(app, host.id, { accessType: 'WHITELIST_CEVIDB', organizerId: ok.id });
      await app.prisma.eventAllowedDepartment.create({ data: { eventId: event.id, departmentId: other.id } });

      // Eigene Abteilung ohne Cevi.DB: kein Zugang, darf aber eingeteilt werden
      const ownNoAccess = await createUser(app, { homeDepartmentId: host.id });
      // Fremde Abteilung ohne Cevi.DB: kein Zugang, darf nie erscheinen
      const otherNoAccess = await createUser(app, { homeDepartmentId: other.id });
      // Fremde Abteilung mit Cevi.DB: hat Zugang
      const otherAccess = await createUser(app, { homeDepartmentId: other.id, ceviDbId: 990001, homeDepartmentSource: 'CEVIDB' });
      // Ohne Bezug zur Abteilung
      const stranger = await createUser(app);

      const cookie = authCookie(app, ok);
      const ids = async (url: string) => {
        const res = await inject(app, { method: 'GET', url, tenant: host.slug, cookie });
        expect(res.statusCode).toBe(200);
        return new Map<string, boolean>(res.json().items.map((i: { userId: string; hasAccess: boolean }) => [i.userId, i.hasAccess]));
      };

      const normal = await ids(`/api/events/${event.slug}/roster`);
      expect(normal.has(ownNoAccess.id)).toBe(false);
      // Freigegebene Abteilung: nicht pauschal (die Freigabe setzt die Gastgeber-Abteilung allein)
      expect(normal.has(otherAccess.id)).toBe(false);

      const all = await ids(`/api/events/${event.slug}/roster?alle=1`);
      expect(all.get(ownNoAccess.id)).toBe(false);
      expect(all.has(otherAccess.id)).toBe(false);
      expect(all.has(otherNoAccess.id)).toBe(false);
      expect(all.has(stranger.id)).toBe(false);

      // Erst mit eigenem Bezug zum Anlass (eingetragen) erscheint die Person
      const shift = await createShift(app, event.id);
      await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: otherAccess.id } });
      const afterSignup = await ids(`/api/events/${event.slug}/roster`);
      expect(afterSignup.get(otherAccess.id)).toBe(true);
    });

    it('lässt Personen freigegebener Abteilungen ohne Bezug weder einteilen noch anschreiben', async () => {
      const host = await createDepartment(app);
      const other = await createDepartment(app);
      const ok = await createUser(app, { homeDepartmentId: host.id });
      const event = await createEvent(app, host.id, { accessType: 'WHITELIST_CEVIDB', organizerId: ok.id });
      await app.prisma.eventAllowedDepartment.create({ data: { eventId: event.id, departmentId: other.id } });
      const otherPerson = await createUser(app, { homeDepartmentId: other.id, ceviDbId: 990002, homeDepartmentSource: 'CEVIDB' });
      const shift = await createShift(app, event.id);
      const cookie = authCookie(app, ok);

      const assign = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: host.slug,
        cookie,
        payload: { userId: otherPerson.id },
      });
      expect(assign.statusCode).toBe(400);

      const message = await inject(app, {
        method: 'POST',
        url: `/api/events/${event.slug}/messages`,
        tenant: host.slug,
        cookie,
        payload: { subject: 'Hallo', body: 'Test', target: 'USERS', userIds: [otherPerson.id], dryRun: true },
      });
      expect(message.statusCode).toBe(400);

      const open = await inject(app, {
        method: 'POST',
        url: `/api/events/${event.slug}/messages`,
        tenant: host.slug,
        cookie,
        payload: { subject: 'Hallo', body: 'Test', target: 'OPEN', dryRun: true },
      });
      expect(open.statusCode).toBe(200);
      // Nur das OK selbst, niemand aus der freigegebenen Abteilung
      expect(open.json().recipientCount).toBe(1);
    });

    it('verweigert den Pool ohne OK- oder Leitungsrolle', async () => {
      const host = await createDepartment(app);
      const event = await createEvent(app, host.id);
      const helper = await createUser(app, { homeDepartmentId: host.id });
      await addMember(app, host.id, helper.id, 'HELPER');
      const res = await inject(app, {
        method: 'GET',
        url: `/api/events/${event.slug}/roster?alle=1`,
        tenant: host.slug,
        cookie: authCookie(app, helper),
      });
      expect(res.statusCode).toBe(403);
    });
  });
  describe('Fremde Personen', () => {
    it('Kollisionsprüfung: nur mit Einteilrecht, nur Personen mit Bezug, fremde Anlässe ohne Titel', async () => {
      const host = await createDepartment(app);
      const foreign = await createDepartment(app);
      const ok = await createUser(app, { homeDepartmentId: host.id });
      const viewer = await createUser(app, { homeDepartmentId: host.id });
      await addMember(app, host.id, viewer.id, 'HELPER', ['EVENTS_VIEW_ALL']);
      const event = await createEvent(app, host.id, { organizerId: ok.id });
      const shift = await createShift(app, event.id);

      const stranger = await createUser(app);
      const member = await createUser(app, { homeDepartmentId: host.id });
      // Das Mitglied hat zur gleichen Zeit eine Schicht in einem Anlass einer fremden Abteilung
      const foreignEvent = await createEvent(app, foreign.id);
      const foreignShift = await createShift(app, foreignEvent.id, { title: 'Geheime Bar' });
      await app.prisma.shiftSignup.create({ data: { shiftId: foreignShift.id, userId: member.id } });

      const check = (cookie: string, userId: string) =>
        inject(app, { method: 'GET', url: `/api/shifts/${shift.id}/check-collision?userId=${userId}`, tenant: host.slug, cookie });

      expect((await check(authCookie(app, viewer), member.id)).statusCode).toBe(403);
      expect((await check(authCookie(app, ok), stranger.id)).statusCode).toBe(400);

      const res = await check(authCookie(app, ok), member.id);
      expect(res.statusCode).toBe(200);
      expect(res.json().hasCollision).toBe(true);
      expect(JSON.stringify(res.json())).not.toContain('Geheime Bar');
    });

    it('Abmelden geht nur für Personen mit Bezug zum Anlass', async () => {
      const host = await createDepartment(app);
      const ok = await createUser(app, { homeDepartmentId: host.id });
      const event = await createEvent(app, host.id, { organizerId: ok.id });
      const stranger = await createUser(app, { firstName: 'Fremda' });

      const res = await inject(app, {
        method: 'POST',
        url: `/api/events/${event.slug}/deregistrations`,
        tenant: host.slug,
        cookie: authCookie(app, ok),
        payload: { userId: stranger.id },
      });
      expect(res.statusCode).toBe(400);
      expect(res.body).not.toContain('Fremda');
      expect(await app.prisma.eventDeregistration.count()).toBe(0);
    });

    it('«Noch ohne Schicht» geht nicht pauschal an globale Admins', async () => {
      const host = await createDepartment(app);
      const ok = await createUser(app, { homeDepartmentId: host.id });
      const event = await createEvent(app, host.id, { accessType: 'DEPARTMENT', organizerId: ok.id });
      await createShift(app, event.id);
      const globalAdmin = await createUser(app, { isGlobalAdmin: true });
      await addMember(app, host.id, globalAdmin.id, 'HELPER');
      await createUser(app, { homeDepartmentId: host.id });

      const res = await inject(app, {
        method: 'POST',
        url: `/api/events/${event.slug}/messages`,
        tenant: host.slug,
        cookie: authCookie(app, ok),
        payload: { subject: 'Hallo', body: 'Test', target: 'OPEN', dryRun: true },
      });
      expect(res.statusCode).toBe(200);
      // Helfer*in und OK, nicht der globale Admin
      expect(res.json().recipientCount).toBe(2);
    });
  });

  describe('Eintragen und Austragen', () => {
    it('erlaubt Überlappung bis zur Übergabe-Toleranz auch beim Speichern', async () => {
      const host = await createDepartment(app);
      const event = await createEvent(app, host.id);
      const first = await createShift(app, event.id, {
        startTime: new Date('2030-06-01T08:00:00Z'),
        endTime: new Date('2030-06-01T10:10:00Z'),
      });
      const second = await createShift(app, event.id, {
        startTime: new Date('2030-06-01T10:00:00Z'),
        endTime: new Date('2030-06-01T12:00:00Z'),
      });
      const user = await createUser(app, { homeDepartmentId: host.id, birthDate: new Date('1990-01-01T00:00:00Z') });
      const cookie = authCookie(app, user);

      for (const shift of [first, second]) {
        const res = await inject(app, { method: 'POST', url: `/api/shifts/${shift.id}/signup`, tenant: host.slug, cookie, payload: {} });
        expect(res.statusCode).toBe(200);
      }
    });

    it('trägt über signupId nur aus der Schicht in der Adresse aus', async () => {
      const host = await createDepartment(app);
      const ok = await createUser(app, { homeDepartmentId: host.id });
      const event = await createEvent(app, host.id, { organizerId: ok.id });
      const shiftA = await createShift(app, event.id);
      const shiftB = await createShift(app, event.id, {
        startTime: new Date('2030-06-02T08:00:00Z'),
        endTime: new Date('2030-06-02T10:00:00Z'),
      });
      const helper = await createUser(app, { homeDepartmentId: host.id });
      const signup = await app.prisma.shiftSignup.create({ data: { shiftId: shiftB.id, userId: helper.id } });

      const wrong = await inject(app, {
        method: 'DELETE',
        url: `/api/shifts/${shiftA.id}/signup?signupId=${signup.id}`,
        tenant: host.slug,
        cookie: authCookie(app, ok),
      });
      expect(wrong.statusCode).toBe(404);
      expect(await app.prisma.shiftSignup.count({ where: { id: signup.id } })).toBe(1);

      const right = await inject(app, {
        method: 'DELETE',
        url: `/api/shifts/${shiftB.id}/signup?signupId=${signup.id}`,
        tenant: host.slug,
        cookie: authCookie(app, ok),
      });
      expect(right.statusCode).toBe(200);
    });
  });

  describe('Security-Audit 2026-11-16', () => {
    it('verbietet das Setzen eines Passworts bei unbestätigter E-Mail-Adresse (kein E-Mail-Squatting)', async () => {
      const guest = await createUser(app, { email: 'fremd@example.com', emailVerified: false, passwordHash: null, ceviName: 'Fuchs' });
      const res = await inject(app, {
        method: 'POST',
        url: '/api/auth/me/password',
        cookie: authCookie(app, guest),
        payload: { newPassword: 'neues-passwort-123' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
      const after = await app.prisma.user.findUniqueOrThrow({ where: { id: guest.id } });
      expect(after.emailVerified).toBe(false);
      expect(after.passwordHash).toBeNull();
    });

    it('stellt keinen Passwort-Reset für unbestätigte E-Mails aus und löscht Reset-Tokens beim E-Mail-Wechsel', async () => {
      const unverified = await createUser(app, { email: 'unbestaetigt@example.com', emailVerified: false, passwordHash: null });
      const reqRes = await inject(app, {
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: { email: 'unbestaetigt@example.com' },
      });
      expect(reqRes.statusCode).toBe(200);
      expect(await app.prisma.passwordResetToken.count({ where: { userId: unverified.id } })).toBe(0);

      // Bestehendes Reset-Token muss beim Ändern der E-Mail verfallen
      await app.prisma.passwordResetToken.create({
        data: { userId: unverified.id, tokenHash: 'abc123hash', expiresAt: new Date(Date.now() + 3600_000) },
      });
      await app.prisma.user.update({ where: { id: unverified.id }, data: { email: null } });
      const patchRes = await inject(app, {
        method: 'PATCH',
        url: '/api/auth/me',
        cookie: authCookie(app, unverified),
        payload: { email: 'andere@example.com' },
      });
      expect(patchRes.statusCode).toBe(200);
      expect(await app.prisma.passwordResetToken.count({ where: { userId: unverified.id } })).toBe(0);
    });

    it('verlangt beim Verknüpfen eines 2FA-geschützten Passwort-Kontos den 2FA-Code vor dem Speichern von providerId', async () => {
      const passwordHash = await bcrypt.hash('mein-passwort-123', 4);
      const user = await createUser(app, { email: 'twofa-link@example.com', passwordHash, emailVerified: true });
      const userCookie = authCookie(app, user);
      const setupRes = await inject(app, {
        method: 'POST',
        url: '/api/auth/2fa/setup',
        cookie: userCookie,
        payload: { currentPassword: 'mein-passwort-123' },
      });
      const secret = (setupRes.json().secret as string).replace(/ /g, '');
      const step = totpStep();
      await inject(app, {
        method: 'POST',
        url: '/api/auth/2fa/enable',
        cookie: userCookie,
        payload: { code: totpCode(secret, step) },
      });

      const linkToken = createPendingLink({
        profile: { id: 777888, email: 'twofa-link@example.com', first_name: 'Anna', last_name: 'Test' },
        returnTo: '/',
        tenantSlug: null,
        userId: user.id,
        provider: 'CEVI',
      });

      // Nur Passwort ohne 2FA-Code: abgelehnt und providerId noch NICHT in DB geschrieben
      const noCode = await inject(app, {
        method: 'POST',
        url: '/api/auth/cevidb/link',
        cookie: `${PENDING_LINK_COOKIE}=${linkToken}`,
        payload: { password: 'mein-passwort-123' },
      });
      expect(noCode.statusCode).toBe(401);
      expect(noCode.json().code).toBe('TWO_FACTOR_REQUIRED');
      const before = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(before.providerId).toBeNull();

      // Mit gültigem 2FA-Code: Verknüpfung wird gespeichert
      const withCode = await inject(app, {
        method: 'POST',
        url: '/api/auth/cevidb/link',
        cookie: `${PENDING_LINK_COOKIE}=${linkToken}`,
        payload: { password: 'mein-passwort-123', code: totpCode(secret, step + 1) },
      });
      expect(withCode.statusCode).toBe(200);
      const after = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.providerId).toBe('777888');
    });

    it('erlaubt im OK nur Personen mit Bezug zur Abteilung oder zum Anlass', async () => {
      const host = await createDepartment(app);
      const foreign = await createDepartment(app);
      const lead = await createUser(app, { homeDepartmentId: host.id, passwordHash: 'x' });
      await addMember(app, host.id, lead.id, 'ADMIN');
      const event = await createEvent(app, host.id, { organizerId: lead.id });
      const stranger = await createUser(app, {
        email: 'stranger@example.com',
        nickname: 'Einzigartig',
        passwordHash: 'x',
        homeDepartmentId: foreign.id,
      });

      for (const payload of [
        { userId: stranger.id, role: 'OK_MEMBER' },
        { email: 'stranger@example.com', role: 'OK_MEMBER' },
        { nickname: 'Einzigartig', role: 'OK_MEMBER' },
      ]) {
        const res = await inject(app, {
          method: 'POST',
          url: `/api/events/${event.slug}/organizers`,
          tenant: host.slug,
          cookie: authCookie(app, lead),
          payload,
        });
        expect([400, 404]).toContain(res.statusCode);
      }
      expect(await app.prisma.eventOrganizer.count({ where: { eventId: event.id, userId: stranger.id } })).toBe(0);
    });

    it('verhindert das Verknüpfen fremder Hitobito-Gruppen bei Stufen', async () => {
      const dept = await createDepartment(app);
      await app.prisma.department.update({ where: { id: dept.id }, data: { hitobitoGroupId: 100 } });
      await app.prisma.hitobitoGroup.createMany({
        data: [
          { provider: 'CEVI', id: 100, name: 'Abteilung A', ortsgruppeId: 100, jungscharId: null, jungscharCount: 0, fetchedAt: new Date() },
          { provider: 'CEVI', id: 200, name: 'Fremde Stufe', ortsgruppeId: 999, jungscharId: null, jungscharCount: 0, fetchedAt: new Date() },
        ],
      });
      const admin = await createUser(app, { homeDepartmentId: dept.id });
      await addMember(app, dept.id, admin.id, 'ADMIN');

      const res = await inject(app, {
        method: 'POST',
        url: '/api/departments/current/stufen',
        tenant: dept.slug,
        cookie: authCookie(app, admin),
        payload: { name: 'Pios', hitobitoGroupId: 200 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('verwirft beim Merge eines Spitznamen-Profils dessen calendarToken und Push-Abos und setzt resetNotice', async () => {
      const dept = await createDepartment(app);
      const birthDate = new Date('2005-06-15T00:00:00Z');
      const guest = await createUser(app, {
        email: null,
        passwordHash: null,
        providerId: null,
        nickname: 'Biber',
        birthDate,
        homeDepartmentId: dept.id,
      });
      await app.prisma.user.update({ where: { id: guest.id }, data: { calendarToken: '0123456789abcdef0123456789abcdef' } });
      await app.prisma.pushSubscription.create({
        data: { userId: guest.id, endpoint: 'https://push.example/evil', p256dh: 'k1', auth: 'a1' },
      });

      const real = await createUser(app, {
        email: 'biber@example.com',
        providerId: '555',
        nickname: 'Biber',
        birthDate,
        homeDepartmentId: dept.id,
      });

      const merged = await mergeCeviNameProfilesInto(app.prisma, real, [dept.id]);
      expect(merged).toBe(1);

      const updated = await app.prisma.user.findUniqueOrThrow({ where: { id: real.id } });
      expect(updated.calendarToken).toBeNull();
      expect(updated.calendarResetNotice).toBe(true);
      expect(await app.prisma.pushSubscription.count({ where: { userId: real.id } })).toBe(0);

      // Der alte Kalender-Feed funktioniert nicht mehr, und /api/calendar/token liefert resetNotice: true
      const oldFeed = await inject(app, { method: 'GET', url: '/api/calendar/0123456789abcdef0123456789abcdef.ics' });
      expect(oldFeed.statusCode).toBe(404);
      const tokenRes = await inject(app, { method: 'GET', url: '/api/calendar/token', cookie: authCookie(app, real) });
      expect(tokenRes.statusCode).toBe(200);
      expect(tokenRes.json().resetNotice).toBe(true);
    });

    it('lässt bei CEVIDB_ALL nur Personen desselben Verbands zu und blendet reine Besucher (joinedAt: null) aus', async () => {
      const jublaDept = await createDepartment(app, { organization: 'JUBLA' });
      const lead = await createUser(app, { provider: 'JUBLA', providerId: '10', homeDepartmentId: jublaDept.id });
      await addMember(app, jublaDept.id, lead.id, 'ADMIN');
      const event = await createEvent(app, jublaDept.id, { accessType: 'CEVIDB_ALL', organizerId: lead.id });
      const shift = await createShift(app, event.id);

      const ceviUser = await createUser(app, { provider: 'CEVI', providerId: '20', birthDate: new Date('1995-01-01T00:00:00Z') });
      const jublaUser = await createUser(app, { provider: 'JUBLA', providerId: '30', birthDate: new Date('1995-01-01T00:00:00Z') });

      const denied = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: jublaDept.slug,
        headers: { 'x-tenant-org': 'jubla' },
        cookie: authCookie(app, ceviUser),
        payload: {},
      });
      expect(denied.statusCode).toBe(403);

      const allowed = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: jublaDept.slug,
        headers: { 'x-tenant-org': 'jubla' },
        cookie: authCookie(app, jublaUser),
        payload: {},
      });
      expect(allowed.statusCode).toBe(200);

      // Reiner Besucher-Eintrag (joinedAt: null ohne Schicht) erscheint nicht in /members
      const visitor = await createUser(app, { email: 'visitor@example.com' });
      await app.prisma.departmentMember.create({ data: { departmentId: jublaDept.id, userId: visitor.id, role: 'HELPER', joinedAt: null } });
      const membersRes = await inject(app, {
        method: 'GET',
        url: '/api/departments/current/members',
        tenant: jublaDept.slug,
        headers: { 'x-tenant-org': 'jubla' },
        cookie: authCookie(app, lead),
      });
      expect(membersRes.statusCode).toBe(200);
      expect(membersRes.json().some((m: { userId: string }) => m.userId === visitor.id)).toBe(false);
    });
  });
});
