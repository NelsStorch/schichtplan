import { ImageResponse } from 'next/og';
import { OgCard, cachedOgImage, getRequestOrigin, loadBrandLogo, ogImageOptions } from '@schichtplan/ui/og';
import { getOrganization } from '@schichtplan/shared';
import { parseLocale, type Locale } from '@schichtplan/i18n';
import { landingPage } from '@/lib/ogPages';

const DEFAULT_TITLES: Record<Locale, (org: ReturnType<typeof getOrganization>) => { title: string; subtitle: string }> = {
  de: (org) => ({
    title: `Schichtplanung für ${org.targetGroup}`,
    subtitle: 'Helfereinsätze an Lagern und Festen ohne Excel-Chaos.',
  }),
  fr: (org) => ({
    title: `Planification des créneaux pour ${org.targetGroup}`,
    subtitle: "Engagements bénévoles lors des camps et fêtes sans le chaos d'Excel.",
  }),
  it: (org) => ({
    title: `Pianificazione dei turni per ${org.targetGroup}`,
    subtitle: 'Turni di volontariato per campi e feste senza il caos di Excel.',
  }),
  en: (org) => ({
    title: `Shift scheduling for ${org.targetGroup}`,
    subtitle: 'Volunteer shifts at camps and festivals without spreadsheet chaos.',
  }),
};

/** Vorschaubild der Landingpage; mit `?seite=<Unterseite>` und `?lang=<Sprache>` (siehe lib/ogPages.ts) */
export async function GET(request: Request) {
  const { host } = await getRequestOrigin();
  const url = new URL(request.url);
  const langParam = url.searchParams.get('lang') ?? url.searchParams.get('locale');
  const locale = (parseLocale(langParam) ?? 'de') as Locale;
  const org = getOrganization(host, locale);
  const key = url.searchParams.get('seite');
  const page = landingPage(key, org, locale);
  const fallback = DEFAULT_TITLES[locale](org);

  // Inhalt ändert sich nur mit einem Deploy; unbekannte Seiten teilen sich das Standardbild
  return cachedOgImage(`${host}:${locale}:${page ? key : ''}`, 24 * 60 * 60 * 1000, async () => {
    const logo = await loadBrandLogo(host);
    return new ImageResponse(
      (
        <OgCard
          logo={logo}
          eyebrow={org.name}
          accent={org.primaryColor}
          title={page?.title ?? fallback.title}
          subtitle={page?.subtitle ?? fallback.subtitle}
          host={host}
        />
      ),
      await ogImageOptions()
    );
  });
}
