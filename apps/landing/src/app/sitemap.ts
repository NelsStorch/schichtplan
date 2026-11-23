import type { MetadataRoute } from 'next';
import { getRequestOrigin } from '@schichtplan/ui/og';
import { LOCALES } from '@schichtplan/i18n';

/**
 * Multilinguale Sitemap der Startseite:
 * Gibt / für Deutsch (Quellsprache, x-default) sowie /fr, /it, /en mit gegenseitigen
 * hreflang-Alternates zurück.
 * /datenschutz ist bewusst noindex, /login und /profil sind in robots.txt gesperrt.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { origin } = await getRequestOrigin();

  const languages: Record<string, string> = {
    'x-default': `${origin}/`,
    de: `${origin}/`,
    fr: `${origin}/fr`,
    it: `${origin}/it`,
    en: `${origin}/en`,
  };

  return [
    {
      url: `${origin}/`,
      alternates: {
        languages,
      },
    },
    ...LOCALES.filter((loc) => loc !== 'de').map((loc) => ({
      url: `${origin}/${loc}`,
      alternates: {
        languages,
      },
    })),
  ];
}
