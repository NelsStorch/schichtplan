#!/usr/bin/env node
/**
 * Prüft die Übersetzungskataloge in src/messages (nach `tsc`, nutzt dist/).
 * Aufruf: `npm run i18n:check` im Root. Optionen: `--verbose` listet fehlende Übersetzungen einzeln.
 * Exit-Code 1 bei Fehlern (ungültiges ICU, abweichende Platzhalter, verwaiste Schlüssel, vergessene Dateien,
 * freigeschaltete Sprache unter der Mindestabdeckung). Fehlende Übersetzungen allein sind kein Fehler.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCatalogs, checkEnabledCoverage, totalCoverage } from '../dist/check.js';
import { ENABLED_LOCALES, LOCALES, MIN_COVERAGE_ENABLED, NAMESPACES } from '../dist/index.js';

const verbose = process.argv.includes('--verbose');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'messages');
const issues = [];
const catalogs = {};

for (const locale of readdirSync(root)) {
  const dir = join(root, locale);
  if (!statSync(dir).isDirectory()) continue;
  if (!LOCALES.includes(locale)) {
    issues.push({ severity: 'error', locale, namespace: '*', key: '*', message: 'Ordner ist keine Sprache aus LOCALES' });
    continue;
  }
  catalogs[locale] = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const namespace = file.replace(/\.json$/, '');
    if (!NAMESPACES.includes(namespace)) {
      issues.push({
        severity: 'error',
        locale,
        namespace,
        key: '*',
        message: 'Datei ist nicht in src/messages/index.ts (NAMESPACES/CATALOGS) eingetragen',
      });
    }
    try {
      catalogs[locale][namespace] = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      issues.push({ severity: 'error', locale, namespace, key: '*', message: `Kein gültiges JSON: ${error.message}` });
    }
  }
}

for (const namespace of NAMESPACES) {
  if (!catalogs.de?.[namespace]) {
    issues.push({ severity: 'error', locale: 'de', namespace, key: '*', message: 'Namespace-Datei fehlt' });
  }
}

const result = checkCatalogs(catalogs, 'de');
issues.push(...result.issues);

const enabled = [...new Set(Object.values(ENABLED_LOCALES).flat())];
issues.push(...checkEnabledCoverage(result.coverage, enabled, MIN_COVERAGE_ENABLED));

// Bericht
console.log('Übersetzungsabdeckung');
for (const locale of LOCALES.filter((l) => l !== 'de')) {
  const perNamespace = result.coverage
    .filter((c) => c.locale === locale)
    .map((c) => `${c.namespace} ${c.translated}/${c.total}`)
    .join(', ');
  const flag = enabled.includes(locale) ? ' (freigeschaltet)' : '';
  console.log(`  ${locale}: ${totalCoverage(result.coverage, locale)} %${flag}  [${perNamespace}]`);
  if (verbose) {
    const translatedKeys = new Set();
    // Fehlende Schlüssel auflisten: Quelle minus übersetzte (nicht-leere) Einträge
    const flat = (tree, prefix = '') =>
      Object.entries(tree ?? {}).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
      );
    for (const ns of NAMESPACES) {
      for (const [key, value] of flat(catalogs[locale]?.[ns])) {
        if (typeof value === 'string' && value.trim()) translatedKeys.add(`${ns}.${key}`);
      }
      for (const [key] of flat(catalogs.de?.[ns])) {
        if (!translatedKeys.has(`${ns}.${key}`)) console.log(`      fehlt: ${ns}.${key}`);
      }
    }
  }
}

const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');
for (const i of [...errors, ...warnings]) {
  console.log(`${i.severity === 'error' ? 'FEHLER' : 'Warnung'} ${i.locale}/${i.namespace}: ${i.key}: ${i.message}`);
}
console.log(errors.length ? `\n${errors.length} Fehler in den Katalogen.` : '\nKataloge in Ordnung.');
process.exit(errors.length ? 1 : 0);
