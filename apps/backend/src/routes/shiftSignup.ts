import { z } from 'zod';
import { FastifyPluginAsync } from 'fastify';
import {
  ageAt,
  cancelDeadlineAt,
  formatZurichTimeRange,
  getVocabulary,
  SignupShiftSchema,
  zurichDateTimeParts,
} from '@schichtplan/shared';
import type { ErrorKey, ErrorValues } from '../plugins/i18n.js';
import {
  accessEventInclude,
  accessUserSelect,
  evaluateEventAccess,
  hasValidGrant,
  managerFlags,
} from '../services/eventAccess.js';
import { missingProfileFields } from '../services/profile.js';
import { missingSensitiveConsent, validateAnswers } from './eventParticipation.js';
import { OTHER_EVENT_SHIFT_TITLE, findShiftCollisions, hasShiftCollision } from '../services/shiftCollision.js';
import { allUsersRelatedToEvent } from '../services/departmentVisibility.js';
import { trackUsage } from '../services/usageStats.js';
import { personLabel } from '../services/attendance.js';
import { notifyReplacementTaken, replacementOpen } from '../services/replacement.js';
import { EMAIL_REMINDER_MINUTES, PUSH_REMINDER_MINUTES } from '@schichtplan/shared';
import { pastReminderMinutes, shiftDisplayTitle } from '../services/shiftDto.js';

