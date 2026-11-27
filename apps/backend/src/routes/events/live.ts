import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { accessTypeConfig } from '@schichtplan/shared';
import { accessUserSelect, hasValidGrant, managerFlags } from '../../services/eventAccess.js';
import { isDepartmentInsider } from '../../services/departmentVisibility.js';
import { liveEvents } from '../../services/liveEvents.js';
import { isValidLinkToken } from './shared.js';

/**
 * Server-Sent Events (SSE) Route für Live-Aktualisierungen eines Anlasses.
 * Liefert Signale für Slot-Änderungen, Schicht-Updates etc.
 * Wichtig: Es werden keine Personendaten im Event-Stream übertragen.
 */
const eventLiveRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { slug: string }; Querystring: { zugang?: string } }>(
    '/api/events/:slug/live',
    {
      schema: {
        tags: ['Events'],
        summary: 'Live-Aktualisierungen für einen Anlass (SSE)',
        description:
          'Server-Sent Events Stream für Echtzeit-Signale bei Schichtänderungen, Anmeldungen und Ersatzsuchen. Enthält keine Personendaten.',
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        querystring: z.object({
          zugang: z.string().optional().describe('Optionaler Zugangscode / Token'),
        }),
      },
      preHandler: [fastify.optionalAuthenticate],
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
        select: {
          id: true,
          slug: true,
          departmentId: true,
          isPublished: true,
          accessType: true,
          organizers: { select: { userId: true, role: true } },
        },
      });

      if (!event) {
        return reply.fail(404, 'event.notFound');
      }

      const viewer = request.user
        ? await fastify.prisma.user.findUnique({
            where: { id: request.user.id },
            select: {
              ...accessUserSelect,
            },
          })
        : null;

      const flags = await managerFlags(fastify.prisma, event, viewer);
      if (!event.isPublished && !flags.isManager) {
        return reply.fail(404, 'event.notFound');
      }

      const hasGrant = viewer ? await hasValidGrant(fastify.prisma, event.id, viewer.id) : false;

      if (
        request.tenant.membersOnly &&
        accessTypeConfig(event.accessType).scope !== 'ANY' &&
        !flags.isManager &&
        !hasGrant &&
        !(await isValidLinkToken(fastify.prisma, event.id, request.query.zugang, viewer?.id)) &&
        !(await isDepartmentInsider(fastify.prisma, request.tenant.id, viewer?.id))
      ) {
        return reply.fail(403, 'event.membersOnly', undefined, { code: 'MEMBERS_ONLY' });
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Initiale Bestätigung senden
      reply.raw.write(': connected\n\n');

      let closed = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAliveInterval);
        unsubscribe();
        try {
          if (!reply.raw.destroyed) {
            reply.raw.end();
          }
        } catch {
          // ignore
        }
      };

      const unsubscribe = liveEvents.subscribe(
        event.slug,
        (payload) => {
          if (closed) return;
          try {
            reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
          } catch {
            cleanup();
          }
        },
        request.tenant.id
      );

      const keepAliveInterval = setInterval(() => {
        if (closed) {
          clearInterval(keepAliveInterval);
          return;
        }
        try {
          reply.raw.write(': keep-alive\n\n');
        } catch {
          cleanup();
        }
      }, 25000);
      keepAliveInterval.unref();

      request.raw.on('close', cleanup);
      request.raw.on('error', cleanup);
      reply.raw.on('close', cleanup);
      reply.raw.on('error', cleanup);
    }
  );
};

export default eventLiveRoutes;
