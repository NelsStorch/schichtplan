import { DEFAULT_LOCALE, type Locale } from './config.js';
import { CATALOGS, type Messages, NAMESPACES, type Namespace } from './messages/index.js';

type Tree = { [key: string]: unknown };

function isTree(value: unknown): value is Tree {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Legt `overlay` über `base`. Nur nicht-leere Texte überschreiben: Übersetzungswerkzeuge (Weblate) speichern
 * Unübersetztes teils als leeren String, der darf den deutschen Text nicht verdrängen.
 */
export function mergeMessages<T extends object>(base: T, overlay: unknown): T {
  if (!isTree(overlay)) return base;
  const result: Tree = { ...(base as Tree) };
  for (const [key, baseValue] of Object.entries(base as Tree)) {
    const value = overlay[key];
    if (isTree(baseValue)) {
      result[key] = mergeMessages(baseValue, value);
    } else if (typeof value === 'string' && value.trim() !== '') {
      result[key] = value;
    }
  }
  return result as T;
}

const cache = new Map<Locale, Messages>();

/** Alle Texte einer Sprache, Lücken mit Deutsch gefüllt (zwischengespeichert, Kataloge sind unveränderlich) */
export function getMessages(locale: Locale): Messages {
  const cached = cache.get(locale);
  if (cached) return cached;
  // Quelle ist immer Deutsch (DEFAULT_LOCALE); direkt adressiert, damit der Typ vollständig bleibt
  const source = CATALOGS.de;
  const merged = locale === DEFAULT_LOCALE ? source : mergeMessages(source, CATALOGS[locale]);
  cache.set(locale, merged);
  return merged;
}

/**
 * Nur die genannten Namespaces, z. B. für `NextIntlClientProvider`: Client-Komponenten bekommen so nicht
 * jeden Text aller Apps ins Bundle.
 */
export function pickMessages<const N extends readonly Namespace[]>(
  locale: Locale,
  namespaces: N,
): Pick<Messages, N[number]> {
  const all = getMessages(locale);
  const picked = {} as Pick<Messages, N[number]>;
  for (const ns of namespaces) {
    (picked as Record<string, unknown>)[ns] = all[ns];
  }
  return picked;
}

export { NAMESPACES };
