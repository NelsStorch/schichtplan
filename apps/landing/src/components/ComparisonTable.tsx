import {
  Check,
  X,
  AlertCircle,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { useLocale, useTranslations } from 'next-intl';
import { getOrganization, type OrganizationConfig } from '@schichtplan/shared';
import { landingVocab } from '@/lib/landingVocab';

type RowId = 'noPassword' | 'sso' | 'minAge' | 'calendar' | 'overview' | 'template' | 'privacy' | 'vouchers';

interface Row {
  title: string;
  desc?: string;
  excel: { state: 'no' | 'partial' | 'yes'; text: string };
  chat: { state: 'no' | 'partial' | 'yes'; text: string };
  cevi: { state: 'yes'; text: string };
}

export function ComparisonTable({ org }: { org?: OrganizationConfig }) {
  const locale = useLocale();
  const t = useTranslations('landing.comparison');
  const vocab = landingVocab(org ?? getOrganization(null, locale), locale);
  const name = vocab.name;

  const states: [RowId, Row['excel']['state'], Row['chat']['state']][] = [
    ['noPassword', 'partial', 'partial'],
    ['sso', 'no', 'no'],
    ['minAge', 'no', 'no'],
    ['calendar', 'no', 'no'],
    ['overview', 'partial', 'no'],
    ['template', 'partial', 'no'],
    ['privacy', 'no', 'no'],
    ['vouchers', 'no', 'no'],
  ];
  const rows: Row[] = states.map(([id, excel, chat]) => ({
    title: t(`rows.${id}.title`, vocab),
    desc: t(`rows.${id}.desc`, vocab),
    excel: { state: excel, text: t(`rows.${id}.excel`) },
    chat: { state: chat, text: t(`rows.${id}.chat`) },
    cevi: { state: 'yes', text: t(`rows.${id}.app`, vocab) },
  }));

  return (
    <section className="py-20 md:py-28 border-t border-line/60 relative">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="max-w-2xl mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-2xs font-bold uppercase tracking-[0.16em] bg-surface-2 border border-line text-fg-subtle mb-3">
            <Sparkles className="size-3 text-accent" />
            {t('badge')}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {t('title')}
          </h2>
          <p className="mt-3 text-base text-fg-muted leading-relaxed">
            {t('intro')}
          </p>
        </Reveal>

        {/* The Comparison Table */}
        <Reveal delay={100} className="rounded-card border border-line/80 bg-surface shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-line bg-surface-2/70">
                  {/* Sticky First Column Header on Mobile */}
                  <th scope="col" className="sticky left-0 z-20 py-4 px-4 sm:px-6 text-xs font-bold uppercase tracking-wider text-fg-subtle w-2/5 bg-surface-2 border-r border-line sm:border-r-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                    <div className="flex items-center justify-between gap-2">
                      <span>{t('feature')}</span>
                      <span className="sm:hidden text-[10px] font-normal normal-case text-fg-subtle">
                        {t('swipe')}
                      </span>
                    </div>
                  </th>
                  <th scope="col" className="py-4 px-3 sm:px-4 text-xs font-bold text-fg-muted text-center w-1/5">
                    {t('excel')}
                  </th>
                  <th scope="col" className="py-4 px-3 sm:px-4 text-xs font-bold text-fg-muted text-center w-1/5">
                    {t('chat')}
                  </th>
                  <th scope="col" className="py-4 px-4 sm:px-6 text-xs font-bold text-accent text-center w-1/5 bg-accent/8 border-l border-r border-accent/20">
                    <div className="inline-flex items-center gap-1.5 font-display text-sm font-extrabold text-accent-ink">
                      <span>{name}</span>
                      <ShieldCheck className="size-4 text-accent shrink-0" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-xs">
                {rows.map((row, idx) => (
                  <tr
                    key={row.title}
                    className={`transition-colors hover:bg-surface-2/40 ${
                      idx % 2 === 1 ? 'bg-surface-2/20' : ''
                    }`}
                  >
                    {/* Sticky Feature Title on Mobile */}
                    <td
                      className={`sticky left-0 z-10 py-3.5 sm:py-4 px-4 sm:px-6 border-r border-line sm:border-r-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] ${
                        idx % 2 === 1 ? 'bg-surface-2' : 'bg-surface'
                      }`}
                    >
                      <div className="font-semibold text-fg text-xs sm:text-sm">{row.title}</div>
                      {row.desc && (
                        <div className="text-2xs text-fg-subtle mt-0.5 leading-snug hidden sm:block">
                          {row.desc}
                        </div>
                      )}
                    </td>

                    {/* Column 2: Excel / Sheets */}
                    <td className="py-3.5 sm:py-4 px-3 sm:px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {row.excel.state === 'yes' ? (
                          <Check className="size-4 text-emerald-500" />
                        ) : row.excel.state === 'partial' ? (
                          <AlertCircle className="size-4 text-amber-500" />
                        ) : (
                          <X className="size-4 text-fg-subtle/50" />
                        )}
                        <span className="text-2xs text-fg-muted leading-tight text-balance">
                          {row.excel.text}
                        </span>
                      </div>
                    </td>

                    {/* Column 3: WhatsApp / Doodle */}
                    <td className="py-3.5 sm:py-4 px-3 sm:px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {row.chat.state === 'yes' ? (
                          <Check className="size-4 text-emerald-500" />
                        ) : row.chat.state === 'partial' ? (
                          <AlertCircle className="size-4 text-amber-500" />
                        ) : (
                          <X className="size-4 text-fg-subtle/50" />
                        )}
                        <span className="text-2xs text-fg-muted leading-tight text-balance">
                          {row.chat.text}
                        </span>
                      </div>
                    </td>

                    {/* Column 4: Schichtplan (Highlight Column) */}
                    <td className="py-3.5 sm:py-4 px-4 sm:px-6 text-center bg-accent/4 border-l border-r border-accent/20">
                      <div className="flex flex-col items-center gap-1">
                        <div className="size-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                          <Check className="size-3.5 text-emerald-500 font-bold" />
                        </div>
                        <span className="text-2xs font-semibold text-fg leading-tight text-balance">
                          {row.cevi.text}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
