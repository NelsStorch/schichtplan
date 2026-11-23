import { useTranslations } from 'next-intl';
import { INTL_LOCALES, type Locale } from '@schichtplan/i18n';
import type { OrganizationConfig } from '@schichtplan/shared';
import { localizedPath } from '@/i18n/routing';

interface JsonLdProps {
  origin: string;
  locale: Locale;
  org: OrganizationConfig;
}

/**
 * Strukturierte Daten als ein verknüpfter Graph (Organization → WebSite → WebApplication).
 * Bewusst ohne HowTo (keine Rich Results mehr seit 2023), ohne FAQPage.
 */
export function JsonLd({ origin, locale, org }: JsonLdProps) {
  const t = useTranslations('landing.structuredData');
  const homePath = localizedPath(locale, '/');
  const home = `${origin}${homePath === '/' ? '/' : homePath}`;
  const inLanguage = INTL_LOCALES[locale];
  const organizationId = `${origin}/#organization`;
  const name = org.name;
  const vocab = { orgName: org.orgName, target: org.targetGroup };
  const logoUrl = `${origin}${org.logoUrl}`;

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name,
        url: home,
        description: t('orgDescription', vocab),
        logo: {
          '@type': 'ImageObject',
          url: logoUrl,
        },
        sameAs: ['https://github.com/NelsStorch/schichtplan_v2'],
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: home,
        name,
        inLanguage,
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'WebApplication',
        '@id': `${origin}/#webapp`,
        name,
        alternateName: [t('alternatePlanner', vocab), t('alternatePlanning', vocab), t('alternateList')],
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        browserRequirements: 'Requires JavaScript. Requires HTML5.',
        isAccessibleForFree: true,
        url: home,
        image: logoUrl,
        screenshot: `${origin}/og`,
        description: t('appDescription', vocab),
        inLanguage,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'CHF',
          availability: 'https://schema.org/InStock',
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
