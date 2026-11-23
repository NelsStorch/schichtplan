import { z } from 'zod';
import { shiftDisplayTitle } from '../../services/shiftDto.js';
import { FastifyPluginAsync } from 'fastify';
import type { Prisma, } from '../../db.js';
import {
  AddEventOrganizerSchema,
  SetDayResponsiblesSchema,
  UnregisterHelperSchema,
  type AttendanceStatus,
  type PersonHistoryDto,
  type ShiftSignupLogAction,
} from '@schichtplan/shared';
import {
  managerFlags,
} from '../../services/eventAccess.js';
import { resolveOrganizerUser } from '../../services/nicknameLogin.js';
import {
  allUsersRelatedToEvent,
} from '../../services/departmentVisibility.js';

import { toResponsiblePersonDto, } from './shared.js';

/** OK-Team, Tagesverantwortliche, Helfende abmelden und Eintragungsprotokoll */
const eventTeamRoutes: FastifyPluginAsync = async (fastify) => {
  // Tagesverantwortliche setzen (Abteilungsleitung ODER Event-OK)
  fastify.put<{ Params: { slug: string; dayDate: string } }>(
    '/api/events/:slug/days/:dayDate/responsibles',
    {
      schema: {
        tags: ['Events'],
        summary: 'Tagesverantwortliche festlegen',
        description: 'Weist bestimmten Benutzern die Tagesverantwortung für einen Kalendertag des Anlasses zu.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
          dayDate: z.string().describe('Kalendertag im Format YYYY-MM-DD'),
        }),
        body: SetDayResponsiblesSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.fail(400, 'department.missingContext');
      }

      const { slug, dayDate } = request.params;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) {
        return reply.fail(400, 'team.invalidDate');
      }

      const event = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug,
          },
        },
        include: { organizers: true },
      });

      if (!event) {
        return reply.fail(404, 'event.notFound');
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.SHIFTS) {
        return reply.fail(403, 'team.dayLeadsForbidden');
      }

      const input = request.body as z.output<typeof SetDayResponsiblesSchema>;

      const uniqueUserIds = [...new Set(input.userIds)];

      if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, uniqueUserIds))) {
        return reply.status(400).send({ error: request.t('people.unrelatedPerson') });
      }

      await fastify.prisma.$transaction(async (tx) => {
        await tx.eventDayResponsible.deleteMany({
          where: {
            eventId: event.id,
            dayDate,
          },
        });
        if (uniqueUserIds.length > 0) {
          await tx.eventDayResponsible.createMany({
            data: uniqueUserIds.map((userId) => ({
              eventId: event.id,
              dayDate,
              userId,
            })),
            skipDuplicates: true,
          });
        }
      });

      const updated = await fastify.prisma.eventDayResponsible.findMany({
        where: {
          eventId: event.id,
          dayDate,
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return {
        dayDate,
        responsibles: updated.map((r) =>
          toResponsiblePersonDto(r.user, event.contactVisibility || 'BOTH')
        ),
      };
    }
  );

  // Mitglied zum Event-OK hinzufügen
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/organizers',
    {
      schema: {
        tags: ['Events'],
        summary: 'OK-Mitglied hinzufügen',
        description: 'Fügt eine Person zum Organisationskomitee (OK) des Anlasses hinzu.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: AddEventOrganizerSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.fail(400, 'department.missingContext');
      }

      const event = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug: request.params.slug,
          },
        },
        include: { organizers: true },
      });

      if (!event) {
        return reply.fail(404, 'event.notFound');
      }

      // Nur Abteilungsleitung oder OK_LEAD darf OK-Mitglieder verwalten
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ORGANIZERS) {
        return reply.fail(403, 'team.manageForbidden');
      }

      const input = request.body as z.output<typeof AddEventOrganizerSchema>;

      const { userId, nickname, ceviName, email, role, roleTitle } = input;

      // Benutzer finden anhand ID, E-Mail oder Cevi-/Spitzname (nur Konten mit Cevi.DB oder Passwort)
      const resolved = await resolveOrganizerUser(fastify.prisma, request.tenant.id, { userId, nickname, ceviName, email }, request.t);
      if ('error' in resolved) {
        return reply.status(resolved.status).send({ error: resolved.error });
      }
      const targetUser = resolved.user;
      if (targetUser.id !== request.user.id && !(await allUsersRelatedToEvent(fastify.prisma, event.id, [targetUser.id]))) {
        return reply.status(400).send({ error: request.t('people.unrelatedPerson') });
      }

      // Schutz: Die letzte OK-Leitung kann nicht zu einem einfachen Mitglied herabgestuft werden
      if (role !== 'OK_LEAD') {
        const currentOrg = event.organizers.find((o) => o.userId === targetUser.id);
        if (currentOrg?.role === 'OK_LEAD') {
          const otherLeads = event.organizers.filter((o) => o.role === 'OK_LEAD' && o.userId !== targetUser.id);
          if (otherLeads.length === 0) {
            return reply.fail(400, 'team.lastLead');
          }
        }
      }

      const organizer = await fastify.prisma.eventOrganizer.upsert({
        where: {
          eventId_userId: {
            eventId: event.id,
            userId: targetUser.id,
          },
        },
        update: {
          role,
          roleTitle: roleTitle !== undefined ? roleTitle.trim() || null : undefined,
        },
        create: {
          eventId: event.id,
          userId: targetUser.id,
          role,
          roleTitle: roleTitle?.trim() || 'OK-Mitglied',
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, nickname: true },
          },
        },
      });

      return {
        id: organizer.id,
        userId: organizer.userId,
        displayName: organizer.user.nickname
          ? `${organizer.user.firstName} / ${organizer.user.nickname}`
          : `${organizer.user.firstName} ${organizer.user.lastName}`,
        role: organizer.role,
        roleTitle: organizer.roleTitle,
      };
    }
  );

  // Mitglied aus dem Event-OK entfernen (Abteilungsleitung oder OK-Leitung)
  fastify.delete<{ Params: { slug: string; organizerId: string } }>(
    '/api/events/:slug/organizers/:organizerId',
    {
      schema: {
        tags: ['Events'],
        summary: 'OK-Mitglied entfernen',
        description: 'Entfernt eine Person aus dem Organisationskomitee (OK).',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
          organizerId: z.string().uuid().describe('ID des OK-Eintrags'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { organizerId } = request.params;

      const existing = await fastify.prisma.eventOrganizer.findUnique({
        where: { id: organizerId },
        include: { event: { include: { organizers: true } } },
      });

      if (!existing || (request.tenant && existing.event.departmentId !== request.tenant.id)) {
        return reply.fail(404, 'team.memberNotFound');
      }

      const flags = await managerFlags(fastify.prisma, existing.event, request.user);
      if (!flags.can.ORGANIZERS) {
        return reply.fail(403, 'team.manageForbidden');
      }

      // Schutz: Die letzte OK-Leitung kann nicht entfernt werden, solange noch andere OK-Mitglieder existieren
      if (existing.role === 'OK_LEAD') {
        const otherLeads = existing.event.organizers.filter(
          (o) => o.role === 'OK_LEAD' && o.id !== existing.id
        );
        const otherMembers = existing.event.organizers.filter((o) => o.id !== existing.id);
        if (otherLeads.length === 0 && otherMembers.length > 0) {
          return reply.fail(400, 'team.lastLeadWithMembers');
        }
      }

      await fastify.prisma.eventOrganizer.delete({
        where: { id: organizerId },
      });

      return { message: request.t('success.okMemberRemoved') };
    }
  );

  // Helfer komplett vom Event abmelden (aus allen Schichten dieses Events austragen)
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/unregister-helper',
    {
      schema: {
        tags: ['Events'],
        summary: 'Helfer komplett vom Anlass austragen',
        description: 'Trägt einen Helfer oder Gast aus ausnahmslos allen Schichten dieses Anlasses aus.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: UnregisterHelperSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.fail(400, 'department.missingContext');
      }

      const event = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug: request.params.slug,
          },
        },
        include: { organizers: true },
      });

      if (!event) {
        return reply.fail(404, 'event.notFound');
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.HELPERS) {
        return reply.fail(403, 'team.deregisterForbidden');
      }

      const input = request.body as z.output<typeof UnregisterHelperSchema>;

      const { userId, guestName } = input;

      if (!userId && !guestName) {
        return reply.fail(400, 'team.userOrGuestRequired');
      }

      const whereClause: Prisma.ShiftSignupWhereInput = {
        shift: { eventId: event.id },
      };

      if (userId) {
        whereClause.userId = userId;
      } else if (guestName) {
        whereClause.guestName = { equals: guestName, mode: 'insensitive' };
      }

      const signupsToCancel = await fastify.prisma.shiftSignup.findMany({
        where: whereClause,
        include: {
          shift: true,
          task: true,
          user: {
            select: { id: true, firstName: true, lastName: true, nickname: true },
          },
        },
      });

      const signupIds = signupsToCancel.map((s) => s.id);
      const deleted = await fastify.prisma.$transaction(async (tx) => {
        if (signupIds.length > 0) {
          await tx.cateringToken.updateMany({
            where: { shiftSignupId: { in: signupIds }, status: 'REDEEMED' },
            data: { shiftSignupId: null },
          });
        }
        return tx.shiftSignup.deleteMany({
          where: whereClause,
        });
      });

      // Im Aktivitäts-Protokoll festhalten
      if (signupsToCancel.length > 0) {
        try {
          const performerUser = request.user
            ? await fastify.prisma.user.findUnique({
                where: { id: request.user.id },
                select: { firstName: true, lastName: true, nickname: true },
              })
            : null;
          const performerName = performerUser
            ? (performerUser.nickname ? `${performerUser.firstName} / ${performerUser.nickname}` : `${performerUser.firstName} ${performerUser.lastName}`.trim())
            : null;
          const pLabel = performerName ? `${performerName} (OK)` : 'OK';

          await fastify.prisma.shiftSignupLog.createMany({
            data: signupsToCancel.map((su) => {
              const hName = su.user
                ? (su.user.nickname ? `${su.user.firstName} / ${su.user.nickname}` : `${su.user.firstName} ${su.user.lastName}`.trim())
                : (su.guestName || 'Gast');
              return {
                eventId: event.id,
                shiftId: su.shiftId,
                action: 'SIGNOFF',
                helperUserId: su.userId,
                helperName: hName,
                performedByUserId: request.user?.id || null,
                performedByName: pLabel,
                shiftTitle: shiftDisplayTitle(su.shift, su.task),
                shiftStartTime: su.shift.startTime,
                shiftEndTime: su.shift.endTime,
                taskTitle: su.task?.title || null,
              };
            }),
          });
        } catch (logErr) {
          request.log.error(logErr, 'Fehler beim Erstellen der Abmelde-Logs');
        }
      }

      return {
        message: `${deleted.count} Schichteintragung(en) erfolgreich entfernt`,
        deletedCount: deleted.count,
      };
    }
  );

  // Protokoll aller Schicht-Eintragungen und -Austragungen (Abteilungsleitung ODER Event-OK)
  fastify.get<{ Params: { slug: string } }>(
    '/api/events/:slug/logs',
    {
      schema: {
        tags: ['Events'],
        summary: 'Schicht- und Helferprotokoll abrufen',
        description: 'Liefert den detaillierten Audit-Log über Einteilungen, Austragungen und Anwesenheitsänderungen.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.fail(400, 'department.missingContext');
      }

      const event = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug: request.params.slug,
          },
        },
        include: { organizers: true },
      });

      if (!event) {
        return reply.fail(404, 'event.notFound');
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.isManager) {
        return reply.fail(403, 'team.logForbidden');
      }

      const logs = await fastify.prisma.shiftSignupLog.findMany({
        where: { eventId: event.id },
        orderBy: { createdAt: 'desc' },
        take: 300,
      });

      return logs.map((l) => ({
        id: l.id,
        eventId: l.eventId,
        shiftId: l.shiftId,
        action: l.action as ShiftSignupLogAction,
        helperUserId: l.helperUserId,
        helperName: l.helperName,
        performedByUserId: l.performedByUserId,
        performedByName: l.performedByName,
        shiftTitle: l.shiftTitle,
        shiftStartTime: l.shiftStartTime ? l.shiftStartTime.toISOString() : null,
        shiftEndTime: l.shiftEndTime ? l.shiftEndTime.toISOString() : null,
        taskTitle: l.taskTitle,
        attendance: l.attendance as AttendanceStatus | null,
        createdAt: l.createdAt.toISOString(),
      }));
    }
  );

  // Verlauf einer einzelnen Person: Eintragungen/Austragungen und erhaltene OK-Nachrichten (Abteilungsleitung ODER Event-OK)
  fastify.get<{ Params: { slug: string }; Querystring: { userId?: string; guestName?: string } }>(
    '/api/events/:slug/person-history',
    {
      schema: {
        tags: ['Events'],
        summary: 'Verlauf einer Person am Anlass abrufen',
        description:
          'Liefert alle Ein- und Austragungen, Übernahmen und Anwesenheitsänderungen einer Person sowie die OK-Nachrichten, die an sie gingen.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        querystring: z.object({
          userId: z.string().max(100).optional().describe('Person mit Konto'),
          guestName: z.string().min(1).max(200).optional().describe('Gast ohne Konto (Name wie eingetragen)'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.fail(400, 'department.missingContext');
      }
      if (Boolean(request.query.userId) === Boolean(request.query.guestName)) {
        return reply.fail(400, 'team.userOrGuest');
      }

      const event = await fastify.prisma.event.findUnique({
        where: { departmentId_slug: { departmentId: request.tenant.id, slug: request.params.slug } },
        include: { organizers: true },
      });
      if (!event) {
        return reply.fail(404, 'event.notFound');
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.isManager) {
        return reply.fail(403, 'team.historyForbidden');
      }
      reply.header('Cache-Control', 'no-store');

      const { userId, guestName } = request.query;
      const [logs, messages] = await Promise.all([
        fastify.prisma.shiftSignupLog.findMany({
          where: userId
            ? { eventId: event.id, helperUserId: userId }
            : { eventId: event.id, helperUserId: null, helperName: guestName },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        userId
          ? fastify.prisma.eventMessage.findMany({
              where: { eventId: event.id, recipientUserIds: { has: userId } },
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: { id: true, subject: true, sentByName: true, targetLabel: true, createdAt: true },
            })
          : Promise.resolve([]),
      ]);

      return {
        logs: logs.map((l) => ({
          id: l.id,
          eventId: l.eventId,
          shiftId: l.shiftId,
          action: l.action as ShiftSignupLogAction,
          helperUserId: l.helperUserId,
          helperName: l.helperName,
          performedByUserId: l.performedByUserId,
          performedByName: l.performedByName,
          shiftTitle: l.shiftTitle,
          shiftStartTime: l.shiftStartTime ? l.shiftStartTime.toISOString() : null,
          shiftEndTime: l.shiftEndTime ? l.shiftEndTime.toISOString() : null,
          taskTitle: l.taskTitle,
          attendance: l.attendance as AttendanceStatus | null,
          createdAt: l.createdAt.toISOString(),
        })),
        messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      } satisfies PersonHistoryDto;
    }
  );
};

export default eventTeamRoutes;
