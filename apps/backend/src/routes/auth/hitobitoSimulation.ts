import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getOrganizationByDbType, type OrganizationType } from '@schichtplan/shared';
import { simPersonas, simulationEnabled } from '../../services/hitobitoSimulation.js';
import { escapeHtml } from '../../services/email.js';

const PROVIDERS = ['CEVI', 'PFADI', 'JUBLA'] as const;

/**
 * Simulierte Verbands-DB (nur Dev und lokal, siehe services/hitobitoSimulation.ts): Auf Dev führt der Verbands-Login
 * zuerst hierher. Man wählt eine erfundene Person oder geht weiter zur echten Verbands-DB.
 */
const hitobitoSimulationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { state: string; provider: string; redirect_uri: string; real: string } }>(
    '/api/auth/hitobito-sim/authorize',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Auswahl einer simulierten Person (nur Dev)',
        querystring: z.object({
          state: z.string().min(1).max(4000),
          provider: z.enum(PROVIDERS),
          redirect_uri: z.string().min(1).max(500),
          real: z.string().min(1).max(4000).describe('Pfad für den Login bei der echten Verbands-DB'),
        }),
      },
    },
    async (request, reply) => {
      if (!simulationEnabled(request.hostname)) return reply.status(404).send({ error: 'Nicht gefunden' });
      const provider = request.query.provider as OrganizationType;
      // Rücksprung nur zum eigenen Callback auf demselben Host
      let callback: URL;
      try {
        callback = new URL(request.query.redirect_uri);
      } catch {
        return reply.status(400).send({ error: 'Ungültige redirect_uri' });
      }
      if (callback.hostname !== request.hostname || callback.pathname !== '/api/auth/cevidb/callback') {
        return reply.status(400).send({ error: 'Ungültige redirect_uri' });
      }

      // Weiter zur echten Verbands-DB: nur der eigene Login-Start, kein fremdes Ziel
      const real = request.query.real;
      if (!real.startsWith('/api/auth/cevidb/login?')) return reply.status(400).send({ error: 'Ungültiger Link' });

      const org = getOrganizationByDbType(provider);
      const link = (code: string) => {
        const url = new URL(callback);
        url.searchParams.set('code', code);
        url.searchParams.set('state', request.query.state);
        return url.toString();
      };
      const items = simPersonas(provider)
        .map(
          (p) => `<li><a href="${escapeHtml(link(p.key))}"><strong>${escapeHtml(p.label)}</strong><span>${escapeHtml(
            p.description
          )}</span><code>${p.roles.map((r) => escapeHtml(r.roleClass)).join('<br>') || '–'}</code></a></li>`
        )
        .join('');
      const cancel = new URL(callback);
      cancel.searchParams.set('error', 'access_denied');
      cancel.searchParams.set('state', request.query.state);

      reply.header('Cache-Control', 'no-store');
      reply.type('text/html; charset=utf-8');
      return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Simulierte ${escapeHtml(org.authProviderShort)}</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f5f2; --fg:#1d1d1b; --muted:#6b6a66; --card:#fff; --line:#e3e1dc; --accent:#b4530f; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141413; --fg:#f1efe9; --muted:#a3a19b; --card:#1f1e1c; --line:#33322f; --accent:#f0a35e; } }
  body { margin:0; font:15px/1.5 system-ui, sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width:34rem; margin:0 auto; padding:24px 16px 48px; }
  .badge { display:inline-block; font-size:12px; font-weight:600; padding:2px 8px; border-radius:99px; background:var(--accent); color:var(--bg); }
  h1 { font-size:24px; margin:12px 0 4px; } p { color:var(--muted); margin:0 0 20px; }
  ul { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
  a { color:inherit; text-decoration:none; }
  li a { display:block; padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:var(--card); }
  li a:hover, li a:focus-visible { border-color:var(--accent); outline:none; }
  li span { display:block; color:var(--muted); font-size:13px; }
  li code { display:block; margin-top:6px; font-size:11px; color:var(--muted); word-break:break-all; }
  .cancel { display:inline-block; margin-top:20px; color:var(--accent); font-weight:600; }
  .real { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px; margin-bottom:24px;
    border-radius:12px; background:var(--accent); color:var(--bg); font-weight:600; }
  h2 { font-size:15px; margin:0 0 8px; }
</style></head>
<body><main>
<span class="badge">Testumgebung</span>
<h1>Wie willst du dich anmelden?</h1>
<p>Auf der Testumgebung kannst du dich mit deinem echten Konto anmelden oder als erfundene Person mit festen Rollen.</p>
<a class="real" href="${escapeHtml(real)}">Weiter zur echten ${escapeHtml(org.authProviderShort)} <span aria-hidden="true">→</span></a>
<h2>Simulation</h2>
<p>Erfundene Personen in einer erfundenen ${escapeHtml(org.authProviderShort)}-Struktur. Echte Konten und Gruppen werden nicht berührt.</p>
<ul>${items}</ul>
<a class="cancel" href="${escapeHtml(cancel.toString())}">Abbrechen</a>
</main></body></html>`;
    }
  );
};

export default hitobitoSimulationRoutes;
