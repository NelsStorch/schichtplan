'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, UtensilsCrossed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CateringTokenDto } from '@schichtplan/shared';
import { Button, Dialog, EmptyState } from '@schichtplan/ui';
import { CateringTokenCard } from '@/components/CateringTokenCard';
import { api, errorMessage } from '@/lib/api';

interface CateringTokensDialogProps {
  open: boolean;
  onClose: () => void;
  eventSlug: string;
  eventTitle: string;
}

export function CateringTokensDialog({
  open,
  onClose,
  eventSlug,
  eventTitle,
}: CateringTokensDialogProps) {
  const t = useTranslations('web.cateringDialog');
  const [tokens, setTokens] = useState<CateringTokenDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<CateringTokenDto[] | { tokens?: CateringTokenDto[] }>(
        `/api/events/${eventSlug}/my-catering-tokens`
      );
      setTokens(Array.isArray(data) ? data : (data.tokens ?? []));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [eventSlug]);

  useEffect(() => {
    if (open) {
      void loadTokens();
    }
  }, [open, loadTokens]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      icon={<UtensilsCrossed />}
      title={t('title')}
      description={t('description', { eventTitle })}
    >
      <div className="space-y-4">
        {loading ? (
          <div className="py-12 text-center text-fg-muted flex flex-col items-center justify-center gap-2">
            <Loader2 className="size-6 animate-spin text-accent-ink" />
            <p className="text-xs">{t('loading')}</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-center text-xs text-danger-ink">
            {error}
          </div>
        ) : tokens.length === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">
              {t('instructions')}
            </p>
            <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {tokens.map((tokenItem) => (
                <CateringTokenCard
                  key={tokenItem.id}
                  token={tokenItem}
                  slug={eventSlug}
                  onRedeemed={(updated) => {
                    setTokens((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('closeAction')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
