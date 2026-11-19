import type { FastifyPluginAsync } from 'fastify';
import { sendGenericEmail } from '../../services/email.js';
import { createRateLimiter } from '../../services/rateLimit.js';

/** Löschantrag höchstens einmal pro Stunde pro Konto (gegen Mail-Fluten) */
const deletionRequestLimiter = createRateLimiter(60 * 60 * 1000, 1);
/** Datenexport höchstens 10× pro Stunde pro Konto */
const exportLimiter = createRateLimiter(60 * 60 * 1000, 10);

/**
 * Rechte der betroffenen Personen (Art. 25 und 28 DSG):
 * - eigene Daten als JSON herunterladen
 * - Löschung beantragen, wenn sich das Konto nicht selbst löschen kann (nur Cevi-Name / Spitzname)
 */
const privacyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/auth/me/export',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Eigene Daten herunterladen',
        description:
          'Liefert alle Personendaten des eigenen Kontos als JSON-Datei (Profil, Zugehörigkeiten, Eintragungen, Antworten, Abmeldungen, Rollen).',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      if (exportLimiter.hit(userId)) {
        return reply.status(429).send({ error: 'Zu viele Downloads. Bitte versuche es später nochmals.' });
      }
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          emailVerified: true,
          provider: true,
          providerId: true,
          firstName: true,
          lastName: true,
          nickname: true,
          phone: true,
          birthDate: true,
          ortsgruppeName: true,
          departmentLeader: true,
          leaderGroupName: true,
          shiftRemindersEnabled: true,
          emailReminderMinutes: true,
          pushRemindersEnabled: true,
          pushReminderMinutes: true,
          totpEnabledAt: true,
          lastSeenOn: true,
          createdAt: true,
          homeDepartment: { select: { name: true, organization: true } },
          memberships: {
            select: { role: true, permissions: true, createdAt: true, department: { select: { name: true } } },
          },
          stufen: { select: { source: true, stufe: { select: { name: true, department: { select: { name: true } } } } } },
          hitobitoRoles: { select: { roleClass: true, roleName: true, groupName: true } },
          organizedEvents: { select: { role: true, roleTitle: true, event: { select: { title: true } } } },
          signups: {
            select: {
              createdAt: true,
              notes: true,
              attendance: true,
              replacementWantedAt: true,
              replacementNote: true,
              task: { select: { title: true } },
              shift: { select: { title: true, startTime: true, endTime: true, event: { select: { title: true } } } },
              answers: { select: { value: true, consentAt: true, question: { select: { label: true } } } },
            },
          },
          eventAnswers: {
            select: { value: true, consentAt: true, updatedAt: true, question: { select: { label: true } }, event: { select: { title: true } } },
          },
          deregistrations: { select: { reason: true, createdAt: true, event: { select: { title: true } } } },
          pushSubscriptions: { select: { createdAt: true } },
        },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });

      const { pushSubscriptions, ...rest } = user;
      const data = {
        exportiertAm: new Date().toISOString(),
        hinweis:
          'Alle Personendaten, die der Schichtplan zu deinem Konto speichert. Passwort und Zwei-Faktor-Schlüssel sind nur verschlüsselt gespeichert und deshalb nicht enthalten.',
        ...rest,
        pushGeraete: pushSubscriptions.map((p) => ({ eingerichtetAm: p.createdAt })),
      };
      reply
        .header('Cache-Control', 'no-store')
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="schichtplan-meine-daten.json"');
      return JSON.stringify(data, null, 2);
    }
  );

  fastify.post(
    '/api/auth/me/deletion-request',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Löschung des eigenen Kontos beantragen',
        description:
          'Für Konten, die sich nicht selbst löschen können (nur Cevi-Name/Spitzname). Schickt eine Nachricht an die Datenschutz-Kontaktadresse.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const to = process.env.PRIVACY_CONTACT_EMAIL || process.env.ADMIN_ALERT_EMAIL || '';
      if (!to) return reply.status(503).send({ error: 'Die Kontaktadresse ist nicht hinterlegt. Bitte schreib uns direkt (siehe Impressum).' });

      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, firstName: true, lastName: true, nickname: true, provider: true, providerId: true, passwordHash: true },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if (user.providerId !== null || user.passwordHash) {
        return reply.status(400).send({ error: 'Du kannst dein Konto selbst löschen (Konto-Menü).' });
      }
      if (deletionRequestLimiter.hit(user.id)) {
        return reply.status(429).send({ error: 'Dein Antrag ist schon unterwegs. Wir melden uns.' });
      }

      const name = [user.nickname, `${user.firstName} ${user.lastName ?? ''}`.trim()].filter(Boolean).join(' / ');
      const sent = await sendGenericEmail({
        to,
        subject: 'Löschantrag für ein Konto',
        eyebrow: 'Datenschutz',
        title: 'Löschantrag',
        messageHtml: `<p style="margin: 0;">Eine Person ohne Passwort und ohne Verbands-DB hat die Löschung ihres Kontos beantragt. Bitte innert 30 Tagen im Admin-Portal löschen und die Person, falls möglich, informieren.</p>`,
        details: [
          { label: 'Name', value: name },
          { label: 'Konto-ID', value: user.id },
        ],
        organization: user.provider,
      });
      if (!sent) {
        deletionRequestLimiter.undo(user.id);
        return reply.status(502).send({ error: 'Der Antrag konnte nicht verschickt werden. Bitte versuche es später nochmals.' });
      }
      request.log.info({ userId: user.id }, 'Löschantrag gestellt');
      return { message: 'Dein Löschantrag ist bei uns. Wir löschen dein Konto innert 30 Tagen.' };
    }
  );
};

export default privacyRoutes;
