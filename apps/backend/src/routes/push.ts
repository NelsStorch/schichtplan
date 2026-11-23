import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  PushResubscribeSchema,
  PushSubscribeSchema,
  PushUnsubscribeSchema,
  getDepartmentUrl,
  getLandingUrl,
  type PushDeviceDto,
} from '@schichtplan/shared';
import {
  getVapidPublicKey,
  isAllowedPushEndpoint,
  pushDeviceLabel,
  pushOriginHost,
  isValidP256dhKey,
  sendPushNotification,
  sendPushToUser,
} from '../services/webPush.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { getCookieDomain } from '../services/authSession.js';

// Max 5 test notifications per user within 5 minutes
const testPushLimiter = createRateLimiter(5 * 60 * 1000, 5);
// Erneuern ohne Anmeldung (aus dem Service Worker): höchstens 20 pro Stunde und IP
const resubscribeLimiter = createRateLimiter(60 * 60 * 1000, 20);

const PUSH_DEVICE_COOKIE =
  process.env.COOKIE_NAME === 'token_dev' ? 'push_sub_dev' : 'push_sub_id';

function setPushDeviceCookie(reply: FastifyReply, subscriptionId: string) {
  // Wie das Login-Cookie: Domain der Anfrage (cevi-/pfadi-/jubla-/vereins-schichtplan.ch)
  const domain = getCookieDomain(reply.request?.hostname);
  reply.setCookie(PUSH_DEVICE_COOKIE, subscriptionId, {
    path: '/',
    domain,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 Jahr
  });
}

function clearPushDeviceCookie(reply: FastifyReply) {
  const domain = getCookieDomain(reply.request?.hostname);
  reply.clearCookie(PUSH_DEVICE_COOKIE, {
    path: '/',
    domain,
  });
}

const pushRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Public VAPID key for ServiceWorker pushManager.subscribe()
  fastify.get(
    '/api/push/vapid-public-key',
    {
      schema: {
        tags: ['Push'],
        summary: 'Öffentlichen VAPID-Schlüssel abrufen',
        description: 'Liefert den öffentlichen VAPID-Schlüssel für ServiceWorker pushManager.subscribe().',
        response: {
          200: z.object({
            publicKey: z.string().describe('VAPID Public Key im Base64-URL-Format'),
          }),
        },
      },
    },
    async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return { publicKey: getVapidPublicKey() };
    }
  );

  // 2. Push-Status: Anzahl Abos und ob dieses Gerät ein Abo hat (über den Endpoint dieser Adresse oder das Geräte-Cookie der ganzen Domain)
  fastify.get<{ Querystring: { endpoint?: string } }>(
    '/api/push/status',
    {
      schema: {
        tags: ['Push'],
        summary: 'Push-Status des aktuellen Benutzers prüfen',
        description: 'Prüft, ob das anfragende Gerät und die angemeldete Person für Push-Benachrichtigungen registriert sind.',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          endpoint: z.string().optional().describe('Push-Subscription-Endpoint des Browsers'),
        }),
        response: {
          200: z.object({
            publicKey: z.string(),
            subscriptionCount: z.number().int(),
            deviceSubscribed: z.boolean(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const userId = request.user.id;
      const endpoint = request.query.endpoint?.trim();
      const cookieSubId = request.cookies?.[PUSH_DEVICE_COOKIE]?.trim();

      const [count, byEndpoint, byCookie] = await Promise.all([
        fastify.prisma.pushSubscription.count({ where: { userId } }),
        endpoint
          ? fastify.prisma.pushSubscription.findFirst({
              where: { userId, endpoint },
              select: { id: true },
            })
          : Promise.resolve(null),
        cookieSubId
          ? fastify.prisma.pushSubscription.findFirst({
              where: { id: cookieSubId, userId },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);

      // Ein Abo gehört technisch zum Service Worker einer Adresse (z. B. a.cevi-schichtplan.ch). Für die Person
      // gilt es aber fürs ganze Gerät: Das Geräte-Cookie der ganzen Domain macht es auf jeder Abteilungs-Adresse
      // und der Startseite sichtbar, und Ausschalten löscht dort das Abo im Backend (siehe /unsubscribe).
      const activeSub = byEndpoint || byCookie;
      // Falls lokal über den ServiceWorker gefunden, aber Cookie fehlte (z. B. vor diesem Update), Cookie nachziehen
      if (byEndpoint && cookieSubId !== byEndpoint.id) {
        setPushDeviceCookie(reply, byEndpoint.id);
      } else if (cookieSubId && !byCookie && !byEndpoint) {
        // Verwaistes Cookie aufräumen
        clearPushDeviceCookie(reply);
      }

      return {
        publicKey: getVapidPublicKey(),
        subscriptionCount: count,
        deviceSubscribed: Boolean(activeSub),
      };
    },
  );

  // 3. Register / update a Web Push subscription for the current device
  fastify.post(
    '/api/push/subscribe',
    {
      schema: {
        tags: ['Push'],
        summary: 'Gerät für Web Push Benachrichtigungen registrieren',
        description: 'Speichert oder aktualisiert ein Browser-Push-Abonnement für die angemeldete Person.',
        security: [{ bearerAuth: [] }],
        body: PushSubscribeSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const input = request.body as z.output<typeof PushSubscribeSchema>;
      const { endpoint, keys, standalone } = input;
      if (!isAllowedPushEndpoint(endpoint)) {
        return reply.fail(400, 'push.serviceUnsupported');
      }
      if (!isValidP256dhKey(keys.p256dh)) {
        return reply.fail(400, 'push.invalidKey');
      }

      const userId = request.user.id;
      const cookieSubId = request.cookies?.[PUSH_DEVICE_COOKIE]?.trim();
      const origin = pushOriginHost(request.headers.origin, request.headers.host);
      const label = pushDeviceLabel(request.headers['user-agent'], standalone);

      // Falls derselbe Browser schon unter einer anderen Subdomain ein Abo angelegt hatte,
      // ersetzen wir das alte Abo dieses Geräts, damit dasselbe Gerät nie doppelt benachrichtigt wird.
      if (cookieSubId) {
        await fastify.prisma.pushSubscription
          .deleteMany({
            where: {
              id: cookieSubId,
              userId,
              endpoint: { not: endpoint },
            },
          })
          .catch(() => undefined);
      }

      const upserted = await fastify.prisma.pushSubscription.upsert({
        where: { endpoint },
        update: {
          userId,
          p256dh: keys.p256dh,
          auth: keys.auth,
          origin,
          label,
        },
        create: {
          userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          origin,
          label,
        },
        select: { id: true },
      });

      setPushDeviceCookie(reply, upserted.id);

      // Keep at most 15 subscriptions per user (prune oldest if exceeded)
      const allSubs = await fastify.prisma.pushSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (allSubs.length > 15) {
        const staleIds = allSubs.slice(15).map((s) => s.id);
        await fastify.prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
      }

      const count = Math.min(allSubs.length, 15);

      // Sofortige Willkommens-Benachrichtigung an das neu aktivierte Gerät senden
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, nickname: true, homeDepartment: { select: { slug: true } } },
      });
      if (user) {
        const displayName = user.nickname || user.firstName;
        const slug = request.tenant?.slug || user.homeDepartment?.slug;
        const targetUrl = slug
          ? getDepartmentUrl(slug, '/', request.tenant?.organization || request.organization)
          : getLandingUrl('/profil', request.headers.host);
        void sendPushNotification(
          { endpoint, p256dh: keys.p256dh, auth: keys.auth },
          {
            title: `Hallo ${displayName}! Browser-Benachrichtigungen sind aktiv`,
            body: 'Dieses Gerät empfängt jetzt Erinnerungen vor deinen Schichten und Infos vom OK.',
            url: targetUrl,
            tag: `schichtplan-welcome-${Date.now()}`,
          },
        ).catch((err) => {
          request.log.warn({ err, userId }, 'Willkommens-Push konnte nicht gesendet werden');
        });
      }

      return { ok: true, subscriptionCount: count, deviceSubscribed: true };
    },
  );

  // 4. Unsubscribe the current device (via endpoint and/or wildcard cookie)
  fastify.post(
    '/api/push/unsubscribe',
    {
      schema: {
        tags: ['Push'],
        summary: 'Push-Abonnement beenden',
        description: 'Entfernt das Browser-Push-Abonnement anhand des übergebenen Endpoints oder des Geräte-Cookies.',
        security: [{ bearerAuth: [] }],
        body: PushUnsubscribeSchema.partial().optional(),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const body = request.body as Record<string, unknown> | null | undefined;
      const cookieSubId = request.cookies?.[PUSH_DEVICE_COOKIE]?.trim();
      const hasEndpoint = Boolean(body && typeof body.endpoint === 'string' && body.endpoint.trim());

      if (hasEndpoint) {
        const parse = PushUnsubscribeSchema.safeParse(body);
        if (!parse.success) {
          return reply.status(400).send({ error: parse.error.issues[0].message });
        }
        await fastify.prisma.pushSubscription.deleteMany({
          where: {
            userId,
            OR: [
              { endpoint: parse.data.endpoint },
              ...(cookieSubId ? [{ id: cookieSubId }] : []),
            ],
          },
        });
      } else if (cookieSubId) {
        // Auf einer anderen Subdomain ausgeschaltet, auf der der lokale ServiceWorker das Abo nicht kennt:
        // Wir löschen gezielt das Geräte-Abo aus dem Wildcard-Cookie.
        await fastify.prisma.pushSubscription.deleteMany({
          where: { id: cookieSubId, userId },
        });
      }

      clearPushDeviceCookie(reply);

      const count = await fastify.prisma.pushSubscription.count({ where: { userId } });
      return { ok: true, subscriptionCount: count, deviceSubscribed: false };
    },
  );

  // 4b. Geräteliste fürs Profil
  fastify.get<{ Querystring: { endpoint?: string } }>(
    '/api/push/devices',
    {
      schema: {
        tags: ['Push'],
        summary: 'Eigene Push-Geräte auflisten',
        description: 'Listet alle Push-Abos der angemeldeten Person mit Gerätebezeichnung, Adresse und Datum.',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          endpoint: z.string().optional().describe('Push-Subscription-Endpoint dieses Browsers'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply): Promise<PushDeviceDto[]> => {
      reply.header('Cache-Control', 'no-store');
      const endpoint = request.query.endpoint?.trim();
      const cookieSubId = request.cookies?.[PUSH_DEVICE_COOKIE]?.trim();
      const subs = await fastify.prisma.pushSubscription.findMany({
        where: { userId: request.user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, endpoint: true, label: true, origin: true, createdAt: true },
      });
      return subs.map((s) => ({
        id: s.id,
        label: s.label,
        origin: s.origin,
        createdAt: s.createdAt.toISOString(),
        current: s.id === cookieSubId || (Boolean(endpoint) && s.endpoint === endpoint),
      }));
    }
  );

  // 4c. Einzelnes Gerät entfernen (z. B. verlorenes Handy oder doppeltes Abo)
  fastify.delete<{ Params: { id: string } }>(
    '/api/push/devices/:id',
    {
      schema: {
        tags: ['Push'],
        summary: 'Push-Gerät entfernen',
        description: 'Löscht ein eigenes Push-Abo. Das Gerät bekommt danach keine Mitteilungen mehr.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid().describe('ID des Push-Abos') }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { count: deleted } = await fastify.prisma.pushSubscription.deleteMany({
        where: { id: request.params.id, userId },
      });
      if (deleted === 0) return reply.fail(404, 'push.deviceNotFound');
      if (request.cookies?.[PUSH_DEVICE_COOKIE]?.trim() === request.params.id) clearPushDeviceCookie(reply);
      const count = await fastify.prisma.pushSubscription.count({ where: { userId } });
      return { ok: true, subscriptionCount: count };
    }
  );

  // 4d. Browser hat das Abo von sich aus erneuert (Service Worker, `pushsubscriptionchange`).
  // Ohne Anmeldung, weil der Service Worker im Hintergrund läuft: Wer den alten Endpoint kennt (eine
  // geheime, zufällige URL des Push-Dienstes), darf ihn durch den neuen ersetzen.
  fastify.post(
    '/api/push/resubscribe',
    {
      schema: {
        tags: ['Push'],
        summary: 'Erneuertes Push-Abo übernehmen',
        description: 'Ersetzt ein bestehendes Abo (alter Endpoint) durch das vom Browser erneuerte Abo.',
        body: PushResubscribeSchema,
      },
    },
    async (request, reply) => {
      if (resubscribeLimiter.hit(`ip:${request.ip}`)) {
        return reply.fail(429, 'generic.tooManyRequestsShort');
      }
      const { oldEndpoint, endpoint, keys } = request.body as z.output<typeof PushResubscribeSchema>;
      if (!isAllowedPushEndpoint(endpoint)) {
        return reply.fail(400, 'push.serviceUnsupported');
      }
      if (!isValidP256dhKey(keys.p256dh)) {
        return reply.fail(400, 'push.invalidKey');
      }
      const old = await fastify.prisma.pushSubscription.findUnique({ where: { endpoint: oldEndpoint }, select: { id: true } });
      if (!old) return reply.fail(404, 'push.subscriptionNotFound');
      if (oldEndpoint !== endpoint) {
        // Falls der neue Endpoint schon existiert, das Duplikat entfernen
        await fastify.prisma.pushSubscription.deleteMany({ where: { endpoint, id: { not: old.id } } });
      }
      await fastify.prisma.pushSubscription.update({
        where: { id: old.id },
        data: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
      });
      return { ok: true };
    }
  );

  // 5. Send a test notification to all subscribed devices of the current user
  fastify.post(
    '/api/push/test',
    {
      schema: {
        tags: ['Push'],
        summary: 'Test-Benachrichtigung an eigene Geräte senden',
        description: 'Sendet eine Test-Benachrichtigung an alle aktiven Push-Endpunkte der angemeldeten Person (Rate-Limit: max. 5 alle 5 Minuten).',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;
      if (testPushLimiter.hit(userId)) {
        return reply.fail(429, 'push.testThrottled');
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, nickname: true, homeDepartment: { select: { slug: true, organization: true } } },
      });
      if (!user) {
        return reply.fail(404, 'generic.personNotFound');
      }

      const displayName = user.nickname || user.firstName;
      const slug = request.tenant?.slug || user.homeDepartment?.slug;
      const targetOrg = request.tenant?.organization || user.homeDepartment?.organization || request.organization;
      const targetUrl = slug
        ? getDepartmentUrl(slug, '/', targetOrg)
        : getLandingUrl('/profil', request.headers.host);

      const result = await sendPushToUser(
        fastify.prisma,
        userId,
        {
          title: `Hallo ${displayName}! Browser-Benachrichtigungen sind aktiv`,
          body: 'Du erhältst hier künftig Erinnerungen an deine Schichten und wichtige Infos vom OK.',
          url: targetUrl,
          tag: `schichtplan-test-${Date.now()}`,
        },
        request.log,
      );

      if (result.sent === 0) {
        return reply.fail(400, 'push.noActiveDevices', undefined, { ...result });
      }

      return {
        ok: true,
        ...result,
      };
    },
  );
};

export default pushRoutes;
