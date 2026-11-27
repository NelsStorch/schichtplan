import type { FastifyPluginAsync } from 'fastify';
import eventReadRoutes from './events/read.js';
import eventManageRoutes from './events/manage.js';
import eventTeamRoutes from './events/team.js';
import eventLiveRoutes from './events/live.js';

export { isValidLinkToken, replaceAccessLists, resolveAccessLists, syncQuestions, toQuestionDto } from './events/shared.js';

/** Alle Anlass-Routen (/api/events), aufgeteilt in routes/events/ */
const eventRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(eventReadRoutes);
  await fastify.register(eventManageRoutes);
  await fastify.register(eventTeamRoutes);
  await fastify.register(eventLiveRoutes);
};

export default eventRoutes;
