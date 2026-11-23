'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  isDepartmentPermission,
  normalizePermissions,
  permissionPresetOf,
  type DepartmentPermission,
  type DepartmentPermissionPreset,
} from '@schichtplan/shared';
import { useOrganization } from '@schichtplan/ui';

/**
 * Bezeichnungen der Abteilungsrechte und Rechte-Vorlagen in der aktiven Sprache.
 * Die Konstanten in `@schichtplan/shared` bleiben die fachliche Quelle (Schlüssel, Abhängigkeiten).
 */
export function usePermissionText() {
  const t = useTranslations('web.perm');
  const org = useOrganization();
  return useMemo(() => {
    const provider = org.authProviderShort || t('providerFallback');

    const label = (p: DepartmentPermission) => t(`${p}.label`);
    const description = (p: DepartmentPermission) => t(`${p}.description`, { provider });
    const presetLabel = (p: DepartmentPermissionPreset) => t(`preset.${p}.label`);
    const presetDescription = (p: DepartmentPermissionPreset) => t(`preset.${p}.description`, { lead: org.leadTerm });

    /** Wie `departmentRoleLabel`: Leitung, Vorlage, «Eigene Rechte», «Mitglied» oder «Gast» */
    const roleLabel = (person: { isLeader: boolean; permissions: readonly string[]; isHomeDepartment: boolean }) => {
      if (person.isLeader) return org.leadTerm;
      if (normalizePermissions(person.permissions).length > 0) {
        const preset = permissionPresetOf(person.permissions);
        return preset ? presetLabel(preset) : t('custom');
      }
      return person.isHomeDepartment ? t('member') : t('guest');
    };

    /** Für Protokolleinträge: unbekannte Werte unverändert */
    const anyLabel = (value: string) => (isDepartmentPermission(value) ? label(value) : value);

    return { label, description, presetLabel, presetDescription, roleLabel, anyLabel };
  }, [t, org]);
}

/** Eigene OK-Funktion, ohne die vom Backend gespeicherten deutschen Standardtitel (werden übersetzt angezeigt) */
export function customRoleTitle(roleTitle: string | null | undefined): string | null {
  const title = roleTitle?.trim();
  return title && title !== 'OK-Leitung' && title !== 'OK-Mitglied' ? title : null;
}
