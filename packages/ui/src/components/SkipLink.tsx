import { useTranslations } from 'next-intl';
import { cn } from '../utils/cn';

/**
 * «Zum Inhalt springen»: wird erst bei Tastaturfokus sichtbar und springt zum Hauptinhalt.
 * Ziel ist standardmässig `<main id="inhalt">`.
 */
export function SkipLink({ targetId = 'inhalt', className }: { targetId?: string; className?: string }) {
  const t = useTranslations('ui');
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        'sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]',
        'focus:rounded-field focus:bg-accent focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-accent-fg focus:shadow-lift',
        className
      )}
    >
      {t('skipLink')}
    </a>
  );
}
