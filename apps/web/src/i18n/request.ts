import { getRequestConfig } from 'next-intl/server';
import { createRequestConfig } from '@schichtplan/ui/i18n/server';
import { getDepartmentPreview } from '@/lib/og';

/** Sprache und Texte pro Anfrage (Konzept: docs/internal/i18n-konzept.md); Standardsprache von der Abteilung */
export default getRequestConfig(async () => {
  const department = await getDepartmentPreview();
  return createRequestConfig({ namespaces: ['common', 'ui', 'web'], department: department?.defaultLocale });
});
