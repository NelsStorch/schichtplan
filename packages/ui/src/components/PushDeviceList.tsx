'use client';

import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Trash2 } from 'lucide-react';
import { SWISS_LOCALE, SWISS_TIMEZONE, type PushDeviceDto } from '@schichtplan/shared';
import { Badge } from './Badge';
import { Button } from './Button';
import { useConfirm, useToast } from './Feedback';

const dateFmt = new Intl.DateTimeFormat(SWISS_LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: SWISS_TIMEZONE });

export interface PushDeviceListProps {
  /** Endpoint des Abos dieses Browsers, damit «Dieses Gerät» auch ohne Cookie stimmt */
  localEndpoint?: string | null;
  /** Ändert sich der Wert, wird die Liste neu geladen (z. B. nach Ein-/Ausschalten) */
  refreshKey?: number;
  /** Nach dem Entfernen: neue Anzahl und ob es dieses Gerät war */
  onRemoved?: (result: { subscriptionCount: number; wasCurrent: boolean }) => void;
}

/**
 * Alle Geräte mit Push-Abo, mit Entfernen-Knopf. Hilft bei verlorenen Handys, doppelten Abos (z. B.
 * iPhone-Safari und App) und Geräten, die man nicht mehr in der Hand hat.
 */
export function PushDeviceList({ localEndpoint, refreshKey = 0, onRemoved }: PushDeviceListProps) {
  const confirm = useConfirm();
  const toast = useToast();
  const [devices, setDevices] = useState<PushDeviceDto[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const url = localEndpoint ? `/api/push/devices?endpoint=${encodeURIComponent(localEndpoint)}` : '/api/push/devices';
    const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setDevices((await res.json()) as PushDeviceDto[]);
    else setDevices([]);
  }, [localEndpoint]);

  useEffect(() => {
    void refreshKey;
    void load();
  }, [load, refreshKey]);

  const remove = async (device: PushDeviceDto) => {
    const ok = await confirm({
      title: 'Gerät entfernen?',
      description: `${device.label || 'Dieses Gerät'} bekommt danach keine Push-Mitteilungen mehr. Du kannst Push dort jederzeit wieder einschalten.`,
      confirmLabel: 'Entfernen',
      cancelLabel: 'Abbrechen',
      tone: 'danger',
    });
    if (!ok) return;
    setRemoving(device.id);
    try {
      const res = await fetch(`/api/push/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Entfernen hat nicht geklappt.');
      setDevices((prev) => (prev ?? []).filter((d) => d.id !== device.id));
      onRemoved?.({ subscriptionCount: data.subscriptionCount ?? 0, wasCurrent: device.current });
      toast({ title: 'Gerät entfernt' });
    } catch (err) {
      toast({ title: 'Entfernen fehlgeschlagen', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setRemoving(null);
    }
  };

  if (!devices || devices.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <div className="text-xs font-semibold text-fg-subtle">Geräte mit Push</div>
      <ul className="divide-y divide-line">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <Smartphone className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-fg">
                  <span className="truncate">{d.label || 'Unbekanntes Gerät'}</span>
                  {d.current && (
                    <Badge tone="accent" size="sm">
                      Dieses Gerät
                    </Badge>
                  )}
                </div>
                <div className="truncate text-xs text-fg-subtle">
                  Seit {dateFmt.format(new Date(d.createdAt))}
                  {d.origin ? ` · über ${d.origin}` : ''}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${d.label || 'Gerät'} entfernen`}
              disabled={removing === d.id}
              onClick={() => void remove(d)}
              className="shrink-0 text-danger-ink hover:bg-danger/10"
            >
              <Trash2 className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Entfernen</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
