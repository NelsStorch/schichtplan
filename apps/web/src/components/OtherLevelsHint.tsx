'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { getLoginUrl, type DepartmentCreationEligibilityDto } from '@schichtplan/shared';
import { Callout, buttonClasses, useOrganization } from '@schichtplan/ui';
import { api } from '@/lib/api';
import { usePortal } from '@/lib/portal';

const DISMISS_KEY = 'schichtplan:other-levels-hint-dismissed';

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Hinweis für Leitende, die laut Verbands-DB noch eine weitere Ebene leiten (z. B. Schar und Region, oder Bundesleitung
 * mit eigener Schar), für die es noch keinen Schichtplan gibt. Nach dem Login landen sie in ihrer Heimabteilung und
 * würden das Anlegen sonst nicht sehen. Pro Ebene ausblendbar (nur in diesem Browser).
 */
export function OtherLevelsHint() {
  const { user } = usePortal();
  const org = useOrganization();
  const [open, setOpen] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!user?.departmentLeader || org.slug === 'verein') return;
    let cancelled = false;
    api<DepartmentCreationEligibilityDto>('/api/departments/creation-eligibility')
      .then((e) => {
        if (cancelled || !e.eligible) return;
        const dismissed = readDismissed();
        setOpen(
          (e.options ?? [])
            .filter((o) => o.existingDepartment === null && !dismissed.includes(String(o.hitobitoGroupId)))
            .map((o) => ({ id: o.hitobitoGroupId, name: o.name }))
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.departmentLeader, org.slug]);

  if (open.length === 0) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...readDismissed(), ...open.map((o) => String(o.id))]));
    } catch {
      // ohne Speicher bleibt der Hinweis bis zum Neuladen weg
    }
    setOpen([]);
  };

  const names = open.map((o) => o.name);
  const label = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;

  return (
    <Callout tone="info" className="mt-6 max-w-xl" title={`Du leitest auch ${label}`}>
      <p className="text-[14px] leading-relaxed">
        Laut {org.authProviderShort} bist du dort Leitung. Dafür gibt es noch keinen eigenen Schichtplan, du kannst ihn mit
        einem Klick einrichten.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={getLoginUrl(undefined, '/abteilung-erstellen')}
          className={buttonClasses({ size: 'sm', className: 'justify-between gap-1' })}
        >
          Schichtplan einrichten <ArrowUpRight className="size-3.5" />
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg"
        >
          <X className="size-3.5" aria-hidden /> Nicht mehr anzeigen
        </button>
      </div>
    </Callout>
  );
}
