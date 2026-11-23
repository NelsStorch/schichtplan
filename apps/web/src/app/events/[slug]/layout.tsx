import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { eventPreviewMetadata } from './metadata';

/** Link-Vorschau mit Titel, Datum und freien Plätzen, soweit ohne Login sichtbar (siehe metadata.ts) */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const preview = await eventPreviewMetadata(slug);
  if (preview) return { robots: { index: false, follow: false }, ...preview };
  const t = await getTranslations('web.meta');
  return { robots: { index: false, follow: false }, title: t('eventFallbackTitle'), description: t('eventFallbackDesc') };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
