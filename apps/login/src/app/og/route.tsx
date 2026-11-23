import { ImageResponse } from 'next/og';
import { OgCard, cachedOgImage, getRequestOrigin, loadBrandLogo, ogImageOptions } from '@schichtplan/ui/og';
import { getOrganization } from '@schichtplan/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { loginPage } from '@/lib/ogPages';

/** Vorschaubild des Logins; mit `?seite=<Unterseite>` mit deren Titel (siehe lib/ogPages.ts) */
export async function GET(request: Request) {
  const { host } = await getRequestOrigin();
  const [t, locale] = await Promise.all([getTranslations('login.meta'), getLocale()]);
  const org = getOrganization(host, locale);
  const key = new URL(request.url).searchParams.get('seite');
  const page = await loginPage(key, host);
  // Inhalt ändert sich nur mit einem Deploy; unbekannte Seiten teilen sich das Standardbild
  return cachedOgImage(`${host}:${locale}:${page ? key : ''}`, 24 * 60 * 60 * 1000, async () => {
    const logo = await loadBrandLogo(host);
    return new ImageResponse(
      (
        <OgCard
          logo={logo}
          eyebrow={org.name}
          accent={org.primaryColor}
          title={page?.title ?? t('ogTitle')}
          subtitle={page?.subtitle ?? t('ogSubtitle', { units: org.unitTermPlural })}
          host={host}
        />
      ),
      await ogImageOptions()
    );
  });
}
