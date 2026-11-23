'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, Building2, Check, Copy, Share2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  DepartmentCreationEligibilityDto,
  DepartmentCreationOwnGroupDto,
  DepartmentCreationRoleDto,
  UserDto,
} from '@schichtplan/shared';
import { getDepartmentUrl, helpUrl, termsUrl } from '@schichtplan/shared/redirect';
import { organizationForLevel, type OrganizationConfig } from '@schichtplan/shared';
import { Button, Callout, BrandLogo, Field, Input, ThemeToggle, buttonClasses, useOrganization } from '@schichtplan/ui';
import { afterLogin, cleanReturnTo } from '@/lib/destination';
import { AuthFooter } from '@/components/AuthFooter';
import { OtherProviderHint, isOtherProviderAccount } from '@/components/OtherProviderHint';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

/** Verbandsname davor, ausser die Gruppe heisst schon so (z. B. «Cevi Region Zürich») */
const withOrgName = (groupName: string, org: OrganizationConfig) =>
  groupName.toLowerCase().startsWith(org.orgName.toLowerCase()) ? groupName : `${org.orgName} ${groupName}`;

/** Name der Ortsgruppe ohne Zusatz, z. B. «Illnau-Effretikon» -> Subdomain «illnau-effretikon» */
const suggestedName = (e: DepartmentCreationEligibilityDto, org: OrganizationConfig) => {
  if (org.slug === 'verein') return '';
  return e.ortsgruppeName ? withOrgName(e.ortsgruppeName, org) : e.leaderGroupName ? withOrgName(e.leaderGroupName, org) : '';
};

const slugFromName = (name: string, org: OrganizationConfig) =>
  slugify(name.replace(new RegExp(`^${org.orgName}\\s+`, 'i'), ''));

/** «A», «A und B», «A, B und C» in der jeweiligen Sprache */
const joinNames = (names: string[], locale: string) =>
  new Intl.ListFormat(locale, { type: 'conjunction' }).format(names);

