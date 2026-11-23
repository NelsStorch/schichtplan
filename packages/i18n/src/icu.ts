import { type MessageFormatElement, TYPE } from '@formatjs/icu-messageformat-parser';

/**
 * Namen aller Platzhalter einer ICU-Nachricht, auch verschachtelt in plural/select und Tags.
 * Tags erscheinen als `<name>`, damit `{link}` und `<link>…</link>` unterscheidbar bleiben.
 */
export function collectPlaceholders(ast: MessageFormatElement[], into = new Set<string>()): Set<string> {
  for (const el of ast) {
    switch (el.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        into.add(el.value);
        break;
      case TYPE.select:
      case TYPE.plural:
        into.add(el.value);
        for (const option of Object.values(el.options)) collectPlaceholders(option.value, into);
        break;
      case TYPE.tag:
        into.add(`<${el.value}>`);
        collectPlaceholders(el.children, into);
        break;
      default:
        break;
    }
  }
  return into;
}

/** Wendet `fn` auf jeden Textteil an (nicht auf Platzhalter, Plural-Schlüssel oder Tag-Namen) */
export function mapLiterals(ast: MessageFormatElement[], fn: (text: string) => string): MessageFormatElement[] {
  return ast.map((el) => {
    switch (el.type) {
      case TYPE.literal:
        return { ...el, value: fn(el.value) };
      case TYPE.select:
      case TYPE.plural:
        return {
          ...el,
          options: Object.fromEntries(
            Object.entries(el.options).map(([key, option]) => [key, { ...option, value: mapLiterals(option.value, fn) }]),
          ),
        };
      case TYPE.tag:
        return { ...el, children: mapLiterals(el.children, fn) };
      default:
        return el;
    }
  });
}

/** Länge des sichtbaren Textes (für die Verlängerung der Pseudo-Sprache) */
export function literalLength(ast: MessageFormatElement[]): number {
  let length = 0;
  mapLiterals(ast, (text) => {
    length += text.length;
    return text;
  });
  return length;
}
