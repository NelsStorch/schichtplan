import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OkLayout } from '@/components/ok/OkLayout';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('web.ok.layout');
  return {
    title: t('title'),
    description: t('metaDesc'),
    robots: { index: false, follow: false },
  };
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <OkLayout slug={slug}>{children}</OkLayout>;
}
