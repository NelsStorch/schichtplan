/**
 * Sprache pro Anfrage und übersetzte Fehlermeldungen (Konzept: docs/internal/i18n-konzept.md).
 *
 * - `request.locale` / `request.intlLocale`: Sprache nach derselben Kette wie in den Apps
 *   (Cookie `NEXT_LOCALE` → Browser → Standardsprache der Abteilung → Deutsch), nur freigeschaltete Sprachen.
 * - `request.t('signup.shiftFull')`: Text aus dem Namespace `api` von @schichtplan/i18n (Fehler und `success.*`).
 * - `reply.fail(409, 'signup.shiftFull', werte?, extra?)`: sendet `{ error, code, ...extra }`. `error` ist schon
 *   übersetzt (bestehende Frontends zeigen ihn an), `code` stabil für Logik (Standard aus dem Schlüssel,
 *   z. B. SIGNUP_SHIFT_FULL; bestehende Codes über `extra.code` beibehalten).
 *
 * Sprache und Übersetzer sind Getter: Sie funktionieren auch, bevor die Abteilung bekannt ist (z. B. bei
 * Validierungsfehlern), dann ohne deren Standardsprache.
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  INTL_LOCALES,
  LOCALE_COOKIE,
  getEnabledLocales,
  getTranslator,
  resolveLocale,
  type Locale,
  type MessageKey,
} from '@schichtplan/i18n';

export type ErrorKey = MessageKey<'api'>;
export type ErrorValues = Record<string, string | number | Date>;
export type ErrorTranslator = (key: ErrorKey, values?: ErrorValues) => string;

declare module 'fastify' {
  interface FastifyRequest {
    /** Sprache der Anfrage (de, fr, it, en) */
    readonly locale: Locale;
    /** BCP-47 für Intl (de-CH …), z. B. für `formatZurichTime(d, request.intlLocale)` */
    readonly intlLocale: string;
    /** Fehlermeldung in der Sprache der Anfrage */
    readonly t: ErrorTranslator;
  }
  interface FastifyReply {
    /** Fehler mit übersetzter Meldung senden */
    fail(statusCode: number, key: ErrorKey, values?: ErrorValues, extra?: Record<string, unknown>): FastifyReply;
  }
}

const translators = new Map<Locale, ErrorTranslator>();

/** Übersetzer für Fehlermeldungen einer Sprache (zwischengespeichert, auch für Jobs ohne Anfrage) */
export function errorTranslator(locale: Locale): ErrorTranslator {
  let t = translators.get(locale);
  if (!t) {
    const translate = getTranslator(locale, { namespace: 'api' });
    t = (key, values) => (translate as unknown as (k: string, v?: ErrorValues) => string)(key, values);
    translators.set(locale, t);
  }
  return t;
}

/**
 * Fehler mit Schlüssel aus Services, die keine Anfrage kennen. Die Route übersetzt ihn mit
 * `request.t(err.key, err.values)`; `message` ist die deutsche Fassung (Logs, Tests).
 */
export class TranslatableError extends Error {
  constructor(
    readonly key: ErrorKey,
    readonly values?: ErrorValues
  ) {
    super(errorTranslator('de')(key, values));
    this.name = 'TranslatableError';
  }
}

/** `signup.shiftFull` → `SIGNUP_SHIFT_FULL` */
export function errorCode(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/\./g, '_')
    .toUpperCase();
}

function header(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/** Sprache einer Anfrage (ohne Zwischenspeicher: die Abteilung kann im Lauf der Anfrage noch dazukommen) */
export function requestLocale(request: FastifyRequest): Locale {
  const enabled = getEnabledLocales(request.organization, process.env.I18N_ENABLED_LOCALES);
  return resolveLocale({
    cookie: request.cookies?.[LOCALE_COOKIE] ?? null,
    acceptLanguage: header(request, 'accept-language'),
    department: request.tenant?.defaultLocale ?? null,
    enabled,
  }).locale;
}

const i18nPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('locale', {
    getter(this: FastifyRequest) {
      return requestLocale(this);
    },
  });
  fastify.decorateRequest('intlLocale', {
    getter(this: FastifyRequest) {
      return INTL_LOCALES[requestLocale(this)];
    },
  });
  fastify.decorateRequest('t', {
    getter(this: FastifyRequest) {
      return errorTranslator(requestLocale(this));
    },
  });
  fastify.decorateReply(
    'fail',
    function fail(this: FastifyReply, statusCode: number, key: ErrorKey, values?: ErrorValues, extra?: Record<string, unknown>) {
      return this.status(statusCode).send({ error: this.request.t(key, values), code: errorCode(key), ...extra });
    }
  );
};

export default fp(i18nPlugin, { name: 'i18n' });
