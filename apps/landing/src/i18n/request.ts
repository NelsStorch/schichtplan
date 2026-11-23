import { getRequestConfig } from 'next-intl/server';
import { createRequestConfig } from '@schichtplan/ui/i18n/server';

/**
 * Sprache und Texte pro Anfrage, vorerst ohne Sprach-Präfix in der URL (Konzept: docs/internal/i18n-konzept.md,
 * Schritt 9 bringt /fr/… mit hreflang). Übersetzt sind bisher die gemeinsamen Teile aus @schichtplan/ui (Profil).
 */
export default getRequestConfig(() => createRequestConfig({ namespaces: ['common', 'ui'] }));
