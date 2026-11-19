import type { FastifyPluginAsync } from 'fastify';
import hitobitoAuthRoutes from './auth/hitobito.js';
import nicknameAuthRoutes from './auth/nickname.js';
import passwordAuthRoutes from './auth/password.js';
import accountRoutes from './auth/account.js';
import twoFactorRoutes from './auth/twoFactor.js';
import privacyRoutes from './auth/privacy.js';
import hitobitoSimulationRoutes from './auth/hitobitoSimulation.js';

export { hashVerificationToken } from './auth/password.js';

/**
 * Alle Routen unter /api/auth, aufgeteilt nach Anmeldeart (siehe routes/auth/).
 * Die Teile sind eigene Plugins: Sie teilen keinen Zustand, nur Services aus services/.
 */
const authRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(hitobitoAuthRoutes);
  await fastify.register(nicknameAuthRoutes);
  await fastify.register(passwordAuthRoutes);
  await fastify.register(accountRoutes);
  await fastify.register(twoFactorRoutes);
  await fastify.register(privacyRoutes);
  // Simulierte Verbands-DB: nur mit HITOBITO_SIMULATION=true registriert, und auch dann nur auf Dev-/lokalen Hosts aktiv
  if (process.env.HITOBITO_SIMULATION === 'true') await fastify.register(hitobitoSimulationRoutes);
};

export default authRoutes;
