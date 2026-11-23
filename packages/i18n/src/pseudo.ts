/**
 * Pseudo-Sprache `xx` für die Entwicklung: «Schicht speichern» → «[Šçħïçħţ šþéïçħéŕñ ~~~~~]».
 * - Akzente zeigen, welche Texte schon über Kataloge laufen (deutsche Reste fallen sofort auf).
 * - Klammern zeigen abgeschnittene Texte.
 * - Die Verlängerung um ~35 % simuliert Französisch/Italienisch und deckt zu knappe Layouts auf.
 * Nur in Dev einbinden: Das Paket enthält den ICU-Parser.
 */
import { parse } from '@formatjs/icu-messageformat-parser';
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js';
import { literalLength, mapLiterals } from './icu.js';

const ACCENTS: Record<string, string> = {
  a: 'å', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ħ', i: 'ï', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ø', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ħ', I: 'Ï', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ø', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

const EXPANSION = 0.35;

function accent(text: string): string {
  let out = '';
  for (const char of text) out += ACCENTS[char] ?? char;
  return out;
}

/** Eine ICU-Nachricht pseudo-übersetzen; Platzhalter, Plural- und Tag-Struktur bleiben erhalten */
export function pseudoLocalize(message: string): string {
  try {
    const ast = mapLiterals(parse(message), accent);
    const padding = '~'.repeat(Math.max(1, Math.ceil(literalLength(ast) * EXPANSION)));
    return `[${printAST(ast)} ${padding}]`;
  } catch {
    // Ungültige Nachricht: unverändert lassen, die Katalogprüfung meldet sie
    return message;
  }
}

/** Ganzen Katalog (verschachteltes Objekt) pseudo-übersetzen */
export function pseudoLocalizeMessages<T>(messages: T): T {
  if (typeof messages === 'string') return pseudoLocalize(messages) as T;
  if (typeof messages !== 'object' || messages === null || Array.isArray(messages)) return messages;
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [key, pseudoLocalizeMessages(value)]),
  ) as T;
}
