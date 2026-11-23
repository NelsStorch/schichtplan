import { z } from 'zod';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  StufeInputSchema,
  type DepartmentPermission,
  type OrganizationType,
} from '@schichtplan/shared';
import { autoCreateAllCeviDbDepartmentStufen, backfillCeviDbStufen, } from '../../services/homeDepartment.js';
import { toStufeDto, stufenSyncDue, isUniqueViolation, requireDepartmentPermission, } from './shared.js';
import { type ErrorTranslator } from '../../plugins/i18n.js';

/** Stufen der Abteilung */
const departmentStufenRoutes: FastifyPluginAsync = async (fastify) => {
  /** Recht in der Abteilung der Subdomain prüfen (siehe shared.ts) */
  const requirePermission = (request: FastifyRequest, reply: FastifyReply, permission: DepartmentPermission) =>
    requireDepartmentPermission(fastify, request, reply, permission);

  /** Prüft, ob eine Hitobito-Gruppen-ID tatsächlich zur Verbands-Gruppe dieser Abteilung gehört */
  async function canLinkHitobitoGroup(
    tenant: { organization: OrganizationType; hitobitoGroupId: number | null },
    hitobitoGroupId: number | null | undefined,
    t: ErrorTranslator
  ): Promise<string | null> {
    if (hitobitoGroupId === null || hitobitoGroupId === undefined) return null;
    if (tenant.organization === 'OTHER' || tenant.hitobitoGroupId === null) {
      return t('stufe.linkNeedsGroup');
    }
    const group = await fastify.prisma.hitobitoGroup.findUnique({
      where: { provider_id: { provider: tenant.organization, id: hitobitoGroupId } },
      select: { id: true, jungscharId: true, ortsgruppeId: true },
    });
    if (
      !group ||
      (group.id !== tenant.hitobitoGroupId &&
        group.jungscharId !== tenant.hitobitoGroupId &&
        group.ortsgruppeId !== tenant.hitobitoGroupId)
    ) {
      return t('stufe.groupNotOwn');
    }
    return null;
  }

  // Stufen der aktuellen Abteilung
  fastify.get(
    '/api/departments/current/stufen',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Stufen der aktuellen Abteilung abrufen',
        description: 'Liefert alle Alters- und Gruppenstufen der aktuellen Abteilung.',
      },
    },
    async (request, reply) => {
    if (!request.tenant) return reply.fail(404, 'department.missingContext');
    // Öffentlicher Abruf: das Nachführen (mit Schreibzugriffen) höchstens alle paar Minuten pro Abteilung.
    // Beim Cevi.DB-Login und in den Stufen-Vorschlägen läuft es ohnehin.
    if (stufenSyncDue(request.tenant.id)) {
      await autoCreateAllCeviDbDepartmentStufen(fastify.prisma, request.tenant.id);
    }
    const stufen = await fastify.prisma.departmentStufe.findMany({
      where: { departmentId: request.tenant.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return stufen.map(toStufeDto);
  });

  fastify.post(
    '/api/departments/current/stufen',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Neue Stufe in der Abteilung anlegen',
        description: 'Erstellt eine neue Stufe in der aktuellen Abteilung (Recht «Stufen verwalten» erforderlich).',
        security: [{ bearerAuth: [] }],
        body: StufeInputSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
    const ctx = await requirePermission(request, reply, 'STUFEN_MANAGE');
    if (!ctx) return;
    const { tenant } = ctx;
    const input = request.body as z.output<typeof StufeInputSchema>;

    try {
      const count = await fastify.prisma.departmentStufe.count({ where: { departmentId: tenant.id } });
      const hitobitoGroupId = input.hitobitoGroupId ?? input.ceviDbGroupId ?? null;
      const groupErr = await canLinkHitobitoGroup(tenant, hitobitoGroupId, request.t);
      if (groupErr) return reply.status(400).send({ error: groupErr });
      const stufe = await fastify.prisma.departmentStufe.create({
        data: {
          departmentId: tenant.id,
          name: input.name,
          hitobitoGroupId,
          sortOrder: input.sortOrder ?? count,
        },
      });
      if (stufe.hitobitoGroupId !== null) await backfillCeviDbStufen(fastify.prisma, tenant.id);
      return reply.status(201).send(toStufeDto(stufe));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.fail(409, 'stufe.exists');
      }
      throw err;
    }
  });

  fastify.patch<{ Params: { id: string } }>(
    '/api/departments/current/stufen/:id',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Stufe bearbeiten',
        description: 'Aktualisiert Name, Cevi.DB-Verknüpfung oder Sortierreihenfolge einer Stufe.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Stufe'),
        }),
        body: StufeInputSchema.partial(),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'STUFEN_MANAGE');
      if (!ctx) return;
      const { tenant } = ctx;
      // Vom Routen-Schema geprüft (StufeInputSchema.partial())
      const input = request.body as Partial<z.output<typeof StufeInputSchema>>;

      const existing = await fastify.prisma.departmentStufe.findFirst({
        where: { id: request.params.id, departmentId: tenant.id },
      });
      if (!existing) return reply.fail(404, 'stufe.notFound');

      try {
        const hitobitoGroupId = input.hitobitoGroupId !== undefined ? input.hitobitoGroupId : input.ceviDbGroupId;
        if (hitobitoGroupId !== undefined && hitobitoGroupId !== existing.hitobitoGroupId) {
          const groupErr = await canLinkHitobitoGroup(tenant, hitobitoGroupId, request.t);
          if (groupErr) return reply.status(400).send({ error: groupErr });
        }
        const stufe = await fastify.prisma.departmentStufe.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            hitobitoGroupId,
            sortOrder: input.sortOrder,
          },
        });
        if (hitobitoGroupId !== undefined && hitobitoGroupId !== existing.hitobitoGroupId) {
          // Zuordnungen aus Cevi.DB zur alten Gruppe gelten nicht mehr
          await fastify.prisma.userStufe.deleteMany({ where: { stufeId: stufe.id, source: 'CEVIDB' } });
          if (stufe.hitobitoGroupId !== null) await backfillCeviDbStufen(fastify.prisma, tenant.id);
        }
        return toStufeDto(stufe);
      } catch (err) {
        if (isUniqueViolation(err)) {
          return reply.fail(409, 'stufe.exists');
        }
        throw err;
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/api/departments/current/stufen/:id',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Stufe löschen',
        description: 'Entfernt eine Stufe aus der aktuellen Abteilung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Stufe'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'STUFEN_MANAGE');
      if (!ctx) return;
      const deleted = await fastify.prisma.departmentStufe.deleteMany({
        where: { id: request.params.id, departmentId: ctx.tenant.id },
      });
      if (deleted.count === 0) return reply.fail(404, 'stufe.notFound');
      return { message: request.t('success.stufeDeleted') };
    }
  );

  // Vorschläge: Cevi.DB-Stufen werden automatisch angelegt
  fastify.get(
    '/api/departments/current/stufen/suggestions',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Stufen-Vorschläge synchronisieren',
        description: 'Synchronisiert automatisch fehlende Gruppen aus der Cevi.DB als Stufen.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'STUFEN_MANAGE');
      if (!ctx) return;
      const { tenant } = ctx;
      await autoCreateAllCeviDbDepartmentStufen(fastify.prisma, tenant.id);
      return [];
    }
  );
};

export default departmentStufenRoutes;
