import type { OrganizationConfig } from '@schichtplan/shared';

/**
 * Begriff mitten im Satz: Ausser im Deutschen klein beginnen («per sezioni Cevi», «for scout groups»),
 * Verbandsnamen am Anfang bleiben gross («Cevi departments», «Jubla groups»).
 */
export function termInSentence(term: string, locale: string, orgName?: string): string {
  if (locale.startsWith('de') || !term) return term;
  if (orgName && term.startsWith(orgName)) return term;
  return term.charAt(0).toLowerCase() + term.slice(1);
}

/**
 * Verbandsbegriffe als Platzhalter für den `landing`-Katalog. `org` (Slug) steuert in den Texten das
 * grammatische Geschlecht (z. B. «deine Abteilung» vs. «deinen Verein»). Ausserhalb des Deutschen werden
 * Ebene und Leitung im Satz klein geschrieben («ta section», «your department»).
 */
export function landingVocab(org: OrganizationConfig, locale: string) {
  const lower = (term: string) => (locale.startsWith('de') ? term : term.toLowerCase());
  return {
    org: org.slug,
    orgName: org.orgName,
    name: org.name,
    unit: lower(org.unitTerm),
    lead: lower(org.leadTerm),
    target: termInSentence(org.targetGroup, locale, org.orgName),
    auth: org.authProviderName,
    authShort: org.authProviderShort,
    nickname: org.nicknameTerm,
    highlight: org.heroHeadlineHighlight,
  };
}
