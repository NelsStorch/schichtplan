import { createTranslator, type IntlError, IntlErrorCode, type NamespaceKeys, type NestedKeyOf } from 'use-intl/core';
import { I18N_TIME_ZONE, INTL_LOCALES, type Locale } from './config.js';
import { getMessages } from './load.js';
import type { Messages } from './messages/index.js';

export type I18nErrorMode = 'throw' | 'log';

export interface I18nErrorHandlerOptions {
  /** `throw` lässt Tests fehlschlagen, `log` meldet jeden Fehler einmal und zeigt den Fallback */
  mode?: I18nErrorMode;
  log?: (message: string) => void;
}

function defaultMode(): I18nErrorMode {
  // Ohne Node-Typen und auch im Browser lauffähig (dort gibt es kein process)
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.NODE_ENV === 'test' ? 'throw' : 'log';
}

/**
 * Fehlerbehandlung für next-intl und `getTranslator`. Weil fehlende Übersetzungen schon beim Laden mit Deutsch
 * aufgefüllt werden, bedeutet ein Fehler hier immer einen echten Fehler: Schlüssel fehlt auch im Deutschen oder
 * eine Nachricht ist ungültig. Im Log-Modus wird jeder Fehler nur einmal gemeldet (kein Spam pro Render).
 */
export function createI18nErrorHandler(options: I18nErrorHandlerOptions = {}): (error: IntlError) => void {
  const mode = options.mode ?? defaultMode();
  const log = options.log ?? ((message: string) => console.warn(message));
  const seen = new Set<string>();
  return (error) => {
    // Hinweis von use-intl, dass Formate fehlen, ist kein Übersetzungsfehler
    if (error.code === IntlErrorCode.ENVIRONMENT_FALLBACK) return;
    if (mode === 'throw') throw error;
    const id = `${error.code}:${error.originalMessage ?? error.message}`;
    if (seen.has(id)) return;
    seen.add(id);
    log(`[i18n] ${error.code}: ${error.originalMessage ?? error.message}`);
  };
}

/** Sichtbarer Platzhalter, wenn ein Text gar nicht aufgelöst werden kann: Schlüsselpfad statt leerer Stelle */
export function getMessageFallback({ namespace, key }: { namespace?: string; key: string }): string {
  return namespace ? `${namespace}.${key}` : key;
}

type TranslatorNamespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/**
 * Übersetzer für Backend, Jobs, Mails und PDFs (ohne React). Gleiche ICU-Syntax und gleiche Kataloge wie
 * next-intl in den Apps. Plural- und Zahlregeln nach Schweizer Variante, Zeitzone immer Europe/Zurich.
 *
 * @example getTranslator('fr', { namespace: 'common.actions' })('save') // «Enregistrer»
 */
export function getTranslator<const N extends TranslatorNamespace = never>(
  locale: Locale,
  options: { namespace?: N; onError?: (error: IntlError) => void } = {},
) {
  return createTranslator<Messages, N>({
    locale: INTL_LOCALES[locale],
    messages: getMessages(locale),
    namespace: options.namespace,
    timeZone: I18N_TIME_ZONE,
    onError: options.onError ?? createI18nErrorHandler(),
    getMessageFallback,
  });
}
