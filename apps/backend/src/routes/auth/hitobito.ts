import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { isVerifiedHomeSource } from '../../services/eventAccess.js';
import { ceviDbRoleGroupIds, deriveCeviDbFields } from '../../services/hitobito.js';
import { refreshCeviDbGroups } from '../../services/hitobitoGroups.js';
import {
  storeCeviDbFields,
  resolveCeviDbPlacement,
  syncCeviDbHomeDepartment,
} from '../../services/homeDepartment.js';
import {
  RATE_LIMIT_ERROR,
  tooManyRequests,
} from '../../services/nicknameLogin.js';
import { mergeCeviNameProfilesInto } from '../../services/mergeProfiles.js';
import { trackUsage } from '../../services/usageStats.js';
import { syncCeviDbLeadership } from '../../services/departmentLeaders.js';
import { syncProviderMemberships } from '../../services/departmentJoin.js';
import { departmentCreationEligibility } from '../departments/shared.js';
import {
  adoptSimAccount,
  findSimPersona,
  simProfile,
  simulationEnabled,
  storeSimGroups,
} from '../../services/hitobitoSimulation.js';
import { hitobitoCircuitBreaker } from '../../services/hitobitoCircuitBreaker.js';
import {
  consumeSecondFactor,
  needsSecondFactor,
  setChallengeCookie,
  twoFactorFailuresByIp,
  twoFactorFailuresByUser,
} from '../../services/twoFactor.js';

import {
  getOrganizationSlugFromHost,
  getOrganizationByDbType,
  getHitobitoConfig,
  type OrganizationType,
} from '@schichtplan/shared';

type HitobitoRawProfile = Record<string, unknown> & {
  id?: string | number;
  email?: string;
  _meta?: Record<string, unknown>;
};

import {
  MAX_LINK_ATTEMPTS,
  setAuthCookie,
  cleanReturnTo,
  loginErrorUrl,
  defaultDestination,
  bootstrapAdminCeviDbIds,
  getCeviDbRedirectUri,
  loginPageUrl,
  cleanInviteParam,
  withInviteParam,
  PENDING_LINK_COOKIE,
  PENDING_LINK_TTL_SECONDS,
  pendingLinks,
  createPendingLink,
  readPendingLink,
  ensureHelperMembership,
  CEVIDB_REQUEST_TIMEOUT_MS,
  trackCeviDbFailure,
  trackHitobitoSuccess,
} from '../../services/authSession.js';


