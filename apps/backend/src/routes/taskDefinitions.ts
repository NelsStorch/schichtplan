import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CreateTaskDefinitionSchema, UpdateTaskDefinitionSchema } from '@schichtplan/shared';
import { canPlanInDepartment, isDepartmentInsider } from '../services/departmentVisibility.js';

const taskDefinitionRoutes: FastifyPluginAsync = async (fastify) => {
  // Liste aller Arbeiten (Task-Definitionen) der aktuellen Abteilung
  fastify.get(
    '/api/tasks',
    {
      schema: {
        tags: ['Aufgaben'],
        summary: 'Arbeiten (Tätigkeiten) der Abteilung abrufen',
        description: 'Liefert den Arbeitskatalog der aktuellen Abteilung mit hinterlegten Mindestalters- und Anforderungskriterien.',
      },
      preHandler: [fastify.optionalAuthenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.fail(400, 'department.missingContext');
      }
      // «Nur für Mitglieder»: den Arbeitskatalog sehen nur Angehörige der Abteilung und wer dort plant
      if (request.tenant.membersOnly) {
        const userId = request.user?.id;
        const allowed =
          (await isDepartmentInsider(fastify.prisma, request.tenant.id, userId)) ||
          (await canPlanInDepartment(fastify.prisma, request.tenant.id, userId));
        if (!allowed) {
          return reply.fail(userId ? 403 : 401, 'task.catalogMembersOnly');
        }
      }

      const tasks = await fastify.prisma.taskDefinition.findMany({
        where: {
          departmentId: request.tenant.id,
        },
        orderBy: { title: 'asc' },
      });

      return tasks.map((t) => ({
        id: t.id,
        departmentId: t.departmentId,
        title: t.title,
        description: t.description,
        minAge: t.minAge,
        ageRequirementType: t.ageRequirementType as 'ALL' | 'AT_LEAST_ONE',
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }));
    }
  );

  // Neue Arbeit im Katalog erstellen (Abteilungsleitung, Planung, Event-OK oder GlobalAdmin)
  fastify.post(
    '/api/tasks',
    {
      schema: {
        tags: ['Aufgaben'],
        summary: 'Neue Arbeit im Katalog anlegen',
        description: 'Erstellt eine neue standardisierte Tätigkeit für Schichten der aktuellen Abteilung.',
        security: [{ bearerAuth: [] }],
        body: CreateTaskDefinitionSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.fail(400, 'department.missingContext');
      }

      if (!(await canPlanInDepartment(fastify.prisma, request.tenant.id, request.user.id))) {
        return reply.fail(403, 'task.createForbidden');
      }

      const input = request.body as z.output<typeof CreateTaskDefinitionSchema>;

      const { title, description, minAge, ageRequirementType } = input;

      // Prüfe ob bereits eine Arbeit mit identischem Titel existiert
      const existing = await fastify.prisma.taskDefinition.findFirst({
        where: {
          departmentId: request.tenant.id,
          title: { equals: title.trim(), mode: 'insensitive' },
        },
      });

      if (existing) {
        return reply.status(409).send({ error: request.t('task.nameExists', { name: title }) });
      }

      const task = await fastify.prisma.taskDefinition.create({
        data: {
          departmentId: request.tenant.id,
          title: title.trim(),
          description: description?.trim() || null,
          minAge: minAge || null,
          ageRequirementType: ageRequirementType || 'ALL',
        },
      });

      return {
        id: task.id,
        departmentId: task.departmentId,
        title: task.title,
        description: task.description,
        minAge: task.minAge,
        ageRequirementType: task.ageRequirementType as 'ALL' | 'AT_LEAST_ONE',
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      };
    }
  );

  // Arbeit bearbeiten
  fastify.patch<{ Params: { id: string } }>(
    '/api/tasks/:id',
    {
      schema: {
        tags: ['Aufgaben'],
        summary: 'Arbeit bearbeiten',
        description: 'Aktualisiert Titel, Beschreibung oder Alterskriterien einer bestehenden Tätigkeit.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('Eindeutige ID der Arbeit'),
        }),
        body: UpdateTaskDefinitionSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.fail(400, 'department.missingContext');
      }

      if (!(await canPlanInDepartment(fastify.prisma, request.tenant.id, request.user.id))) {
        return reply.fail(403, 'task.editForbidden');
      }

      const input = request.body as z.output<typeof UpdateTaskDefinitionSchema>;

      const task = await fastify.prisma.taskDefinition.findUnique({
        where: { id: request.params.id },
      });

      if (!task || task.departmentId !== request.tenant.id) {
        return reply.fail(404, 'task.notFound');
      }

      const { title, description, minAge, ageRequirementType } = input;

      if (title !== undefined && title.trim().toLowerCase() !== task.title.toLowerCase()) {
        const conflict = await fastify.prisma.taskDefinition.findFirst({
          where: {
            departmentId: request.tenant.id,
            title: { equals: title.trim(), mode: 'insensitive' },
            id: { not: task.id },
          },
        });
        if (conflict) {
          return reply.status(409).send({ error: request.t('task.nameExists', { name: title.trim() }) });
        }
      }

      const updated = await fastify.prisma.taskDefinition.update({
        where: { id: request.params.id },
        data: {
          title: title !== undefined ? title.trim() : undefined,
          description: description !== undefined ? description?.trim() || null : undefined,
          minAge: minAge !== undefined ? minAge : undefined,
          ageRequirementType: ageRequirementType !== undefined ? ageRequirementType : undefined,
        },
      });

      return {
        id: updated.id,
        departmentId: updated.departmentId,
        title: updated.title,
        description: updated.description,
        minAge: updated.minAge,
        ageRequirementType: updated.ageRequirementType as 'ALL' | 'AT_LEAST_ONE',
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }
  );

  // Arbeit löschen (nur wenn aktuell nicht in Schichten verbaut)
  fastify.delete<{ Params: { id: string } }>(
    '/api/tasks/:id',
    {
      schema: {
        tags: ['Aufgaben'],
        summary: 'Arbeit aus dem Katalog löschen',
        description: 'Löscht eine Tätigkeit aus dem Katalog, sofern sie aktuell in keinen Schichten mehr referenziert wird.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('Eindeutige ID der Arbeit'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.fail(400, 'department.missingContext');
      }

      if (!(await canPlanInDepartment(fastify.prisma, request.tenant.id, request.user.id))) {
        return reply.fail(403, 'task.deleteForbidden');
      }

      const task = await fastify.prisma.taskDefinition.findUnique({
        where: { id: request.params.id },
      });

      if (!task || task.departmentId !== request.tenant.id) {
        return reply.fail(404, 'task.notFound');
      }

      // Prüfen, ob die Arbeit aktuell noch in Schichten verwendet wird
      const usedCount = await fastify.prisma.shiftTask.count({
        where: { taskDefinitionId: request.params.id },
      });

      if (usedCount > 0) {
        return reply.status(400).send({
          error: request.t('task.inUse', { count: usedCount }),
        });
      }

      await fastify.prisma.taskDefinition.delete({
        where: { id: request.params.id },
      });

      return { success: true };
    }
  );
};

export default taskDefinitionRoutes;
