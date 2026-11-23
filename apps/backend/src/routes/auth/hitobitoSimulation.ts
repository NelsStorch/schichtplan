import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getOrganizationByDbType, type OrganizationType } from '@schichtplan/shared';
import {
  isDevOrLocalHost,
  resetSimulation,
  simCustomCode,
  simPersonas,
  simRoleOptions,
  simulationEnabled,
} from '../../services/hitobitoSimulation.js';
import { escapeHtml } from '../../services/email.js';

const PROVIDERS = ['CEVI', 'PFADI', 'JUBLA'] as const;

/** Was jede Seite der Simulation mitträgt: state und Rücksprung des Logins, Link zur echten Verbands-DB */
const FlowQuery = z.object({
  state: z.string().min(1).max(4000),
  provider: z.enum(PROVIDERS),
  redirect_uri: z.string().min(1).max(500),
  real: z.string().min(1).max(4000).describe('Pfad für den Login bei der echten Verbands-DB'),
});
type Flow = z.output<typeof FlowQuery>;

/** Rücksprung nur zum eigenen Callback auf demselben Host, «echt» nur zum eigenen Login-Start */
function checkFlow(request: FastifyRequest, reply: FastifyReply, flow: Flow): URL | null {
  if (!simulationEnabled(request.hostname)) {
    reply.fail(404, 'generic.notFoundShort');
    return null;
  }
  let callback: URL;
  try {
    callback = new URL(flow.redirect_uri);
  } catch {
    reply.fail(400, 'simulation.invalidRedirect');
    return null;
  }
  // Lokal kommt der Aufruf über den Proxy (anderer Hostname): dann nur ein lokaler Rücksprung
  const sameHost =
    callback.hostname === request.hostname ||
    (process.env.NODE_ENV === 'development' && isDevOrLocalHost(callback.hostname));
  if (!sameHost || callback.pathname !== '/api/auth/cevidb/callback') {
    reply.fail(400, 'simulation.invalidRedirect');
    return null;
  }
  if (!flow.real.startsWith('/api/auth/cevidb/login?')) {
    reply.fail(400, 'simulation.invalidLink');
    return null;
  }
  return callback;
}

/** Anmelden als simulierte Person: eigener Callback der Simulation auf demselben Host wie der echte */
function callbackLink(callback: URL, state: string, code: string) {
  const url = new URL('/api/auth/hitobito-sim/callback', callback);
  url.searchParams.set('code', code);
  url.searchParams.set('state', state);
  return url.toString();
}

const flowParams = (flow: Flow) =>
  new URLSearchParams({ state: flow.state, provider: flow.provider, redirect_uri: flow.redirect_uri, real: flow.real });

/**
 * Simulierte Verbands-DB (nur Dev und lokal, siehe services/hitobitoSimulation.ts): Auf Dev führt der Verbands-Login
 * zuerst hierher. Man wählt eine erfundene Person, stellt eigene Rollen zusammen oder geht weiter zur echten DB.
 */
const hitobitoSimulationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: Flow & { notice?: string } }>(
    '/api/auth/hitobito-sim/authorize',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Auswahl einer simulierten Person (nur Dev)',
        querystring: FlowQuery.extend({ notice: z.string().max(200).optional() }),
      },
    },
    async (request, reply) => {
      const flow = request.query;
      const callback = checkFlow(request, reply, flow);
      if (!callback) return reply;
      const provider = flow.provider as OrganizationType;
      const org = getOrganizationByDbType(provider);

      const items = simPersonas(provider)
        .map(
          (p) =>
            `<li><a href="${escapeHtml(callbackLink(callback, flow.state, p.key))}"><strong>${escapeHtml(p.label)}</strong><span>${escapeHtml(
              p.description
            )}</span><code>${p.roles.map((r) => escapeHtml(r.roleClass)).join('<br>') || '–'}</code></a></li>`
        )
        .join('');
      const roleChoices = simRoleOptions(provider)
        .map(
          (r, i) =>
            `<label><input type="checkbox" name="r" value="${i}"> <span><strong>${escapeHtml(r.roleName)}</strong> in ${escapeHtml(
              r.groupName
            )}<code>${escapeHtml(r.roleClass)}</code></span></label>`
        )
        .join('');
      const hidden = [...flowParams(flow).entries()]
        .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
        .join('');
      const cancel = new URL(callback);
      cancel.searchParams.set('error', 'access_denied');
      cancel.searchParams.set('state', flow.state);

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
  h2 { font-size:15px; margin:28px 0 8px; }
  ul { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
  a { color:inherit; text-decoration:none; }
  li a { display:block; padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:var(--card); }
  li a:hover, li a:focus-visible { border-color:var(--accent); outline:none; }
  li span { display:block; color:var(--muted); font-size:13px; }
  code { display:block; margin-top:4px; font-size:11px; color:var(--muted); word-break:break-all; }
  .real { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px; margin-bottom:8px;
    border-radius:12px; background:var(--accent); color:var(--bg); font-weight:600; }
  form.custom { display:grid; gap:6px; padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:var(--card); }
  form.custom label { display:flex; gap:10px; align-items:flex-start; font-size:14px; cursor:pointer; }
  form.custom label input { margin-top:4px; }
  button { font:inherit; font-weight:600; border:0; border-radius:10px; padding:10px 14px; cursor:pointer; background:var(--accent); color:var(--bg); }
  button.secondary { background:transparent; color:var(--accent); border:1px solid var(--line); }
  .notice { padding:10px 14px; border-radius:12px; border:1px solid var(--accent); margin-bottom:16px; }
  .row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-top:28px; }
  .cancel { color:var(--accent); font-weight:600; }
</style></head>
<body><main>
<span class="badge">Testumgebung</span>
<h1>Wie willst du dich anmelden?</h1>
<p>Auf der Testumgebung kannst du dich mit deinem echten Konto anmelden oder als erfundene Person mit festen Rollen.</p>
${flow.notice ? `<div class="notice" role="status">${escapeHtml(flow.notice)}</div>` : ''}
<a class="real" href="${escapeHtml(flow.real)}">Weiter zur echten ${escapeHtml(org.authProviderShort)} <span aria-hidden="true">→</span></a>

<h2>Simulation: Personen</h2>
<p>Erfundene Personen in einer erfundenen ${escapeHtml(org.authProviderShort)}-Struktur. Echte Konten und Gruppen werden nicht berührt.</p>
<ul>${items}</ul>

<h2>Simulation: eigene Rollen</h2>
<p>Rollen frei kombinieren. Die gleiche Auswahl ergibt wieder dasselbe Konto.</p>
<form class="custom" method="get" action="/api/auth/hitobito-sim/custom">
  ${hidden}
  ${roleChoices}
  <button type="submit">Mit diesen Rollen anmelden</button>
</form>

<div class="row">
  <form method="post" action="/api/auth/hitobito-sim/reset" onsubmit="return confirm('Alle simulierten Konten und die Schichtpläne der simulierten Gruppen (mit ihren Anlässen) löschen?')">
    ${hidden}
    <button type="submit" class="secondary">Simulation zurücksetzen</button>
  </form>
  <a class="cancel" href="${escapeHtml(cancel.toString())}">Abbrechen</a>
</div>
</main></body></html>`;
    }
  );

  // Eigene Rollen: Auswahl in einen Code übersetzen und wie bei einer Persona zum Callback
  fastify.get<{ Querystring: Flow & { r?: string | string[] } }>(
    '/api/auth/hitobito-sim/custom',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Mit selbst gewählten simulierten Rollen anmelden (nur Dev)',
        querystring: FlowQuery.extend({ r: z.union([z.string(), z.array(z.string())]).optional() }),
      },
    },
    async (request, reply) => {
      const flow = request.query;
      const callback = checkFlow(request, reply, flow);
      if (!callback) return reply;
      const picked = ([] as string[]).concat(flow.r ?? []).map(Number);
      const code = simCustomCode(flow.provider as OrganizationType, picked);
      if (!code) {
        const back = flowParams(flow);
        back.set('notice', 'Bitte mindestens eine Rolle wählen.');
        return reply.redirect(`/api/auth/hitobito-sim/authorize?${back.toString()}`);
      }
      return reply.redirect(callbackLink(callback, flow.state, code));
    }
  );

  // Formular «Zurücksetzen» (application/x-www-form-urlencoded); gilt nur für die Routen dieses Plugins
  fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  // Simulation zurücksetzen: simulierte Konten und Schichtpläne der simulierten Gruppen löschen. Nur per POST aus dem
  // laufenden Login (state = Cookie): Das Cookie ist SameSite=Lax und fehlt bei einem fremden Formular oder Bild.
  fastify.post<{ Body: Flow }>(
    '/api/auth/hitobito-sim/reset',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Simulation eines Verbands zurücksetzen (nur Dev)',
        body: FlowQuery,
      },
    },
    async (request, reply) => {
      const flow = request.body;
      const callback = checkFlow(request, reply, flow);
      if (!callback) return reply;
      if (flow.state !== request.cookies.cevidb_oauth_state) {
        return reply.fail(403, 'simulation.restartFirst');
      }
      const result = await resetSimulation(fastify.prisma, flow.provider as OrganizationType);
      fastify.log.info({ provider: flow.provider, ...result }, 'Simulation zurückgesetzt');
      const back = flowParams(flow);
      back.set('notice', `Zurückgesetzt: ${result.users} Konten und ${result.departments} Schichtpläne gelöscht.`);
      // 303: nach dem POST die Auswahlseite per GET laden
      return reply.redirect(`/api/auth/hitobito-sim/authorize?${back.toString()}`, 303);
    }
  );
};

export default hitobitoSimulationRoutes;