interface HitobitoProviderConfig {
  type: OrganizationType;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

function getHitobitoConfigFor(orgSlugOrHost?: string | null): HitobitoProviderConfig {
  const orgSlug = getOrganizationSlugFromHost(orgSlugOrHost);
  if (orgSlug === 'pfadi') {
    return {
      type: 'PFADI',
      baseUrl: process.env.MIDATA_BASE_URL || 'https://db.scout.ch',
      // Kein Rückfall auf die Cevi.DB-Zugangsdaten: sonst ginge das Cevi-Secret an eine fremde Hitobito-Instanz
      clientId: process.env.MIDATA_CLIENT_ID || '',
      clientSecret: process.env.MIDATA_CLIENT_SECRET || '',
    };
  }
  if (orgSlug === 'jubla') {
    return {
      type: 'JUBLA',
      baseUrl: process.env.JUBLADB_BASE_URL || 'https://db.jubla.ch',
      clientId: process.env.JUBLADB_CLIENT_ID || '',
      clientSecret: process.env.JUBLADB_CLIENT_SECRET || '',
    };
  }
  return {
    type: 'CEVI',
    baseUrl: process.env.CEVIDB_BASE_URL || 'https://db.cevi.ch',
    clientId: process.env.CEVIDB_CLIENT_ID || '',
    clientSecret: process.env.CEVIDB_CLIENT_SECRET || '',
  };
}

/** Verbände mit Hitobito-Login (Vereine melden sich mit E-Mail und Passwort an) */
const HITOBITO_PROVIDERS: readonly unknown[] = ['CEVI', 'PFADI', 'JUBLA'];

/** Anmeldung über Hitobito (Cevi.DB, PBS MiData, Jubla-DB), inkl. Verknüpfen mit einem bestehenden Passwort-Konto */
const hitobitoAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Cevi.DB OAuth Login Redirect
  fastify.get<{ Querystring: { returnTo?: string; tenantSlug?: string; org?: string; real?: string; invite?: string } }>(
    '/api/auth/cevidb/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Cevi.DB OAuth-Login starten',
        description: 'Leitet den Browser zur Authentifizierung an die Cevi.DB (Hitobito) weiter.',
        querystring: z.object({
          returnTo: z.string().optional().describe('Ziel-URL nach erfolgreicher Anmeldung'),
          tenantSlug: z.string().optional().describe('Subdomain der Abteilung'),
          org: z.string().optional().describe('Verbands-Kürzel (cevi, pfadi, jubla)'),
          real: z.string().optional().describe('Nur Dev: 1 = direkt zur echten Verbands-DB statt zur Simulation'),
          invite: z.string().max(200).optional().describe('Einladungs-Token vom Login-Link (wird nach dem Login eingelöst)'),
        }),
      },
    },
    async (request, reply) => {
      const reqHost = request.hostname;
      const targetOrg = request.query.org || reqHost || request.query.returnTo;
      const providerConfig = getHitobitoConfigFor(targetOrg);
      const redirectUri = getCeviDbRedirectUri(process.env, reqHost);

      // Ohne Ziel bestimmt der Callback die Weiterleitung (eigene Abteilung oder Landingpage)
      const returnTo = request.query.returnTo
        ? cleanReturnTo(request.query.returnTo, '/', reqHost)
        : request.tenant
          ? defaultDestination(request.tenant.slug, reqHost, request.tenant.organization)
          : null;
      // Einladung vom Login-Link: im state mitführen, sonst ginge sie beim Umweg über die Verbands-DB verloren
      const invite = cleanInviteParam(request.query.invite);

      // Dev mit Simulation: zuerst die Auswahl (erfundene Person oder weiter zur echten Verbands-DB)
      if (request.query.real !== '1' && simulationEnabled(reqHost)) {
        const simState = Buffer.from(
          JSON.stringify({
            token: crypto.randomBytes(16).toString('hex'),
            returnTo,
            tenantSlug: request.query.tenantSlug || request.tenant?.slug || null,
            provider: providerConfig.type,
            invite,
          })
        ).toString('base64url');
        reply.setCookie('cevidb_oauth_state', simState, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 10,
        });
        const realParams = new URLSearchParams();
        for (const [key, value] of Object.entries(request.query)) {
          if (key !== 'real' && typeof value === 'string') realParams.set(key, value);
        }
        realParams.set('real', '1');
        const pick = new URLSearchParams({
          state: simState,
          provider: providerConfig.type,
          redirect_uri: redirectUri,
          real: `/api/auth/cevidb/login?${realParams.toString()}`,
        });
        return reply.redirect(`/api/auth/hitobito-sim/authorize?${pick.toString()}`);
      }

      if (!providerConfig.clientId) {
        fastify.log.error(`${providerConfig.type} OAuth ist nicht konfiguriert (CLIENT_ID fehlt in der Umgebung)`);
        return reply.redirect(withInviteParam(loginErrorUrl('cevidb_unavailable', returnTo, reqHost, providerConfig.type), invite));
      }

      // Bei aktiver Störung von Hitobito gar nicht erst weiterleiten, sondern sofort Ausweich-Login anbieten
      if (hitobitoCircuitBreaker.isOpen(providerConfig.type)) {
        fastify.log.warn(`${providerConfig.type} Circuit Breaker ist aktiv (Hitobito temporär nicht erreichbar)`);
        return reply.redirect(withInviteParam(loginErrorUrl('cevidb_unavailable', returnTo, reqHost, providerConfig.type), invite));
      }

      const stateObj = {
        token: crypto.randomBytes(16).toString('hex'),
        returnTo,
        tenantSlug: request.query.tenantSlug || request.tenant?.slug || null,
        provider: providerConfig.type,
        invite,
      };

      const stateEncoded = Buffer.from(JSON.stringify(stateObj)).toString('base64url');

      reply.setCookie('cevidb_oauth_state', stateEncoded, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10, // 10 Minuten
      });

      const authUrl = new URL(`${providerConfig.baseUrl}/oauth/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', providerConfig.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', getHitobitoConfig(providerConfig.type).oauthScopes);
      authUrl.searchParams.set('state', stateEncoded);

      return reply.redirect(authUrl.toString());
    }
  );

  // 2. Cevi.DB OAuth Callback
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/cevidb/callback',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Cevi.DB OAuth Callback',
        description: 'OAuth-Rücksprungadresse der Cevi.DB. Tauscht den Authorization Code gegen Tokens und initialisiert die Benutzersitzung.',
        querystring: z.object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { code, state, error } = request.query;

      // null = kein Ziel angegeben (direkt auf der Login-Seite angemeldet)
      let returnTo: string | null = null;
      let tenantSlug: string | null = null;
      let providerType: OrganizationType = 'CEVI';
      let invite: string | null = null;

      try {
        if (state) {
          const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
          returnTo = parsedState.returnTo ? cleanReturnTo(parsedState.returnTo, '/', request.hostname) : null;
          tenantSlug = typeof parsedState.tenantSlug === 'string' ? parsedState.tenantSlug : null;
          if (HITOBITO_PROVIDERS.includes(parsedState.provider)) providerType = parsedState.provider;
          invite = cleanInviteParam(parsedState.invite);
        }
      } catch {
        // Fallback default
      }

      const providerConfig = getHitobitoConfigFor(providerType);
      const redirectUri = getCeviDbRedirectUri(process.env, request.hostname);

      // Abbruch durch die Person auf Hitobito (z. B. Zugriff verweigert)
      if (error) {
        return reply.redirect(withInviteParam(loginErrorUrl('cevidb_denied', returnTo, request.hostname, providerConfig.type), invite));
      }

      // state muss zum Cookie aus /cevidb/login passen, sonst könnte ein fremder Code untergeschoben werden
      if (!code || !state || state !== request.cookies.cevidb_oauth_state) {
        fastify.log.warn('Hitobito Callback ohne gültigen Code oder state');
        return reply.redirect(withInviteParam(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerConfig.type), invite));
      }

      // Ohne eigene Zugangsdaten des Verbands nichts an dessen Hitobito schicken
      if (!providerConfig.clientId || !providerConfig.clientSecret) {
        fastify.log.error(`${providerConfig.type} OAuth ist nicht konfiguriert (CLIENT_ID/SECRET fehlt)`);
        return reply.redirect(withInviteParam(loginErrorUrl('cevidb_unavailable', returnTo, request.hostname, providerConfig.type), invite));
      }

      let profile: HitobitoRawProfile;
      try {
        // Code gegen Token tauschen
        const tokenRes = await fetch(`${providerConfig.baseUrl}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: providerConfig.clientId,
            client_secret: providerConfig.clientSecret,
            redirect_uri: redirectUri,
            code,
          }),
          signal: AbortSignal.timeout(CEVIDB_REQUEST_TIMEOUT_MS),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          fastify.log.error(`${providerConfig.type} Token-Abruf fehlgeschlagen: ${errText}`);
          // Nur Serverfehler zählen als Störung; 4xx (z. B. abgelaufener Code) liegt nicht an Hitobito
          if (tokenRes.status >= 500) hitobitoCircuitBreaker.recordFailure(providerConfig.type);
          trackCeviDbFailure(providerConfig.type);
          return reply.redirect(withInviteParam(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerConfig.type), invite));
        }

        const tokenData = (await tokenRes.json()) as {
          access_token: string;
          token_type?: string;
          expires_in?: number;
          refresh_token?: string;
          scope?: string;
        };
        const accessToken = tokenData.access_token;

        // Profil abrufen
        const profileRes = await fetch(`${providerConfig.baseUrl}/oauth/profile`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Scope': 'with_roles',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(CEVIDB_REQUEST_TIMEOUT_MS),
        });

        if (!profileRes.ok) {
          fastify.log.error(`${providerConfig.type} Profilabruf fehlgeschlagen`);
          if (profileRes.status >= 500) hitobitoCircuitBreaker.recordFailure(providerConfig.type);
          trackCeviDbFailure(providerConfig.type);
          return reply.redirect(withInviteParam(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerConfig.type), invite));
        }

        profile = await profileRes.json();

        // Falls OIDC aktiv ist, versuche zusätzlich Userinfo für allfällige extra Felder abzurufen
        try {
          const userinfoRes = await fetch(`${providerConfig.baseUrl}/oauth/userinfo`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(CEVIDB_REQUEST_TIMEOUT_MS),
          });
          if (userinfoRes.ok) {
            const userinfo = await userinfoRes.json();
            profile._userInfo = userinfo;
          }
        } catch {
          // optional
        }

        profile._meta = {
          fetchedAt: new Date().toISOString(),
          grantedScopes: tokenData.scope || getHitobitoConfig(providerConfig.type).oauthScopes,
          tokenType: tokenData.token_type || 'Bearer',
          expiresIn: tokenData.expires_in,
        };

        // Gruppenstruktur zu den Rollen: hier, weil das Token nur jetzt da ist (wird nicht gespeichert).
        // Wichtig: Leiter-Gruppen und Stamm-Gruppe zuerst auffrischen, damit die Abteilungserstellung verlässlich funktioniert.
        const previewDerived = deriveCeviDbFields(profile, providerConfig.type);
        const prioritizedGroupIds = [
          ...previewDerived.leaderGroupIds,
          ...(previewDerived.ortsgruppeId ? [previewDerived.ortsgruppeId] : []),
          ...(previewDerived.primaryGroupId ? [previewDerived.primaryGroupId] : []),
          ...ceviDbRoleGroupIds(profile),
        ];

        await refreshCeviDbGroups(fastify.prisma, fastify.log, {
          baseUrl: providerConfig.baseUrl,
          accessToken,
          grantedScopes: profile._meta.grantedScopes,
          groupIds: prioritizedGroupIds,
          provider: providerConfig.type,
        });

        hitobitoCircuitBreaker.recordSuccess(providerConfig.type);
      } catch (err) {
        fastify.log.error(err, `${providerConfig.type} nicht erreichbar`);
        hitobitoCircuitBreaker.recordFailure(providerConfig.type);
        trackCeviDbFailure(providerConfig.type);
        return reply.redirect(withInviteParam(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerConfig.type), invite));
      }

      trackHitobitoSuccess(providerConfig.type);
      reply.clearCookie('cevidb_oauth_state', { path: '/' });
      return reply.redirect(await finishCeviDbLogin(reply, profile, returnTo, tenantSlug, undefined, providerConfig.type, invite));
    }
  );

  // 2c. Callback der simulierten Verbands-DB (nur Dev/lokal). Eigene Route statt eines Zweigs im echten Callback:
  //     Sie existiert nur mit HITOBITO_SIMULATION=true und antwortet nur auf Dev-/lokalen Hosts.
  if (process.env.HITOBITO_SIMULATION === 'true') {
    fastify.get<{ Querystring: { code: string; state: string } }>(
      '/api/auth/hitobito-sim/callback',
      {
        schema: {
          tags: ['Auth'],
          summary: 'Anmeldung als simulierte Person (nur Dev)',
          querystring: z.object({ code: z.string().min(1).max(200), state: z.string().min(1).max(4000) }),
        },
      },
      async (request, reply) => {
        if (!simulationEnabled(request.hostname)) return reply.status(404).send({ error: 'Nicht gefunden' });
        const { code, state } = request.query;

        let returnTo: string | null = null;
        let tenantSlug: string | null = null;
        let providerType: OrganizationType = 'CEVI';
        let invite: string | null = null;
        try {
          const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
          returnTo = parsedState.returnTo ? cleanReturnTo(parsedState.returnTo, '/', request.hostname) : null;
          tenantSlug = typeof parsedState.tenantSlug === 'string' ? parsedState.tenantSlug : null;
          if (HITOBITO_PROVIDERS.includes(parsedState.provider)) providerType = parsedState.provider;
          invite = cleanInviteParam(parsedState.invite);
        } catch {
          // Fallback default
        }
        if (state !== request.cookies.cevidb_oauth_state) {
          return reply.redirect(withInviteParam(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerType), invite));
        }
        const persona = findSimPersona(providerType, code);
        if (!persona) {
          fastify.log.warn({ provider: providerType }, 'Simulierter Login ohne gültige Person');
          return reply.redirect(withInviteParam(loginErrorUrl('cevidb_failed', returnTo, request.hostname, providerType), invite));
        }
        const simulatedProfile: HitobitoRawProfile = simProfile(providerType, persona);
        simulatedProfile._meta = {
          fetchedAt: new Date().toISOString(),
          grantedScopes: getHitobitoConfig(providerType).oauthScopes,
          tokenType: 'Bearer',
          simulated: true,
        };
        await storeSimGroups(fastify.prisma, providerType);
        await adoptSimAccount(fastify.prisma, providerType, String(simulatedProfile.email), String(simulatedProfile.id));
        fastify.log.info({ provider: providerType, persona: persona.key }, 'Simulierter Verbands-Login');
        reply.clearCookie('cevidb_oauth_state', { path: '/' });
        return reply.redirect(await finishCeviDbLogin(reply, simulatedProfile, returnTo, tenantSlug, undefined, providerType, invite));
      }
    );
  }

  /**
   * Neue E-Mail aus Cevi.DB für ein bestehendes Konto übernehmen, wenn sie sich geändert hat und keinem
   * anderen Konto gehört. Unbestätigt bei einem anderen Konto: dort lösen (wie beim ersten Login).
   */
  async function ceviDbEmailUpdate(
    user: { id: string; email: string | null },
    profileEmail: unknown
  ): Promise<{ email?: string }> {
    if (typeof profileEmail !== 'string' || !profileEmail.trim()) return {};
    const email = profileEmail.trim().toLowerCase();
    if (email === user.email) return {};
    const other = await fastify.prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
    if (other && other.id !== user.id) {
      if (other.emailVerified) {
        fastify.log.warn({ userId: user.id, otherId: other.id }, 'Cevi.DB-E-Mail gehört schon einem anderen Konto');
        return {};
      }
      await fastify.prisma.$transaction([
        fastify.prisma.emailVerificationToken.deleteMany({ where: { userId: other.id } }),
        fastify.prisma.user.update({ where: { id: other.id }, data: { email: null } }),
      ]);
    }
    return { email };
  }

  /**
   * Zweiter Teil des Cevi.DB-Logins (auch nach «Konto verknüpfen»): Konto finden oder anlegen,
   * Angaben übernehmen, Cookie setzen. Gibt das Weiterleitungsziel zurück.
   * `linkConfirmedUserId`: Passwort-Konto mit gleicher E-Mail, dessen Passwort eben bestätigt wurde.
   */
  async function finishCeviDbLogin(
    reply: FastifyReply,
    profile: HitobitoRawProfile,
    returnTo: string | null,
    tenantSlug: string | null,
    linkConfirmedUserId?: string,
    targetProvider: OrganizationType = 'CEVI',
    /** Einladungs-Token vom Login-Link: danach auf /abteilung einlösen */
    invite: string | null = null,
    secondFactorVerified = false
  ): Promise<string> {
    const ceviDbId = profile.id;
    const providerId = String(profile.id);
    const provider = targetProvider;
    const org = getOrganizationByDbType(provider);
    const email = (profile.email || `${provider.toLowerCase()}_${providerId}@${org.domain}`).toLowerCase();
    const firstName = profile.first_name || profile.given_name || 'Mitglied';
    const lastName = profile.last_name || profile.family_name || '';
    const nickname = profile.nickname || null;

    let birthDate: Date | null = null;
    if (profile.birthday) {
      const parsedBirthday = new Date(profile.birthday);
      if (!isNaN(parsedBirthday.getTime())) {
        birthDate = parsedBirthday;
      }
    }

    const now = new Date();

    // Benutzer finden: zuerst über die Provider-ID, sonst über die E-Mail (E-Mails sind eindeutig)
    let user = await fastify.prisma.user.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
    if (!user) {
      let byEmail = await fastify.prisma.user.findUnique({ where: { email } });
      if (byEmail && !byEmail.emailVerified && byEmail.id !== linkConfirmedUserId) {
        // Unbestätigte Adresse (Registrierung ohne Bestätigung oder selbst ins Profil geschrieben):
        // Sie gehört nicht nachweislich diesem Konto. Der Provider bestätigt sie, das andere Konto verliert sie.
        // Sonst könnte jemand mit fremder E-Mail ein Konto vorbereiten und es so übernehmen oder sperren.
        await fastify.prisma.$transaction([
          fastify.prisma.emailVerificationToken.deleteMany({ where: { userId: byEmail.id } }),
          fastify.prisma.user.update({ where: { id: byEmail.id }, data: { email: null } }),
        ]);
        fastify.log.warn({ userId: byEmail.id, ceviDbId }, `${provider}-Login: unbestätigte E-Mail von anderem Konto gelöst`);
        byEmail = null;
      }
      if (byEmail && byEmail.providerId !== null) {
        // E-Mail gehört schon zu einem Konto mit Verbands-DB: nicht überschreiben. Ein Konto hängt an genau einer
        // Verbands-DB; ist es ein anderer Verband (z. B. Cevi und Jubla), sagt die Meldung, mit welchem es verbunden ist.
        const otherProvider = byEmail.provider !== provider ? byEmail.provider : null;
        fastify.log.warn(
          { userId: byEmail.id, ceviDbId, otherProvider },
          `${provider}-Login: E-Mail gehört zu anderem Provider-Konto`
        );
        return withInviteParam(
          otherProvider
            ? loginErrorUrl('cevidb_email_other_provider', returnTo, reply.request?.hostname, provider, otherProvider)
            : loginErrorUrl('cevidb_email_taken', returnTo, reply.request?.hostname, provider),
          invite
        );
      }
      if (byEmail?.passwordHash && byEmail.id !== linkConfirmedUserId) {
        // Passwort-Konto mit gleicher E-Mail: erst nach Passwort verknüpfen (login.<domain>/konto-verknuepfen)
        const token = createPendingLink({ profile, returnTo, tenantSlug, userId: byEmail.id, provider, invite });
        reply.setCookie(PENDING_LINK_COOKIE, token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: PENDING_LINK_TTL_SECONDS,
        });
        return loginPageUrl('/konto-verknuepfen', returnTo ?? '', reply.request?.hostname, invite);
      }
      user = byEmail;
    }

    // Hitobito ist die Quelle: Was dort steht, ersetzt die lokalen Werte bei jedem Login.
    if (!user) {
      trackUsage('REGISTER', { dim: provider === 'CEVI' ? 'cevidb' : 'hitobito' });
      user = await fastify.prisma.user.create({
        data: {
          email,
          provider,
          providerId,
          firstName,
          lastName,
          nickname,
          birthDate,
          emailVerified: true,
          emailVerifiedAt: now,
          providerSyncedAt: now,
        },
      });
    } else {
      user = await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          provider,
          providerId,
          nickname: nickname || user.nickname,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
          birthDate: birthDate || user.birthDate,
          ...(await ceviDbEmailUpdate(user, profile.email)),
          emailVerified: true,
          emailVerifiedAt: user.emailVerifiedAt || now,
          providerSyncedAt: now,
        },
      });
    }

    if (provider === 'CEVI' && !user.isGlobalAdmin && typeof ceviDbId === 'number' && bootstrapAdminCeviDbIds().has(ceviDbId)) {
      user = await fastify.prisma.user.update({
        where: { id: user.id },
        data: { isGlobalAdmin: true },
      });
      fastify.log.info({ userId: user.id, ceviDbId }, 'Cevi.DB-Person zum globalen Admin befördert');
    }

    // Was der Schichtplan aus Hitobito (Cevi, Pfadi, Jubla) braucht, in eigene Spalten schreiben.
    // Die eigene Abteilung und die Stufen kommen aus den Rollen und der Gruppenstruktur.
    const derived = deriveCeviDbFields(profile, provider);
    const placement = await resolveCeviDbPlacement(fastify.prisma, derived, user.homeDepartmentId, provider);
    await storeCeviDbFields(fastify.prisma, user.id, derived, placement);
    const homeDepartment = await syncCeviDbHomeDepartment(fastify.prisma, user, placement, provider);
    // Abteilungsleitung vergeben bzw. entziehen (nie die letzte einer Abteilung), in weiteren Abteilungen mit Rollen eintragen
    await syncCeviDbLeadership(
      fastify.prisma,
      fastify.log,
      user.id,
      homeDepartment?.id ?? null,
      placement.leaderDepartmentIds,
      placement.departmentIds
    );
    // Weitere Abteilungen laut Rollen: bestätigt beigetreten (auch bei «nur per Einladung»), fehlende Rollen enden
    await syncProviderMemberships(
      fastify.prisma,
      fastify.log,
      user.id,
      homeDepartment?.id ?? null,
      placement.departmentIds,
      placement.complete,
      getOrganizationByDbType(provider).authProviderShort
    );

    // Kommt die Person von ihrer Heimabteilungs-Subdomain, dort ohne Rechte eintragen (keine Gast-Einträge auf fremden Subdomains)
    let tenantDepartmentId: string | null = null;
    if (tenantSlug) {
      const department = await fastify.prisma.department.findUnique({
        where: { organization_slug: { organization: provider, slug: tenantSlug } },
        select: { id: true },
      });
      if (department) {
        tenantDepartmentId = department.id;
        if (homeDepartment?.id === department.id) {
          await ensureHelperMembership(fastify.prisma, department.id, user.id);
        }
      }
    }

    // Frühere Cevi-Name-Profile derselben Person (Name, Geburtsdatum, Abteilung) ins Konto übernehmen.
    // Nur in Abteilungen, die Cevi.DB über die Rollen belegt (oder die Abteilungsleitung bestätigt hat):
    // Cevi-Name, Geburtsdatum, `ortsgruppe_id` und die Abteilung beim Login (tenantSlug) kann die Person
    // selbst wählen. Sonst liesse sich so ein fremdes Cevi-Name-Profil samt Schichten dauerhaft übernehmen.
    // Ein Fehler hier darf den Login nicht verhindern.
    try {
      const home = await fastify.prisma.user.findUnique({
        where: { id: user.id },
        select: { homeDepartmentId: true, homeDepartmentSource: true },
      });
      const mergeDepartmentIds = [
        ...placement.departmentIds,
        ...(home?.homeDepartmentId && isVerifiedHomeSource(home.homeDepartmentSource) ? [home.homeDepartmentId] : []),
      ];
      const merged = await mergeCeviNameProfilesInto(fastify.prisma, user, mergeDepartmentIds);
      if (merged > 0) {
        fastify.log.info({ userId: user.id, merged }, 'Cevi-Name-Profile ins Cevi.DB-Konto übernommen');
        trackUsage('PROFILE_MERGE', { n: merged, departmentId: homeDepartment?.id ?? tenantDepartmentId });
        user = await fastify.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      }
    } catch (err) {
      fastify.log.error({ err, userId: user.id }, 'Cevi-Name-Profile konnten nicht übernommen werden');
    }

    const amr = provider === 'CEVI' ? 'cevidb' : 'hitobito';

    // Ohne Ziel: Abteilungsseite, sonst Landingpage (nicht zurück auf die Login-Seite)
    const target = returnTo ?? defaultDestination(homeDepartment?.slug ?? null, reply.request?.hostname, homeDepartment?.organization ?? provider);

    let redirectUrl = target;
    if (invite) {
      // Mit Einladung: zuerst einlösen (Abteilungsseite im Login-Portal), auch wenn die Heimabteilung schon feststeht
      redirectUrl = loginPageUrl('/abteilung', target, reply.request?.hostname, invite);
    } else if (
      // Leitung einer Ebene ohne Schichtplan (Abteilung, Region, Kanton, Bund): Anlegen anbieten. Geprüft wird über
      // die Gruppen der Leitungsrollen, nicht über `ortsgruppe_id`/`schar_id`: Das fehlt z. B. der Bundesleitung ganz.
      !homeDepartment &&
      derived.isDepartmentLeader &&
      (await departmentCreationEligibility(fastify.prisma, user.id, provider)).eligible
    ) {
      redirectUrl = loginPageUrl('/abteilung-erstellen', target, reply.request?.hostname);
    } else if (!homeDepartment) {
      // Ohne passende Abteilung im Schichtplan: Abteilung und Stufe einmal nachfragen (auch nach einem Abteilungswechsel)
      const setup = await fastify.prisma.user.findUnique({ where: { id: user.id }, select: { departmentSetupAt: true } });
      if (!setup?.departmentSetupAt) {
        // Die eigene Gruppe (z. B. Schar) ist bekannt, hat aber noch keinen Schichtplan: Statt der leeren Auswahl die
        // Seite «Anlegen» zeigen. Dort sieht die Person, warum sie nicht selbst anlegen kann (eigene Rollen), und kann
        // der Leitung den Einrichtungslink schicken.
        const ownGroupWithoutPlan = placement.verified && placement.departmentIds.length === 0;
        redirectUrl = loginPageUrl(ownGroupWithoutPlan ? '/abteilung-erstellen' : '/abteilung', target, reply.request?.hostname);
      }
    }

    // Zwei-Faktor: beim Verbands-Login nur, wenn die Person es so eingestellt hat. Beim Verknüpfen
    // wird der 2FA-Code bereits vor dem Speichern der Verknüpfung geprüft (secondFactorVerified = true).
    if (!secondFactorVerified && needsSecondFactor(user, linkConfirmedUserId ? 'password' : 'provider')) {
      setChallengeCookie(reply, { uid: user.id, amr, next: redirectUrl });
      return loginPageUrl('/zwei-faktor', returnTo ?? '', reply.request?.hostname, invite);
    }

    const token = fastify.signAuthToken({
      id: user.id,
      email: user.email || `${user.id}@${getOrganizationByDbType(provider).domain}`,
      isGlobalAdmin: user.isGlobalAdmin,
      amr,
    });

    setAuthCookie(reply, token);
    trackUsage('LOGIN', { dim: amr, departmentId: homeDepartment?.id ?? tenantDepartmentId });
    return redirectUrl;
  }

  // 2b. Cevi.DB mit bestehendem Passwort-Konto (gleiche E-Mail) verknüpfen: nur mit dessen Passwort (und ggf. 2FA-Code).
  //     Ohne Passwort kein Login, denn zwei Konten mit derselben E-Mail gibt es nicht.
  fastify.get(
    '/api/auth/cevidb/link',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Status einer offenen Cevi.DB-Verknüpfung abrufen',
        description: 'Liefert E-Mail und Name eines Kontos, das mit einem Cevi.DB-Profil verknüpft werden soll.',
      },
    },
    async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const link = readPendingLink(request.cookies[PENDING_LINK_COOKIE]);
    if (!link) return reply.status(404).send({ error: 'Keine offene Verknüpfung. Melde dich nochmals mit Cevi.DB an.' });
    const user = await fastify.prisma.user.findUnique({
      where: { id: link.userId },
      select: { email: true, nickname: true, firstName: true, totpEnabledAt: true, totpOnProviderLogin: true },
    });
    if (!user) return reply.status(404).send({ error: 'Das Konto gibt es nicht mehr.' });
    return {
      email: user.email,
      name: user.nickname || user.firstName,
      returnTo: link.returnTo,
      twoFactorRequired: needsSecondFactor(user, 'password'),
    };
  });

  fastify.post(
    '/api/auth/cevidb/link',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Cevi.DB-Konto mit Passwort bestätigen und verknüpfen',
        description: 'Bestätigt die Kontoverknüpfung mit dem bisherigen Kontopasswort (und ggf. Zwei-Faktor-Code).',
        body: z.object({
          password: z.string().describe('Passwort des bestehenden Kontos'),
          code: z.string().trim().max(40).optional().describe('6-stelliger Zwei-Faktor-Code oder Wiederherstellungscode'),
        }),
      },
    },
    async (request, reply) => {
    if (tooManyRequests(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR });
    }
    const token = request.cookies[PENDING_LINK_COOKIE];
    const link = readPendingLink(token);
    if (!link) return reply.status(404).send({ error: 'Die Verknüpfung ist abgelaufen. Melde dich nochmals mit Cevi.DB an.' });

    const body = (request.body as { password?: string; code?: string }) ?? {};
    const password = typeof body.password === 'string' ? body.password : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const user = await fastify.prisma.user.findUnique({ where: { id: link.userId } });
    // Der Vergleich läuft immer über bcrypt; ein leeres Passwort oder fehlender Hash zählt nur als Fehlversuch
    const passwordOk = user?.passwordHash ? (await bcrypt.compare(password, user.passwordHash)) && password.length > 0 : false;
    if (!user || !passwordOk) {
      link.failedAttempts++;
      if (link.failedAttempts >= MAX_LINK_ATTEMPTS) {
        pendingLinks.delete(token!);
        reply.clearCookie(PENDING_LINK_COOKIE, { path: '/' });
        return reply
          .status(429)
          .send({ error: 'Zu viele falsche Passwörter. Melde dich nochmals mit Cevi.DB an.', code: 'RATE_LIMITED' });
      }
      return reply.status(401).send({ error: 'Das Passwort stimmt nicht.' });
    }

    // Ist 2FA auf dem Passwort-Konto aktiv, muss der 2FA-Code VOR dem Speichern der Verknüpfung geprüft werden
    let secondFactorVerified = false;
    if (needsSecondFactor(user, 'password')) {
      if (!code) {
        return reply.status(401).send({
          error: 'Bitte gib zusätzlich den 6-stelligen Code aus deiner Authenticator-App (oder einen Wiederherstellungscode) ein.',
          code: 'TWO_FACTOR_REQUIRED',
          twoFactorRequired: true,
        });
      }
      const ipBlocked = twoFactorFailuresByIp.hit(request.ip);
      const userBlocked = twoFactorFailuresByUser.hit(user.id);
      if (ipBlocked || userBlocked) {
        return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
      }
      const result = await consumeSecondFactor(fastify.prisma, user, code);
      if (!result.ok) {
        trackUsage('LOGIN_FAILED', { dim: 'TWO_FACTOR_WRONG' });
        link.failedAttempts++;
        if (link.failedAttempts >= MAX_LINK_ATTEMPTS) {
          pendingLinks.delete(token!);
          reply.clearCookie(PENDING_LINK_COOKIE, { path: '/' });
          return reply
            .status(429)
            .send({ error: 'Zu viele Fehlversuche. Melde dich nochmals an.', code: 'RATE_LIMITED' });
        }
        return reply.status(401).send({
          error: 'Der Code stimmt nicht oder wurde schon verwendet.',
          code: 'TWO_FACTOR_WRONG',
          twoFactorRequired: true,
        });
      }
      twoFactorFailuresByIp.undo(request.ip);
      twoFactorFailuresByUser.reset(user.id);
      secondFactorVerified = true;
    }

    pendingLinks.delete(token!);
    reply.clearCookie(PENDING_LINK_COOKIE, { path: '/' });
    const redirectUrl = await finishCeviDbLogin(
      reply,
      link.profile,
      link.returnTo,
      link.tenantSlug,
      user.id,
      link.provider || 'CEVI',
      link.invite ?? null,
      secondFactorVerified
    );
    fastify.log.info({ userId: user.id }, 'Passwort-Konto mit Provider verknüpft');
    trackUsage('ACCOUNT_LINK');
    return { redirectUrl };
  });

  fastify.delete(
    '/api/auth/cevidb/link',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Offene Cevi.DB-Verknüpfung verwerfen',
        description: 'Bricht den Verknüpfungsvorgang zwischen Cevi.DB und bestehendem Passwortkonto ab.',
      },
    },
    async (request, reply) => {
    const token = request.cookies[PENDING_LINK_COOKIE];
    if (token) pendingLinks.delete(token);
    reply.clearCookie(PENDING_LINK_COOKIE, { path: '/' });
    return { ok: true };
  });
};

export { hitobitoAuthRoutes };
export const ceviDbAuthRoutes = hitobitoAuthRoutes;
export default hitobitoAuthRoutes;

