'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { EventAccessType, EventQuestionType, RequiredProfileField } from '@schichtplan/shared';
import { useOrganization } from '@schichtplan/ui';

/**
 * Anzeige-Texte zu Anlass-Einstellungen aus `@schichtplan/shared` (Zugangs-Typen, Pflichtangaben, Fragetypen)
 * in der aktiven Sprache. Die Konstanten dort bleiben die fachliche Quelle (Schlüssel, Regeln).
 */
export function useEventText() {
  const t = useTranslations('web.eventText');
  const org = useOrganization();
  const locale = useLocale();

  return useMemo(() => {
    // Ausserhalb des Deutschen stehen Ebenen klein im Satz («toutes les sections»)
    const inSentence = (term: string) => (locale.startsWith('de') ? term : term.toLowerCase());
    const values = {
      org: org.slug,
      unit: inSentence(org.unitTerm),
      units: inSentence(org.unitTermPlural),
      provider: org.authProviderShort,
      nickname: org.nicknameTerm,
    };
    const accessType = (type: EventAccessType) => ({
      label: t(`access.${type}.label`, values),
      short: t(`access.${type}.short`, values),
      description: t(`access.${type}.description`, values),
    });
    const profileField = (field: RequiredProfileField) => t(`profileField.${field}`);
    const questionType = (type: EventQuestionType) => t(`questionType.${type}`);
    const shiftCategories = (['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'] as const).map((c) => t(`category.${c}`));
    return { accessType, profileField, questionType, shiftCategories };
  }, [t, org, locale]);
}
