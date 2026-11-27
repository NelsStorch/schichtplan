'use client';

import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, Dialog, Field, Textarea } from '@schichtplan/ui';
import { helpUrl } from '@schichtplan/shared';

/**
 * «Ersatz suchen»: Grund freiwillig. Die Person bleibt eingetragen, bis jemand übernimmt.
 * `personName` gesetzt = das OK sucht Ersatz für jemand anderen.
 */
export function ReplacementDialog({
  open,
  shiftLabel,
  personName,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  shiftLabel?: string;
  personName?: string | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const t = useTranslations('web.replacementDialog');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  const moreLink = (chunks: React.ReactNode) => (
    <a
      href={helpUrl('/helfen/ersatz-suchen/')}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-accent-ink hover:underline"
    >
      {chunks}
    </a>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={personName ? t('titleOther', { name: personName }) : t('titleSelf')}
      description={shiftLabel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancelAction')}
          </Button>
          <Button loading={busy} onClick={() => onSubmit(note.trim())}>
            {t('submitAction')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          {personName
            ? t.rich('descriptionOther', { name: personName, moreLink })
            : t.rich('descriptionSelf', { moreLink })}
        </p>
        <Field label={t('reasonLabel')}>
          <Textarea
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('reasonPlaceholder')}
          />
        </Field>
        <p className="flex items-start gap-2 rounded-field border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-ink">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t('privacyWarning')}
        </p>
      </div>
    </Dialog>
  );
}
