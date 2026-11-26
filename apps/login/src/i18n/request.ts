import { getRequestConfig } from 'next-intl/server';
import { createRequestConfig } from '@schichtplan/ui/i18n/server';

/** Sprache und Texte pro Anfrage (Konzept: docs/public/i18n.md) */
export default getRequestConfig(() => createRequestConfig({ namespaces: ['common', 'ui', 'login'] }));
