/**
 * Prüfung der Übersetzungskataloge (für `npm run i18n:check` und Tests):
 * - Quellsprache: jeder Eintrag ein nicht-leerer, gültiger ICU-Text, Schlüssel ohne Sonderzeichen.
 * - Übersetzungen: keine Schlüssel, die es im Deutschen nicht gibt; gültiges ICU; exakt dieselben
 *   Platzhalter und Tags wie die Quelle (sonst fehlen Werte oder es erscheinen rohe «{name}»).
 * - Abdeckung pro Sprache und Namespace; freigeschaltete Sprachen brauchen die Mindestabdeckung.
 * Fehlende Übersetzungen sind kein Fehler: Sie erscheinen auf Deutsch.
 */
import { parse } from '@formatjs/icu-messageformat-parser';
import { collectPlaceholders } from './icu.js';

export type Severity = 'error' | 'warning';

export interface CatalogIssue {
  severity: Severity;
  locale: string;
  namespace: string;
  key: string;
  message: string;
}

export interface CoverageEntry {
  locale: string;
  namespace: string;
  translated: number;
  total: number;
  percent: number;
}

export interface CheckResult {
  issues: CatalogIssue[];
  coverage: CoverageEntry[];
}

/** `{ de: { common: {...} }, fr: {...} }`, Werte so wie aus den JSON-Dateien gelesen */
export type RawCatalogs = Record<string, Record<string, unknown>>;

const KEY_SEGMENT = /^[A-Za-z][A-Za-z0-9_]*$/;

type Leaf = { key: string; value: unknown };

function flatten(tree: unknown, prefix = '', into: Leaf[] = []): Leaf[] {
  if (typeof tree === 'object' && tree !== null && !Array.isArray(tree)) {
    for (const [key, value] of Object.entries(tree)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) flatten(value, path, into);
      else into.push({ key: path, value });
    }
  }
  return into;
}

function placeholdersOf(message: string): { placeholders: Set<string> } | { error: string } {
  try {
    return { placeholders: collectPlaceholders(parse(message)) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function describe(set: Set<string>): string {
  return set.size ? [...set].sort().join(', ') : '(keine)';
}

export function checkCatalogs(catalogs: RawCatalogs, sourceLocale = 'de'): CheckResult {
  const issues: CatalogIssue[] = [];
  const coverage: CoverageEntry[] = [];
  const source = catalogs[sourceLocale];
  if (!source) {
    issues.push({ severity: 'error', locale: sourceLocale, namespace: '*', key: '*', message: 'Quellsprache fehlt' });
    return { issues, coverage };
  }

  // Quelle: Platzhalter je Schlüssel merken
  const sourcePlaceholders = new Map<string, Map<string, Set<string>>>();
  const sourceKeys = new Map<string, Set<string>>();
  for (const [namespace, tree] of Object.entries(source)) {
    const byKey = new Map<string, Set<string>>();
    sourcePlaceholders.set(namespace, byKey);
    const leaves = flatten(tree);
    sourceKeys.set(namespace, new Set(leaves.map((leaf) => leaf.key)));
    for (const { key, value } of leaves) {
      const issue = (message: string) =>
        issues.push({ severity: 'error', locale: sourceLocale, namespace, key, message });
      const badSegment = key.split('.').find((segment) => !KEY_SEGMENT.test(segment));
      if (badSegment !== undefined) issue(`Ungültiger Schlüsselteil «${badSegment}» (nur Buchstaben, Ziffern, _)`);
      if (typeof value !== 'string') {
        issue('Wert ist kein Text');
        continue;
      }
      if (value.trim() === '') {
        issue('Leerer Text in der Quellsprache');
        continue;
      }
      const parsed = placeholdersOf(value);
      if ('error' in parsed) {
        issue(`Ungültige ICU-Syntax: ${parsed.error}`);
        continue;
      }
      byKey.set(key, parsed.placeholders);
    }
  }

  for (const [locale, namespaces] of Object.entries(catalogs)) {
    if (locale === sourceLocale) continue;

    for (const namespace of Object.keys(namespaces)) {
      if (!sourcePlaceholders.has(namespace)) {
        issues.push({ severity: 'error', locale, namespace, key: '*', message: 'Namespace fehlt in der Quellsprache' });
      }
    }

    for (const [namespace, expected] of sourcePlaceholders) {
      const leaves = flatten(namespaces[namespace]);
      let translated = 0;
      for (const { key, value } of leaves) {
        const issue = (severity: Severity, message: string) => issues.push({ severity, locale, namespace, key, message });
        const want = expected.get(key);
        if (!want) {
          // Schlüssel mit ungültiger Quelle nicht doppelt melden: das hat die Quellprüfung schon getan
          if (!sourceKeys.get(namespace)?.has(key)) {
            issue('error', 'Schlüssel existiert nicht in der Quellsprache (verwaist)');
          }
          continue;
        }
        if (typeof value !== 'string') {
          issue('error', 'Wert ist kein Text');
          continue;
        }
        if (value.trim() === '') continue; // unübersetzt, erscheint auf Deutsch
        const parsed = placeholdersOf(value);
        if ('error' in parsed) {
          issue('error', `Ungültige ICU-Syntax: ${parsed.error}`);
          continue;
        }
        const missing = new Set([...want].filter((p) => !parsed.placeholders.has(p)));
        const extra = new Set([...parsed.placeholders].filter((p) => !want.has(p)));
        if (missing.size || extra.size) {
          issue(
            'error',
            `Platzhalter weichen ab: erwartet ${describe(want)}, gefunden ${describe(parsed.placeholders)}`,
          );
          continue;
        }
        translated += 1;
      }
      const total = expected.size;
      coverage.push({
        locale,
        namespace,
        translated,
        total,
        percent: total === 0 ? 100 : Math.floor((translated / total) * 1000) / 10,
      });
    }
  }

  return { issues, coverage };
}

/** Gesamtabdeckung einer Sprache über alle Namespaces */
export function totalCoverage(coverage: CoverageEntry[], locale: string): number {
  const entries = coverage.filter((c) => c.locale === locale);
  const total = entries.reduce((sum, c) => sum + c.total, 0);
  const translated = entries.reduce((sum, c) => sum + c.translated, 0);
  return total === 0 ? 100 : Math.floor((translated / total) * 1000) / 10;
}

/** Fehler für freigeschaltete Sprachen unter der Mindestabdeckung */
export function checkEnabledCoverage(
  coverage: CoverageEntry[],
  enabled: readonly string[],
  minPercent: number,
  sourceLocale = 'de',
): CatalogIssue[] {
  return enabled
    .filter((locale) => locale !== sourceLocale)
    .map((locale) => ({ locale, percent: totalCoverage(coverage, locale) }))
    .filter(({ percent }) => percent < minPercent)
    .map(({ locale, percent }) => ({
      severity: 'error' as const,
      locale,
      namespace: '*',
      key: '*',
      message: `Freigeschaltet, aber nur ${percent} % übersetzt (Minimum ${minPercent} %)`,
    }));
}
