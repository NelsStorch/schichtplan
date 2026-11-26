import { getRequestConfig } from 'next-intl/server';
import { createRequestConfig } from '@schichtplan/ui/i18n/server';
import { routing } from './routing';

/**
 * Sprache und Texte pro Anfrage mit Sprach-Routing (Konzept: docs/public/i18n.md, Schritt 9).
 * Liest `requestLocale` aus der Route (z. B. 'fr' aus /fr/...) und initialisiert die Kataloge.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && (routing.locales as readonly string[]).includes(requested)
      ? requested
      : undefined;

  return createRequestConfig({
    namespaces: ['common', 'ui', 'landing'],
    locale,
    enabledLocales: routing.locales,
    // next-intl braucht hier exakt die Routing-Sprache (fr), nicht fr-CH: sonst Links auf /fr-CH/… (404)
    localeFormat: 'routing',
  });
});
