'use client';

import { Building2, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { helpUrl } from '@schichtplan/shared';
import { Callout, buttonClasses, useOrganization } from '@schichtplan/ui';
import { departmentSetupUrl, useLoginHref } from '@/lib/api';
import type { EventDetails } from '@/lib/types';

/** Zeigt, ob und warum man sich (nicht) eintragen kann, mit dem passenden nächsten Schritt. */
export function AccessNotice({ event, loggedIn }: { event: EventDetails; loggedIn: boolean }) {
  const t = useTranslations('web.event.accessNotice');
  const loginHref = useLoginHref();
  const org = useOrganization();
  const { access } = event.viewer;

  if (access.via === 'MANAGER' || access.via === 'RULES' || access.via === 'LINK') return null;

  switch (access.reason) {
    case 'LOGIN_REQUIRED':
      return (
        <Callout tone="info" title={t('loginRequiredTitle')}>
          <p>{t('loginRequiredText', { nicknameTerm: org.nicknameTerm })}</p>
          <a href={loginHref} className={buttonClasses({ size: 'sm', className: 'mt-3' })}>
            <LogIn /> {t('loginRequiredBtn')}
          </a>
        </Callout>
      );
    case 'NO_DEPARTMENT':
      return (
        <Callout tone="warning" title={t('noDepartmentTitle', { unitTerm: org.unitTerm })}>
          <p>{t('forAudience', { audience: event.audience })}</p>
          <a href={departmentSetupUrl()} className={buttonClasses({ size: 'sm', className: 'mt-3' })}>
            <Building2 /> {t('noDepartmentBtn', { unitTerm: org.unitTerm })}
          </a>
        </Callout>
      );
    case 'CEVIDB_REQUIRED':
      return (
        <Callout tone="warning" title={t('cevidbRequiredTitle', { provider: org.authProviderShort || t('fallbackProvider') })}>
          <p>{access.message}</p>
          <a href={loginHref} className={buttonClasses({ size: 'sm', className: 'mt-3' })}>
            <ShieldCheck /> {t('cevidbRequiredBtn', { provider: org.authProviderShort || t('fallbackProvider') })}
          </a>
        </Callout>
      );
    case 'SIGNUP_CLOSED':
      return <Callout tone="info" title={t('signupClosedTitle')}>{access.message}</Callout>;
    case 'SIGNUP_NOT_YET_OPEN':
      return (
        <Callout tone="info" title={t('signupNotYetOpenTitle')}>
          <p>{access.message}</p>
          <p className="mt-1 text-xs text-fg-muted">
            {t('signupNotYetOpenHint')}
          </p>
        </Callout>
      );
    default:
      return (
        <Callout tone="info" title={t('notUnlockedTitle')}>
          <p>{access.message}</p>
          <p className="mt-2 flex items-start gap-1.5 text-xs">
            <KeyRound className="mt-0.5 size-3.5 shrink-0" /> {t('linkHint')}
          </p>
          <a
            href={helpUrl('/helfen/nicht-freigeschaltet/')}
            className="mt-2 inline-block text-xs font-semibold underline-offset-2 hover:underline"
          >
            {t('whyAllReasonsExplained')}
          </a>
          {loggedIn && access.reason !== 'LEADERS_ONLY' && (
            <a
              href={departmentSetupUrl()}
              className={buttonClasses({ size: 'sm', variant: 'secondary', className: 'mt-3' })}
            >
              <Building2 /> {t('changeDeptOrStufeBtn')}
            </a>
          )}
        </Callout>
      );
  }
}