/** Eigene Gruppen (Scharen …) mit Status: Link zum Schichtplan oder «noch kein Schichtplan» */
function OwnGroups({ groups, org }: { groups: DepartmentCreationOwnGroupDto[]; org: OrganizationConfig }) {
  const t = useTranslations('login.createDepartment');
  return (
    <ul aria-label={t('ownGroupsAria', { authProviderShort: org.authProviderShort })} className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {groups.map((group) => (
        <li key={group.hitobitoGroupId} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="min-w-0">
            <span className="block text-[14px] font-medium text-fg">{group.name}</span>
            {group.groupType && <span className="block text-[13px] text-fg-muted">{group.groupType}</span>}
          </span>
          {group.existingDepartment ? (
            <a
              href={getDepartmentUrl(group.existingDepartment.slug, '/', org.dbType)}
              className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-accent-ink underline-offset-2 hover:underline"
            >
              {t('toShiftPlan')} <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          ) : (
            <span className="shrink-0 text-[12px] text-fg-subtle">{t('noShiftPlanYet')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Eigene Rollen aus der Verbands-DB: zeigt, welche als Leitung zählen und welche nicht */
function MyRoles({ roles, org }: { roles: DepartmentCreationRoleDto[]; org: OrganizationConfig }) {
  const t = useTranslations('login.createDepartment');
  const rulesLink = (chunks: React.ReactNode) => (
    <a
      href={helpUrl('/abteilung/gruppen-und-rollen/', org.domain)}
      className="inline-flex items-center gap-0.5 font-medium text-accent-ink underline-offset-2 hover:underline"
    >
      {chunks} <ArrowUpRight className="size-3.5" aria-hidden />
    </a>
  );
  return (
    <section aria-labelledby="meine-rollen" className="space-y-2.5">
      <h2 id="meine-rollen" className="text-[13px] font-semibold text-fg">
        {t('myRolesTitle', { authProviderShort: org.authProviderShort })}
      </h2>
      {roles.length === 0 ? (
        <p className="text-[14px] leading-relaxed text-fg-muted">
          {t.rich('noRolesFound', {
            authProviderShort: org.authProviderShort,
            rulesLink: () => rulesLink(t('whichRolesCount')),
          })}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {roles.map((role) => (
              <li key={`${role.roleName}-${role.groupName ?? ''}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-fg">{role.roleName}</span>
                  {role.groupName && <span className="block text-[13px] text-fg-muted">{role.groupName}</span>}
                </span>
                {role.isLeader ? (
                  <span className="shrink-0 rounded-full bg-success/12 px-2 py-0.5 text-[12px] font-medium text-success-ink">
                    {t('roleLeader')}
                  </span>
                ) : (
                  <span className="shrink-0 text-[12px] text-fg-subtle">{t('roleNotLeader')}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[13px] leading-relaxed text-fg-muted">
            {t.rich('wrongRoleHint', {
              authProviderShort: org.authProviderShort,
              rulesLink: () => rulesLink(t('whichRolesCount')),
            })}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Abteilung anlegen: erscheint nach dem Cevi.DB-Login einer Abteilungsleitung, deren Ortsgruppe
 * noch keinen Schichtplan hat. Die anlegende Person wird Hauptverantwortliche*r (Abteilungsleitung).
 */
function CreateDepartment() {
  const t = useTranslations('login.createDepartment');
  const intlLocale = useLocale();
  const searchParams = useSearchParams();
  const returnTo = cleanReturnTo(searchParams.get('return_to'));

  // Verband der Domain, vom Server-Layout bereitgestellt (richtig schon beim ersten Rendern)
  const org = useOrganization();

  const [eligibility, setEligibility] = useState<DepartmentCreationEligibilityDto | null>(null);
  const [user, setUser] = useState<UserDto | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  // Leitet die Person mehrere Ebenen (z. B. Abteilung und Region): die gewählte Hitobito-Gruppe
  const [groupId, setGroupId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  useEffect(() => {
    (async () => {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      if (meRes.status === 401) {
        window.location.href = `/?return_to=${encodeURIComponent(window.location.href)}`;
        return;
      }
      setUser((await meRes.json()) as UserDto);
      const res = await fetch('/api/departments/creation-eligibility', { cache: 'no-store' });
      const data = (await res.json()) as DepartmentCreationEligibilityDto;
      setEligibility(data);
      setGroupId(data.ortsgruppeId);
      const proposal = suggestedName(data, org);
      setName(proposal);
      setSlug(data.ortsgruppeName ? slugify(data.ortsgruppeName) : slugFromName(proposal, org));
    })().catch(() => setError(t('loadFailed')));
  }, [org, t]);

  // Ebenen ohne Schichtplan, unter denen die Person wählen kann (die unterste zuerst)
  const choices = (eligibility?.options ?? []).filter((o) => o.existingDepartment === null);
  const chosen = choices.find((o) => o.hitobitoGroupId === groupId) ?? null;
  const chosenName = chosen?.name ?? eligibility?.ortsgruppeName ?? null;
  // Höhere Ebene gewählt (Region, Kanton, Bund …): im Formular «Organisation» statt «Schar»
  const formOrg = organizationForLevel(org, chosen && chosen.level > 0 ? (chosen.groupType ?? 'Ebene') : null);

  const choose = (id: number) => {
    const option = choices.find((o) => o.hitobitoGroupId === id);
    if (!option) return;
    setGroupId(id);
    if (!nameTouched) setName(withOrgName(option.name, org));
    if (!slugTouched) setSlug(slugFromName(option.name, org));
  };

  /** «Später»: weiter wie nach einem normalen Login */
  const later = () => {
    window.location.href = afterLogin(user, returnTo, org.dbType);
  };

  const shareUrl = typeof window === 'undefined' ? '/abteilung-erstellen' : `${window.location.origin}/abteilung-erstellen`;
  // Eigene Gruppen laut Verbands-DB (Scharen, Abteilungen …), getrennt nach mit und ohne Schichtplan
  const ownGroups = eligibility?.ownGroups ?? [];
  const withoutPlan = ownGroups.filter((g) => g.existingDepartment === null);
  const withPlan = ownGroups.filter((g) => g.existingDepartment !== null);
  const notLeader = eligibility?.reason === 'NOT_LEADER' && org.slug !== 'verein';
  const noPlanYet = notLeader && withoutPlan.length > 0;
  const missingNames = joinNames(withoutPlan.map((g) => withOrgName(g.name, org)), intlLocale);

  const knownGroupName = eligibility?.ortsgruppeName ?? (withoutPlan.length === 1 ? withoutPlan[0].name : null);
  const groupLabel = knownGroupName ? withOrgName(knownGroupName, org) : t('ourUnit', { unitTerm: org.unitTerm });
  const shareMessage = t('shareMessage', {
    group: groupLabel,
    appName: org.name,
    unitTerm: org.unitTerm,
    authProviderShort: org.authProviderShort,
  });

  const copyForLeader = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(`${shareMessage} ${shareUrl}`);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 3000);
  };

  const shareWithLeader = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: t('shareTitle', { appName: org.name, group: groupLabel }),
          text: shareMessage,
          url: shareUrl,
        });
        return;
      } catch {
        // Abbruch des nativen Share-Dialogs ignorieren, bei Fehler auf Copy zurückfallen
      }
    }
    await copyForLeader();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/departments/cevidb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentName: name.trim(),
          slug,
          acceptTerms,
          ...(org.slug !== 'verein' && groupId !== null ? { hitobitoGroupId: groupId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('createFailed'));
      window.location.href = getDepartmentUrl(data.department.slug, '/', data.department?.organization ?? org.dbType);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createFailed'));
      setSaving(false);
    }
  };

  const rootHost = typeof window === 'undefined' ? '' : window.location.hostname.replace(/^login\./, '');

  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <div aria-hidden className="bg-campfire pointer-events-none fixed inset-x-0 top-0 h-[60vh] opacity-70" />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <BrandLogo className="size-8" alt="" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">{org.name}</span>
        </span>
        <ThemeToggle />
      </header>

      <main id="inhalt" className="relative mx-auto w-full max-w-[30rem] flex-1 px-5 pb-16 pt-6 sm:pt-10">
        {!eligibility ? (
          error ? (
            <Callout tone="danger">{error}</Callout>
          ) : (
            <div className="space-y-3" aria-busy>
              <div className="h-10 w-3/4 animate-pulse rounded-field bg-surface-2" />
              <div className="h-40 animate-pulse rounded-card bg-surface-2" />
            </div>
          )
        ) : eligibility.eligible ? (
          <form onSubmit={submit} className="animate-fade-up">
            <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
              <Building2 className="size-6" />
            </span>
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
              {org.slug === 'verein'
                ? t('titleVerein')
                : choices.length > 1
                  ? t('titleLevelChoice')
                  : t('titleNoPlanYet', { name: chosenName ?? `Deine ${formOrg.unitTerm}` })}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              {org.slug === 'verein'
                ? t('descVerein')
                : t('descOrg', {
                    authProviderShort: org.authProviderShort,
                    groupName: eligibility.leaderGroupName ? ` (${eligibility.leaderGroupName})` : '',
                    unitTerm: formOrg.unitTerm,
                  })}
            </p>

            <div className="mt-8 space-y-5">
              {error && <Callout tone="danger">{error}</Callout>}
              {choices.length > 1 && (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-[13px] font-semibold text-fg">{t('multipleLevelsLegend')}</legend>
                  {choices.map((option) => (
                    <label
                      key={option.hitobitoGroupId}
                      className={`flex cursor-pointer items-center gap-3 rounded-field border px-4 py-3 transition-colors ${
                        option.hitobitoGroupId === groupId ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:bg-surface-2'
                      }`}
                    >
                      <input
                        type="radio"
                        name="ebene"
                        className="accent-[rgb(var(--accent))]"
                        checked={option.hitobitoGroupId === groupId}
                        onChange={() => choose(option.hitobitoGroupId)}
                      />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-fg">{option.name}</span>
                        {option.groupType && <span className="block text-[13px] text-fg-muted">{option.groupType}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <Field label={org.slug === 'verein' ? t('nameLabelVerein') : t('nameLabel', { unitTerm: formOrg.unitTerm })} required>
                <Input
                  value={name}
                  onChange={(e) => {
                    setNameTouched(true);
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value.replace(new RegExp(`^${org.orgName}\\s+`, 'i'), '')));
                  }}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </Field>
              <Field
                label={t('subdomainLabel')}
                required
                hint={t('subdomainHint', { slug: slug || 'portal', rootHost })}
              >
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
                  minLength={3}
                  maxLength={30}
                  className="font-mono"
                  required
                />
              </Field>

              <Callout tone="info">
                <p>
                  {t('calloutInfo', { unitTerm: formOrg.unitTerm })}
                </p>
              </Callout>

              <label className="flex items-start gap-2.5 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  required
                  className="mt-0.5 size-4 shrink-0 accent-[rgb(var(--accent))]"
                />
                <span>
                  {t.rich('acceptTerms', {
                    unitTerm: formOrg.unitTerm,
                    termsLink: (chunks) => (
                      <a href={termsUrl(org.domain)} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                        {chunks}
                      </a>
                    ),
                  })}
                </span>
              </label>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={saving}
                disabled={!acceptTerms || name.trim().length < 2 || slug.length < 3}
              >
                {t('submit', { unitTerm: formOrg.unitTerm })}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={later}>
                {t('later')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="animate-fade-up space-y-6">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
              {noPlanYet ? t('noPlanYetTitle', { names: missingNames }) : t('unitTitle', { unitTerm: org.unitTerm })}
            </h1>
            {notLeader && withPlan.length > 0 && withoutPlan.length === 0 ? (
              <>
                <p className="text-[15px] leading-relaxed text-fg-muted">
                  {withPlan.length === 1
                    ? t('alreadyExistsSingle', { unitTerm: org.unitTerm })
                    : t('alreadyExistsMultiple', { unitTermPlural: org.unitTermPlural })}
                </p>
                <OwnGroups groups={withPlan} org={org} />
              </>
            ) : eligibility.reason === 'EXISTS' && eligibility.existingDepartment ? (
              <>
                <p className="text-[15px] leading-relaxed text-fg-muted">
                  {t('existsForUnit', { unitTerm: org.unitTerm, name: eligibility.existingDepartment.name })}
                </p>
                <a
                  href={getDepartmentUrl(eligibility.existingDepartment.slug)}
                  className={buttonClasses({ size: 'lg', className: 'w-full justify-between' })}
                >
                  {t('goToExisting', { name: eligibility.existingDepartment.name })} <ArrowUpRight />
                </a>
              </>
            ) : eligibility.reason === 'LIMIT' ? (
              <p className="text-[15px] leading-relaxed text-fg-muted">
                {t('limitReached')}
              </p>
            ) : eligibility.reason === 'NOT_CEVIDB' ? (
              org.slug === 'verein' ? (
                <>
                  <p className="text-[15px] leading-relaxed text-fg-muted">
                    {t('onlyRegisteredCanCreateVerein')}
                  </p>
                  <a
                    href={`/?return_to=${encodeURIComponent(
                      typeof window === 'undefined' ? '' : window.location.href
                    )}`}
                    className={buttonClasses({ size: 'lg', className: 'w-full justify-between' })}
                  >
                    {t('loginOrRegister')} <ArrowUpRight />
                  </a>
                </>
              ) : (
                <>
                  {/* Konto eines anderen Verbands (z. B. Cevi-Konto per Passwort auf Jubla): sagen, warum es nicht geht */}
                  {isOtherProviderAccount(user, org) ? (
                    <OtherProviderHint user={user} org={org} />
                  ) : (
                    <p className="text-[15px] leading-relaxed text-fg-muted">
                      {t('onlyLeaderCanCreateOrg', {
                        unitTerm: org.unitTerm,
                        authProviderShort: org.authProviderShort,
                      })}
                    </p>
                  )}
                  <a
                    href={`/api/auth/cevidb/login?returnTo=${encodeURIComponent(
                      typeof window === 'undefined' ? '' : window.location.href
                    )}&org=${encodeURIComponent(org.slug)}`}
                    className={buttonClasses({ size: 'lg', className: 'w-full justify-between' })}
                  >
                    {t('loginWithProvider', { authProviderShort: org.authProviderShort })} <ArrowUpRight />
                  </a>
                </>
              )
            ) : eligibility.reason === 'UNVERIFIED' ? (
              <p className="text-[15px] leading-relaxed text-fg-muted">
                {t('unverifiedGroup', { authProviderShort: org.authProviderShort })}
              </p>
            ) : eligibility.reason === 'NO_ORTSGRUPPE' ? (
              <p className="text-[15px] leading-relaxed text-fg-muted">
                {t('noGroupInProvider', {
                  authProviderShort: org.authProviderShort,
                  unitTerm: org.unitTerm,
                })}
              </p>
            ) : (
              <div className="space-y-5">
                <Callout
                  tone="info"
                  title={
                    org.slug === 'verein'
                      ? t('calloutCreateVereinTitle')
                      : noPlanYet
                        ? t('calloutSetupByLeaderTitle', { unitTerm: org.unitTerm })
                        : eligibility.ortsgruppeName
                          ? t('calloutGroupNoPlanTitle', { name: withOrgName(eligibility.ortsgruppeName, org) })
                          : t('calloutOnlyLeaderTitle', { unitTerm: org.unitTerm })
                  }
                >
                  {org.slug === 'verein' ? (
                    <p className="text-[14px] leading-relaxed">
                      {t('calloutCreateVereinText')}
                    </p>
                  ) : (
                    <p className="text-[14px] leading-relaxed">
                      {noPlanYet
                        ? t('calloutSetupByLeaderText', {
                            unitTerm: org.unitTerm,
                            authProviderShort: org.authProviderShort,
                          })
                        : t('calloutOnlyLeaderText', {
                            unitTerm: org.unitTerm,
                            authProviderShort: org.authProviderShort,
                          })}
                    </p>
                  )}
                </Callout>

                {/* Mehrere eigene Gruppen oder eine mit Schichtplan: alle zeigen, die mit Schichtplan verlinkt */}
                {notLeader && (ownGroups.length > 1 || withPlan.length > 0) && <OwnGroups groups={ownGroups} org={org} />}

                {/* Erst der Beleg (eigene Rollen), dann der Ausweg über die Leitung */}
                {eligibility.myRoles && <MyRoles roles={eligibility.myRoles} org={org} />}

                {org.slug !== 'verein' && (
                  <p className="text-[14px] leading-relaxed text-fg-muted">
                    <strong className="text-fg">{t('nextStepsTitle')}</strong>{' '}
                    {t.rich('nextStepsText', {
                      unitTerm: org.unitTerm,
                      personsPath: t('personsPath', { unitTerm: org.unitTerm }),
                      createEventsPermission: t('createEventsPermission'),
                      em: (chunks) => <em>{chunks}</em>,
                      strong: (chunks) => <strong className="text-fg">{chunks}</strong>,
                    })}
                  </p>
                )}

                {org.slug !== 'verein' && (
                  <div className="space-y-2.5">
                    <Button type="button" size="lg" className="w-full" onClick={shareWithLeader}>
                      <Share2 className="size-4" />
                      <span>{t('sendToLeader', { unitTerm: org.unitTerm })}</span>
                    </Button>
                    <Button type="button" variant="secondary" size="md" className="w-full" onClick={copyForLeader}>
                      {copiedShare ? <Check className="size-4" /> : <Copy className="size-4" />}
                      <span>{copiedShare ? t('copiedMessageAndLink') : t('copyMessageAndLink')}</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
            {/* Bei fehlender Leitung steht die Liste schon oben, direkt unter dem Grund */}
            {eligibility.myRoles && eligibility.reason !== 'NOT_LEADER' && <MyRoles roles={eligibility.myRoles} org={org} />}
            <Button variant="ghost" className="w-full" onClick={later}>
              {t('continueAction')}
            </Button>
          </div>
        )}
      </main>

      <AuthFooter />
    </div>
  );
}

export default function CreateDepartmentPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <CreateDepartment />
    </Suspense>
  );
}