const shiftSignupRoutes: FastifyPluginAsync = async (fastify) => {
  // Zeitkollisionen prüfen (für Eintragen-Vorschau oder Admin-Zuweisung)
  fastify.get<{
    Params: { id: string };
    Querystring: { userId?: string; guestName?: string };
  }>(
    '/api/shifts/:id/check-collision',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Zeitkollision prüfen',
        description: 'Prüft, ob eine Person oder ein Gast zum Schichtzeitpunkt bereits in einer anderen Schicht eingetragen ist.',
        params: z.object({
          id: z.string().uuid().describe('ID der Schicht'),
        }),
        querystring: z.object({
          userId: z.string().uuid().optional().describe('ID des Benutzers'),
          guestName: z.string().optional().describe('Name des Gastes'),
        }),
      },
      preHandler: [fastify.optionalAuthenticate],
    },
    async (request, reply) => {
      const shiftId = request.params.id;
      const { userId, guestName } = request.query;

      const shift = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          event: {
            include: {
              organizers: true,
            },
          },
        },
      });

      if (!shift || (request.tenant && shift.event.departmentId !== request.tenant.id)) {
        return reply.fail(404, 'signup.shiftNotFound');
      }

      if (!request.user) {
        return reply.fail(401, 'auth.notSignedIn');
      }

      const flags = await managerFlags(fastify.prisma, shift.event, request.user);
      // Andere Personen prüfen nur, wer auch einteilen darf (wie beim Eintragen); Sehen allein reicht nicht
      const canAssign = flags.can.HELPERS;

      let targetUserId: string | null = null;
      let targetGuestName: string | null = null;

      if (userId && userId !== request.user.id) {
        if (!canAssign) {
          return reply.fail(403, 'auth.noPermission');
        }
        // Nur Personen der Abteilung oder des Anlasses, nie beliebige Konten
        if (!(await allUsersRelatedToEvent(fastify.prisma, shift.eventId, [userId]))) {
          return reply.status(400).send({ error: request.t('people.unrelatedPerson') });
        }
        targetUserId = userId;
      } else if (!userId && guestName) {
        if (!canAssign) {
          return reply.fail(403, 'auth.noPermission');
        }
        targetGuestName = guestName;
      } else {
        targetUserId = request.user.id;
      }

      const conflicts = await findShiftCollisions(fastify.prisma, {
        shiftId: shift.id,
        startTime: shift.startTime,
        endTime: shift.endTime,
        eventId: shift.eventId,
        userId: targetUserId,
        guestName: targetGuestName,
        // Bei anderen Personen: Schichten anderer Anlässe nicht mit Titel nennen
        hideOtherEvents: targetUserId !== request.user.id,
      });

      let message: string | undefined;
      if (conflicts.length > 0) {
        const first = conflicts[0];
        if (first.sameShift) {
          message = first.taskTitle
            ? request.t('signup.alreadyHintSameTask', { task: first.taskTitle })
            : request.t('signup.alreadyHintSame');
        } else {
          const time = formatZurichTimeRange(first.startTime, first.endTime, request.intlLocale);
          message = first.taskTitle
            ? request.t('signup.alreadyHintTask', { shift: first.shiftTitle ?? request.t('signup.anotherShift'), task: first.taskTitle, time })
            : request.t('signup.alreadyHint', { shift: first.shiftTitle ?? request.t('signup.anotherShift'), time });
        }
      }

      return {
        hasCollision: conflicts.length > 0,
        conflicts,
        message,
      };
    }
  );

  // In Schicht eintragen (oder durch OK einteilen)
  fastify.post<{ Params: { id: string } }>(
    '/api/shifts/:id/signup',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Für Schicht eintragen oder Person einteilen',
        description: 'Trägt eine angemeldete Person, ein Abteilungsmitglied oder einen Gast in die Schicht ein oder übernimmt eine Schicht mit «Ersatz gesucht».',
        params: z.object({
          id: z.string().uuid().describe('ID der Schicht'),
        }),
        body: SignupShiftSchema.omit({ shiftId: true }),
      },
      preHandler: [fastify.optionalAuthenticate],
    },
    async (request, reply) => {
      const shiftId = request.params.id;

      const shift = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          tasks: {
            include: {
              signups: {
                include: { user: true },
              },
            },
          },
          signups: {
            include: { user: true },
          },
          event: {
            include: {
              ...accessEventInclude,
              questions: { select: { id: true, required: true, scope: true, label: true, type: true, options: true, sensitive: true } },
            },
          },
        },
      });

      if (!shift || (request.tenant && shift.event.departmentId !== request.tenant.id)) {
        return reply.fail(404, 'signup.shiftNotFound');
      }

      const event = shift.event;

      // Selbsteintragung braucht immer ein Konto (ein Cevi-Name-Profil reicht)
      if (!request.user) {
        return reply.fail(
          401,
          'signup.accountRequired',
          { nickname: getVocabulary(request.organization, request.locale).nickname },
          { requiresLogin: true }
        );
      }

      const flags = await managerFlags(fastify.prisma, event, request.user);
      const isOkOrAdmin = flags.isManager;
      if (!event.isPublished && !isOkOrAdmin) {
        return reply.fail(404, 'signup.shiftNotFound');
      }

      // Body parsen
      const parse = SignupShiftSchema.safeParse({ ...(request.body as object), shiftId });
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const { taskId, userId: requestedUserId, guestName: reqGuestName, guestEmail: reqGuestEmail, guestPhone: reqGuestPhone } =
        parse.data;

      // Antworten auf Fragen, die bei jeder Eintragung neu gestellt werden (PER_SIGNUP)
      const perSignupQuestions = event.questions.filter((q) => q.scope === 'PER_SIGNUP');
      const signupAnswers = Object.fromEntries(
        perSignupQuestions
          .map((q) => [q.id, (parse.data.answers?.[q.id] ?? '').trim()] as const)
          .filter(([, value]) => value)
      );
      const invalidAnswer = validateAnswers(perSignupQuestions, signupAnswers, request.t);
      if (invalidAnswer) return reply.status(400).send({ error: invalidAnswer });
      const noConsent = missingSensitiveConsent(perSignupQuestions, signupAnswers, parse.data.sensitiveConsent, request.t);
      if (noConsent) return reply.status(400).send({ error: noConsent });
      const sensitiveIds = new Set(perSignupQuestions.filter((q) => q.sensitive).map((q) => q.id));
      const answeredAt = new Date();

      // Schicht übernehmen («Ersatz gesucht»): Die eigene Eintragung ersetzt die angebotene,
      // deren Platz gilt für alle Prüfungen als frei.
      const replaced = parse.data.replacesSignupId
        ? shift.signups.find((s) => s.id === parse.data.replacesSignupId) ?? null
        : null;
      if (parse.data.replacesSignupId) {
        if (!replaced?.replacementWantedAt) {
          return reply.fail(409, 'signup.replacementNotWanted');
        }
        if (replaced.attendance === 'PRESENT') {
          return reply.fail(409, 'signup.replacementAlreadyPresent');
        }
        if (replaced.userId === request.user.id) {
          return reply.fail(400, 'signup.replacementOwnSignup');
        }
        if (!replacementOpen(event, shift.startTime)) {
          return reply.fail(409, 'signup.replacementNotPossible');
        }
        shift.signups = shift.signups.filter((s) => s.id !== replaced.id);
        for (const t of shift.tasks) t.signups = t.signups.filter((s) => s.id !== replaced.id);
      }

      let targetUserId: string | null = null;
      let targetUser = null;
      let guestName: string | null = null;
      let guestEmail: string | null = null;
      let guestPhone: string | null = null;

      // Andere einteilen braucht «Helfende einteilen» (OK oder Recht), Sehen allein reicht nicht.
      // Ohne das Recht werden userId/guestName ignoriert und die Person trägt sich selbst ein.
      const canAssign = flags.can.HELPERS;

      // Fall 1: OK teilt eine andere Person ein
      if (canAssign && requestedUserId && !replaced) {
        // Nur Personen der Abteilung oder des Anlasses: sonst sähe das OK danach fremde Kontaktdaten
        if (!(await allUsersRelatedToEvent(fastify.prisma, event.id, [requestedUserId]))) {
          return reply.status(400).send({ error: request.t('people.unrelatedPerson') });
        }
        targetUserId = requestedUserId;
        targetUser = await fastify.prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) {
          return reply.fail(404, 'signup.personNotFound');
        }
      } else if (canAssign && reqGuestName && !replaced) {
        // OK trägt manuellen Gast/Helfer ein
        guestName = reqGuestName.trim();
        guestEmail = reqGuestEmail?.trim() || null;
        guestPhone = reqGuestPhone?.trim() || null;
      } else {
        // Angemeldete Person trägt sich selbst ein: Zugang, Pflichtangaben und Pflichtfragen prüfen
        targetUserId = request.user.id;
        const self = await fastify.prisma.user.findUnique({
          where: { id: targetUserId },
          select: {
            ...accessUserSelect,
            email: true,
            firstName: true,
            lastName: true,
            nickname: true,
            phone: true,
            birthDate: true,
          },
        });
        if (!self) {
          return reply.fail(401, 'auth.accountNotFound');
        }
        targetUser = self;

        const hasGrant = await hasValidGrant(fastify.prisma, event.id, self.id);
        // Beim Übernehmen kommt kein Platz dazu: geschlossenes Eintragen hält es nicht auf
        const accessEvent = replaced ? { ...event, allowPublicSignup: true, signupOpensAt: null } : event;
        const access = evaluateEventAccess(accessEvent, event.department.name, self, flags, hasGrant);
        if (!access.canSignup) {
          return reply.status(403).send({ error: access.message, reason: access.reason });
        }

        const missingFields = missingProfileFields(self, event.requiredFields);
        const answered = await fastify.prisma.eventAnswer.findMany({
          where: { eventId: event.id, userId: self.id },
          select: { questionId: true, value: true },
        });
        const missingQuestionIds = event.questions
          .filter(
            (q) =>
              q.scope !== 'PER_SIGNUP' &&
              q.required &&
              !answered.some((a) => a.questionId === q.id && a.value.trim())
          )
          .map((q) => q.id);
        const missingSignupQuestionIds = perSignupQuestions
          .filter((q) => q.required && !signupAnswers[q.id])
          .map((q) => q.id);
        if (missingFields.length > 0 || missingQuestionIds.length > 0 || missingSignupQuestionIds.length > 0) {
          return reply.fail(400, 'signup.missingInfo', undefined, {
            code: 'MISSING_INFO',
            missingFields,
            missingQuestionIds,
            missingSignupQuestionIds,
          });
        }
      }

      // Zeitkollisionen & Duplikate prüfen (gleiche Schicht oder überlappende Schichten)
      const allowCollision = Boolean(isOkOrAdmin && parse.data.confirmCollision);
      const conflicts = await findShiftCollisions(fastify.prisma, {
        shiftId,
        startTime: shift.startTime,
        endTime: shift.endTime,
        eventId: shift.eventId,
        userId: targetUserId,
        guestName,
        hideOtherEvents: targetUserId !== request.user.id,
      });

      if (conflicts.length > 0 && !allowCollision) {
        const first = conflicts[0];
        const sameShift = conflicts.some((c) => c.sameShift);
        const isSelf = targetUserId === request.user.id;

        let key: ErrorKey;
        let values: ErrorValues = {};
        if (sameShift) {
          if (first.taskTitle) {
            key = isSelf ? 'signup.alreadySelfTask' : 'signup.alreadyOtherTask';
            values = { task: first.taskTitle };
          } else {
            key = isSelf ? 'signup.alreadySelf' : 'signup.alreadyOther';
          }
        } else {
          const time = formatZurichTimeRange(first.startTime, first.endTime, request.intlLocale);
          values = {
            shift: first.shiftTitle ?? request.t('signup.anotherShift'),
            time,
            ...(first.taskTitle ? { task: first.taskTitle } : {}),
          };
          if (isSelf) {
            key = first.taskTitle ? 'signup.collisionSelfTask' : 'signup.collisionSelf';
          } else {
            values.name =
              targetUser?.nickname ||
              (targetUser ? `${targetUser.firstName} ${targetUser.lastName}`.trim() : guestName) ||
              request.t('signup.thisPerson');
            key = first.taskTitle ? 'signup.collisionOtherTask' : 'signup.collisionOther';
          }
        }

        return reply.fail(409, key, values, { code: 'TIME_COLLISION', conflicts });
      }

      // Prüfe freie Plätze in der Gesamtschicht
      if (shift.signups.length >= shift.requiredSlots) {
        return reply.fail(409, 'signup.shiftFull');
      }

      // Arbeit (Task) bestimmen
      let chosenTask = null;
      if (replaced) {
        // Wer übernimmt, übernimmt auch die Arbeit
        chosenTask = shift.tasks.find((t) => t.id === replaced.taskId) ?? null;
      } else if (taskId) {
        chosenTask = shift.tasks.find((t) => t.id === taskId);
        if (!chosenTask) {
          return reply.fail(404, 'signup.taskNotFound');
        }
      } else if (shift.tasks.length === 1) {
        chosenTask = shift.tasks[0];
      } else {
        // Nimm erste Arbeit mit freien Plätzen
        chosenTask = shift.tasks.find((t) => t.signups.length < t.requiredSlots) || shift.tasks[0] || null;
      }

      // Prüfe freie Plätze in der gewählten Arbeit
      if (chosenTask && chosenTask.signups.length >= chosenTask.requiredSlots) {
        return reply.fail(409, 'signup.taskFull', { task: chosenTask.title });
      }

      // Altersprüfungen
      const shiftDate = new Date(shift.startTime);
      const userBirthDate = targetUser?.birthDate ? new Date(targetUser.birthDate) : null;
      const userAge = userBirthDate ? ageAt(userBirthDate, shiftDate) : null;

      // Wer sich selbst einträgt, muss bei einer Altersgrenze das Geburtsdatum angeben
      // (sonst liesse sich «Bar ab 18» mit einem Konto ohne Geburtsdatum umgehen)
      const strictMinAge = Boolean(shift.minAge || (chosenTask?.minAge && chosenTask.ageRequirementType === 'ALL'));
      if (targetUserId === request.user.id && !isOkOrAdmin && strictMinAge && userAge === null) {
        return reply.fail(400, 'signup.birthDateRequired', undefined, {
          code: 'MISSING_INFO',
          missingFields: ['BIRTH_DATE'],
          missingQuestionIds: [],
          missingSignupQuestionIds: [],
        });
      }

      // 1) Mindestalter der Schicht selbst
      if (shift.minAge && userAge !== null && userAge < shift.minAge) {
        return shift.title
          ? reply.fail(403, 'signup.shiftMinAgeTitled', { shift: shift.title, minAge: shift.minAge, age: userAge })
          : reply.fail(403, 'signup.shiftMinAge', { minAge: shift.minAge, age: userAge });
      }

      // 2) Mindestalter der spezifischen Arbeit
      if (chosenTask?.minAge) {
        if (chosenTask.ageRequirementType === 'ALL') {
          // Alle müssen das Mindestalter haben
          if (userAge !== null && userAge < chosenTask.minAge) {
            return reply.fail(403, 'signup.taskMinAgeAll', { task: chosenTask.title, minAge: chosenTask.minAge, age: userAge });
          }
        } else if (chosenTask.ageRequirementType === 'AT_LEAST_ONE') {
          // Mindestens eine Person in der Schicht muss das Mindestalter haben
          // Prüfen, ob bereits jemand in der Schicht das Mindestalter erfüllt
          const alreadyHasAdult = shift.signups.some((s) => {
            if (s.user?.birthDate) {
              const age = ageAt(s.user.birthDate, shiftDate);
              return age !== null && age >= chosenTask!.minAge!;
            }
            return false;
          });

          if (!alreadyHasAdult) {
            // Noch niemand in der Schicht hat das geforderte Alter
            const isUserOldEnough = userAge !== null && userAge >= chosenTask.minAge;

            if (!isUserOldEnough) {
              // Helfer ist zu jung oder Alter unbekannt.
              // Prüfe, ob dies der LETZTE freie Platz in der Schicht ist:
              const remainingShiftSlots = shift.requiredSlots - shift.signups.length;
              if (remainingShiftSlots <= 1) {
                return reply.fail(403, 'signup.taskMinAgeLastSlot', { task: chosenTask.title, minAge: chosenTask.minAge });
              }
            }
          }
        }
      }

      const needsAdultOnLastSlot = Boolean(
        chosenTask?.minAge &&
          chosenTask.ageRequirementType === 'AT_LEAST_ONE' &&
          !(userAge !== null && userAge >= chosenTask.minAge)
      );

      // Plätze und Doppel-Eintragung unter Sperre der Schicht nochmals prüfen: Zwei gleichzeitige
      // Eintragungen für den letzten Platz (oder ein Doppelklick) würden die Schicht sonst überbuchen.
      const result = await fastify.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM shifts WHERE id = ${shiftId} FOR UPDATE`;
        if (replaced) {
          // Unter der Sperre: zurückgezogen oder schon von jemand anderem übernommen?
          const stillOffered = await tx.shiftSignup.findFirst({
            where: {
              id: replaced.id,
              replacementWantedAt: { not: null },
            },
            select: { id: true, attendance: true },
          });
          if (!stillOffered || stillOffered.attendance === 'PRESENT') {
            return { fail: 'signup.replacementGone' as ErrorKey, values: undefined };
          }
          await tx.cateringToken.updateMany({
            where: { shiftSignupId: replaced.id, status: 'REDEEMED' },
            data: { shiftSignupId: null },
          });
          await tx.shiftSignup.delete({ where: { id: replaced.id } });
        }
        if (!allowCollision) {
          // Gleiche Regel wie findShiftCollisions: Überlappung bis zur Übergabe-Toleranz ist erlaubt
          const tolerance = event.overlapToleranceMinutes ?? 15;
          const collides = (other: { id: string; startTime: Date; endTime: Date }) =>
            other.id === shiftId || hasShiftCollision(shift.startTime, shift.endTime, other.startTime, other.endTime, tolerance);
          if (targetUserId) {
            const candidates = await tx.shiftSignup.findMany({
              where: {
                userId: targetUserId,
                shift: {
                  startTime: { lt: shift.endTime },
                  endTime: { gt: shift.startTime },
                },
              },
              include: { shift: true },
            });
            const overlapping = candidates.find((c) => collides(c.shift));
            if (overlapping) {
              const isSame = overlapping.shiftId === shiftId;
              // Bei anderen Personen keine Titel aus anderen Anlässen nennen
              const otherTitle =
                targetUserId !== request.user!.id && overlapping.shift.eventId !== shift.eventId
                  ? OTHER_EVENT_SHIFT_TITLE
                  : overlapping.shift.title || request.t('signup.anotherShift');
              return isSame
                ? { fail: 'signup.alreadyOther' as ErrorKey, values: undefined }
                : { fail: 'signup.collisionExisting' as ErrorKey, values: { shift: otherTitle } as ErrorValues };
            }
          } else if (guestName) {
            const candidates = await tx.shiftSignup.findMany({
              where: {
                shift: {
                  eventId: shift.eventId,
                  startTime: { lt: shift.endTime },
                  endTime: { gt: shift.startTime },
                },
                guestName: { equals: guestName, mode: 'insensitive' },
              },
              include: { shift: true },
            });
            if (candidates.some((c) => collides(c.shift))) {
              return { fail: 'signup.guestCollision' as ErrorKey, values: { name: guestName } as ErrorValues };
            }
          }
        }
        if ((await tx.shiftSignup.count({ where: { shiftId } })) >= shift.requiredSlots) {
          return { fail: 'signup.shiftFull' as ErrorKey, values: undefined };
        }
        if (chosenTask && (await tx.shiftSignup.count({ where: { taskId: chosenTask.id } })) >= chosenTask.requiredSlots) {
          return { fail: 'signup.taskFull' as ErrorKey, values: { task: chosenTask.title } as ErrorValues };
        }
        // «Mindestens eine Person ab X Jahren» unter der Sperre nochmals prüfen: Sonst könnten zwei zu
        // junge Personen gleichzeitig die letzten Plätze bekommen.
        if (needsAdultOnLastSlot && chosenTask?.minAge) {
          const current = await tx.shiftSignup.findMany({
            where: { shiftId },
            select: { user: { select: { birthDate: true } } },
          });
          const hasAdult = current.some((c) => {
            const age = c.user?.birthDate ? ageAt(c.user.birthDate, shiftDate) : null;
            return age !== null && age >= chosenTask.minAge!;
          });
          if (!hasAdult && shift.requiredSlots - current.length <= 1) {
            return {
              fail: 'signup.taskMinAgeLastSlotReserved' as ErrorKey,
              values: { task: chosenTask.title, minAge: chosenTask.minAge } as ErrorValues,
            };
          }
        }

        const created = await tx.shiftSignup.create({
          data: {
            shiftId,
            taskId: chosenTask?.id || null,
            userId: targetUserId,
            guestName,
            guestEmail,
            guestPhone,
            sentEmailReminders: pastReminderMinutes(shift.startTime, EMAIL_REMINDER_MINUTES),
            sentPushReminders: pastReminderMinutes(shift.startTime, PUSH_REMINDER_MINUTES),
            answers: {
              create: Object.entries(signupAnswers).map(([questionId, value]) => ({
                questionId,
                value,
                consentAt: sensitiveIds.has(questionId) ? answeredAt : null,
              })),
            },
          },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                nickname: true,
                birthDate: true,
              },
            },
            task: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        });
        return { signup: created } as const;
      });
      if (result.fail) {
        return reply.fail(409, result.fail, result.values);
      }
      const signup = result.signup;

      const displayName =
        signup.user?.nickname ||
        (signup.user ? `${signup.user.firstName} ${signup.user.lastName}`.trim() : null) ||
        signup.guestName ||
        'Helfer*in';

      // Im Aktivitäts-Protokoll festhalten
      try {
        const isSelf = Boolean(request.user && targetUserId === request.user.id);
        let performerUser = null;
        if (request.user) {
          if (isSelf && signup.user) {
            performerUser = signup.user;
          } else {
            performerUser = await fastify.prisma.user.findUnique({
              where: { id: request.user.id },
              select: { firstName: true, lastName: true, nickname: true },
            });
          }
        }
        const performerName = performerUser
          ? (performerUser.nickname ? `${performerUser.firstName} / ${performerUser.nickname}` : `${performerUser.firstName} ${performerUser.lastName}`.trim())
          : null;

        await fastify.prisma.shiftSignupLog.create({
          data: {
            eventId: event.id,
            shiftId: shift.id,
            // REPLACE: performedByName = wer die Schicht abgegeben hat
            action: replaced ? 'REPLACE' : 'SIGNUP',
            helperUserId: targetUserId,
            helperName: displayName,
            performedByUserId: request.user?.id || null,
            performedByName: replaced
              ? personLabel(replaced.user, replaced.guestName)
              : isSelf ? null : (performerName ? `${performerName} (OK)` : 'OK'),
            shiftTitle: shiftDisplayTitle(shift, signup.task),
            shiftStartTime: shift.startTime,
            shiftEndTime: shift.endTime,
            taskTitle: signup.task?.title || null,
          },
        });
      } catch (logErr) {
        request.log.error(logErr, 'Fehler beim Erstellen des Signup-Logs');
      }

      if (replaced) {
        trackUsage('REPLACEMENT_TAKEN', { departmentId: event.departmentId });
        void notifyReplacementTaken(fastify.prisma, replaced, shift, event, displayName).catch((err) =>
          request.log.error(err, 'Mail «Ersatz gefunden» fehlgeschlagen')
        );
      } else {
        trackUsage('SIGNUP', {
          dim: targetUserId === request.user.id ? 'SELF' : targetUserId ? 'OK' : 'GUEST',
          departmentId: event.departmentId,
        });
      }

      return {
        id: signup.id,
        shiftId: signup.shiftId,
        taskId: signup.taskId,
        taskTitle: signup.task?.title || null,
        displayName,
        message: replaced ? 'Du hast die Schicht übernommen. Danke!' : 'Erfolgreich für die Schicht eingetragen!',
      };
    }
  );

  // Aus Schicht austragen (Eigene Eintragung oder Admin/Planner/Event-OK)
  fastify.delete<{ Params: { id: string }; Querystring: { signupId?: string } }>(
    '/api/shifts/:id/signup',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Aus Schicht austragen',
        description: 'Trägt eine Person aus einer Schicht aus (unter Einhaltung von Abmeldefristen oder durch das OK).',
        params: z.object({
          id: z.string().uuid().describe('ID der Schicht'),
        }),
        querystring: z.object({
          signupId: z.string().uuid().optional().describe('ID der konkreten Schicht-Eintragung'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const shiftId = request.params.id;
      const { signupId } = request.query;

      if (!request.user) {
        return reply.fail(401, 'auth.notSignedIn');
      }

      let existingSignup = null;

      if (signupId) {
        existingSignup = await fastify.prisma.shiftSignup.findUnique({
          where: { id: signupId },
          include: {
            shift: { include: { event: { include: { organizers: true } } } },
            task: true,
            user: true,
          },
        });
      } else if (request.user) {
        existingSignup = await fastify.prisma.shiftSignup.findFirst({
          where: {
            shiftId,
            userId: request.user.id,
          },
          include: {
            shift: { include: { event: { include: { organizers: true } } } },
            task: true,
            user: true,
          },
        });
      }

      // Die Eintragung muss zur Schicht in der Adresse gehören. Bewusst ohne Abteilungs-Prüfung:
      // «Meine Schichten» trägt auch Schichten anderer Abteilungen aus (die Berechtigung folgt unten).
      if (!existingSignup || existingSignup.shiftId !== shiftId) {
        return reply.fail(404, 'signup.signupNotFound');
      }

      // Prüfe Berechtigung: Eigener Eintrag ODER Abteilungsleitung ODER Event-OK
      const event = existingSignup.shift.event;
      const flags = await managerFlags(fastify.prisma, event, request.user);
      // Andere austragen und Austrage-Frist übergehen: «Helfende einteilen»
      const isManager = flags.can.HELPERS;
      const isSelf = Boolean(request.user && existingSignup.userId === request.user.id);

      if (!isSelf && !isManager) {
        return reply.fail(403, 'signup.noPermissionDelete');
      }

      // Hat die Schicht bereits begonnen oder ist vorbei, darf sich eine Person nicht mehr selbst austragen
      if (!isManager && existingSignup.shift.startTime <= new Date()) {
        return reply.fail(403, 'signup.signoffStarted');
      }

      // Wurde die Anwesenheit bereits erfasst, darf man sich ebenfalls nicht mehr selbst austragen
      if (!isManager && existingSignup.attendance === 'PRESENT') {
        return reply.fail(403, 'signup.signoffPresent');
      }

      // Wurde bereits ein Verpflegungs-Bon eingelöst, darf man sich nicht mehr selbst austragen
      if (!isManager) {
        const redeemedToken = await fastify.prisma.cateringToken.findFirst({
          where: { shiftSignupId: existingSignup.id, status: 'REDEEMED' },
        });
        if (redeemedToken) {
          return reply.fail(403, 'signup.signoffTokenRedeemed');
        }
      }

      // Austrag-Sperre prüfen: Helfer können sich ab X Tagen vor Event-Beginn nicht mehr selbst austragen
      if (!isManager && event.cancelDeadlineDays !== null && event.cancelDeadlineDays !== undefined) {
        const deadline = cancelDeadlineAt(event.startDate, event.cancelDeadlineDays);
        if (new Date() >= deadline) {
          if (event.cancelDeadlineDays === 0) return reply.fail(403, 'signup.signoffDeadlineStart');
          const parts = zurichDateTimeParts(deadline, request.intlLocale);
          return reply.fail(403, 'signup.signoffDeadline', {
            date: parts?.date ?? '',
            time: parts?.time ?? '',
            days: event.cancelDeadlineDays,
          });
        }
      }

      // Im Aktivitäts-Protokoll festhalten
      try {
        let performerUser = null;
        if (request.user) {
          if (isSelf && existingSignup.user) {
            performerUser = existingSignup.user;
          } else {
            performerUser = await fastify.prisma.user.findUnique({
              where: { id: request.user.id },
              select: { firstName: true, lastName: true, nickname: true },
            });
          }
        }
        const performerName = performerUser
          ? (performerUser.nickname ? `${performerUser.firstName} / ${performerUser.nickname}` : `${performerUser.firstName} ${performerUser.lastName}`.trim())
          : null;
        const helperName =
          existingSignup.user?.nickname ||
          (existingSignup.user ? `${existingSignup.user.firstName} ${existingSignup.user.lastName}`.trim() : null) ||
          existingSignup.guestName ||
          'Helfer*in';

        await fastify.prisma.shiftSignupLog.create({
          data: {
            eventId: event.id,
            shiftId: existingSignup.shift.id,
            action: 'SIGNOFF',
            helperUserId: existingSignup.userId,
            helperName,
            performedByUserId: request.user?.id || null,
            performedByName: isSelf ? null : (performerName ? `${performerName} (OK)` : 'OK'),
            shiftTitle: shiftDisplayTitle(existingSignup.shift, existingSignup.task),
            shiftStartTime: existingSignup.shift.startTime,
            shiftEndTime: existingSignup.shift.endTime,
            taskTitle: existingSignup.task?.title || null,
          },
        });
      } catch (logErr) {
        request.log.error(logErr, 'Fehler beim Erstellen des Signoff-Logs');
      }

      await fastify.prisma.$transaction(async (tx) => {
        await tx.cateringToken.updateMany({
          where: { shiftSignupId: existingSignup.id, status: 'REDEEMED' },
          data: { shiftSignupId: null },
        });

        await tx.shiftSignup.delete({
          where: { id: existingSignup.id },
        });
      });
      trackUsage('SIGNOFF', { dim: isSelf ? 'SELF' : 'OK', departmentId: event.departmentId });

      return { message: request.t('success.signedOff') };
    }
  );
};

export default shiftSignupRoutes;
