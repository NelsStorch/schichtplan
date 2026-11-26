import { Link } from '@/i18n/navigation';
import { LandingLocaleSwitcher } from '@/components/LandingLocaleSwitcher';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DEFAULT_LOCALE, type Locale } from '@schichtplan/i18n';
import { routing } from '@/i18n/routing';
import {
  Flame,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  LifeBuoy,
  ShieldCheck,
  ChevronDown,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Heart,
  Users,
} from 'lucide-react';
import {
  helpUrl,
  statusUrl,
  getOrganization,
  organizationSiteUrl,
  getDepartmentCreationUrl,
  getLandingUrl,
  VERBAND_ORGANIZATIONS,
} from '@schichtplan/shared';
import { getRequestOrigin } from '@schichtplan/ui/og';
import { BrandLogo } from '@/components/BrandLogo';
import { ThemeToggle, buttonClasses } from '@schichtplan/ui';
import { CampfireBackground } from '@/components/CampfireBackground';
import { Hero3DStage } from '@/components/Hero3DStage';
import { ComparisonTable } from '@/components/ComparisonTable';
import { Reveal } from '@/components/Reveal';
import { StepsTimeline } from '@/components/StepsTimeline';
import { HitobitoIsometricGraphic } from '@/components/HitobitoIsometricGraphic';
import { SubdomainIsometricGraphic } from '@/components/SubdomainIsometricGraphic';
import { MultiEventIsometricGraphic } from '@/components/MultiEventIsometricGraphic';
import { MobilePwaIsometricGraphic } from '@/components/MobilePwaIsometricGraphic';
import { CreateDepartmentButton, HeaderAccount, MeProvider, PrimaryCta } from '@/components/AccountArea';
import { landingVocab, termInSentence } from '@/lib/landingVocab';

const PRIMARY_CTA_CLASS = 'justify-center text-sm font-semibold h-12 px-6 gap-2 shadow-glow';

/** Server-Komponente: Inhalt steht direkt im HTML, passt sich dynamisch an den Verband/Domain an */
export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (routing.locales.includes(rawLocale as Locale) ? rawLocale : DEFAULT_LOCALE) as Locale;
  setRequestLocale(locale);

  const { host } = await getRequestOrigin();
  const org = getOrganization(host, locale);
  const t = await getTranslations({ locale, namespace: 'landing' });
  const tFooter = await getTranslations({ locale, namespace: 'common.footer' });
  const vocab = landingVocab(org, locale);
  const landingUrl = getLandingUrl('/', host);
  const createDepartmentUrl = getDepartmentCreationUrl(landingUrl, host);
  // Nur auf der neutralen Vereins-Seite: Verweis auf die Verbandsinstanzen mit eigenem Verbands-Login
  const verbandLinks =
    org.slug === 'verein'
      ? VERBAND_ORGANIZATIONS.map((v) => ({ org: getOrganization(v.slug, locale), href: organizationSiteUrl(v, { host }) }))
      : [];

  return (
    <MeProvider>
      <div className="relative min-h-[100dvh] flex flex-col bg-canvas text-fg selection:bg-accent selection:text-white overflow-x-hidden">
        {/* 3D Atmospheric Canvas (Interactive Rising Campfire Embers) */}
        <CampfireBackground />

        {/* Campfire Warmth Atmosphere Glow */}
        <div className="pointer-events-none fixed inset-x-0 top-0 h-[640px] bg-campfire opacity-95 -z-10" />

        {/* Floating Glass Header */}
        <header className="sticky top-3 sm:top-4 z-header mx-auto w-full max-w-6xl px-3 sm:px-4">
          <div className="flex h-14 sm:h-16 items-center justify-between rounded-full border border-line/80 bg-surface/85 px-3.5 sm:px-6 backdrop-blur-xl shadow-soft">
            <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group min-w-0">
              <BrandLogo
                logoUrl={org.logoUrl}
                alt={org.name}
                className="size-8 sm:size-9 shrink-0 transition-transform duration-200 group-hover:scale-105"
              />
              <div className="flex flex-col min-w-0">
                <span className="font-display text-sm sm:text-base font-extrabold tracking-tight text-fg truncate">
                  {org.name}
                </span>
                <span className="hidden text-[11px] font-medium text-fg-subtle sm:block">
                  {t('header.tagline')}
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              <ThemeToggle className="size-8 sm:size-9" />
              <LandingLocaleSwitcher className="hidden sm:inline-flex" />

              <a
                href={helpUrl('/', host, locale)}
                className={buttonClasses({
                  variant: 'ghost',
                  size: 'sm',
                  className: 'hidden gap-1.5 text-xs font-semibold sm:inline-flex',
                })}
              >
                <LifeBuoy className="size-3.5 text-fg-muted" />
                <span>{t('header.help')}</span>
              </a>

              <a
                href={createDepartmentUrl}
                className={buttonClasses({
                  variant: 'ghost',
                  size: 'sm',
                  className: 'hidden md:inline-flex gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg',
                })}
              >
                <Building2 className="size-3.5 text-accent" />
                <span>{t('header.createUnit', vocab)}</span>
              </a>

              <HeaderAccount />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main id="inhalt" className="flex-1 relative z-10">
          {/* Hero Section */}
          <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
            <div className="mx-auto max-w-6xl px-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
                {/* Left Column: Value Proposition */}
                <div className="lg:col-span-7 flex flex-col items-start text-left">
                  <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-2xs font-bold uppercase tracking-[0.16em] bg-accent/12 text-accent-ink border border-accent/25 mb-6 shadow-sm">
                    <Flame className="size-3 text-accent animate-pulse" />
                    <span>{t('hero.badge', vocab)}</span>
                  </div>

                  <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-fg leading-[1.08] text-balance">
                    {t('hero.title')}{' '}
                    <span className="bg-gradient-to-r from-accent via-rose-500 to-amber-500 bg-clip-text text-transparent">
                      {t('hero.titleHighlight')}
                    </span>
                  </h1>

                  <p className="mt-5 text-base sm:text-lg text-fg-muted max-w-[54ch] leading-relaxed">
                    {t('hero.intro', vocab)}
                  </p>

                  {/* CTAs */}
                  <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <PrimaryCta
                      loginLabel={t('hero.ctaLogin')}
                      className={PRIMARY_CTA_CLASS}
                    />

                    <a
                      href="#so-funktionierts"
                      className={buttonClasses({
                        variant: 'secondary',
                        size: 'md',
                        className: 'justify-center text-sm font-semibold h-12 gap-1.5',
                      })}
                    >
                      <span>{t('hero.howItWorks')}</span>
                      <ChevronDown className="size-4 text-fg-subtle" />
                    </a>
                  </div>

                  {/* Security & Access Guidance */}
                  <div className="mt-6 pt-4 border-t border-line/60 w-full max-w-xl space-y-2 text-xs">
                    <div className="flex items-start gap-2 text-fg-muted leading-relaxed">
                      <ShieldCheck className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-fg font-semibold">{t('hero.protectedTitle')}</strong>{' '}
                        {t('hero.protectedText')}
                      </span>
                    </div>
                    <div className="text-fg-subtle pt-1 flex items-center gap-1.5 flex-wrap">
                      <span>{t('hero.leadQuestion', vocab)}</span>{' '}
                      <CreateDepartmentButton href={createDepartmentUrl} />
                    </div>
                  </div>

                  {/* Proof Points Strip */}
                  <div className="mt-8 pt-6 border-t border-line/60 w-full grid grid-cols-3 gap-2 sm:gap-4 text-left">
                    <div>
                      <div className="font-display text-lg sm:text-xl md:text-2xl font-extrabold text-fg tabular">
                        {t('hero.proofLink')}
                      </div>
                      <div className="text-[11px] sm:text-xs text-fg-subtle mt-0.5 leading-snug">
                        {t('hero.proofLinkText')}
                      </div>
                    </div>
                    <div>
                      <div className="font-display text-lg sm:text-xl md:text-2xl font-extrabold text-fg">
                        {t('hero.proofPhone')}
                      </div>
                      <div className="text-[11px] sm:text-xs text-fg-subtle mt-0.5 leading-snug">
                        {t('hero.proofPhoneText')}
                      </div>
                    </div>
                    <div>
                      <div className="font-display text-lg sm:text-xl md:text-2xl font-extrabold text-fg tabular">
                        {t('hero.proofFree')}
                      </div>
                      <div className="text-[11px] sm:text-xs text-fg-subtle mt-0.5 leading-snug">
                        {t('hero.proofFreeText', vocab)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Live Interactive Shift Stage */}
                <div className="lg:col-span-5">
                  <Hero3DStage org={org} />
                </div>
              </div>
            </div>
          </section>

          {/* Nur neutrale Vereins-Seite: Weiche zu den Verbandsinstanzen mit eigenem Verbands-Login */}
          {verbandLinks.length > 0 && (
            <section aria-labelledby="verbaende-heading" className="py-12 md:py-16 border-t border-line/60 relative">
              <div className="mx-auto max-w-6xl px-4">
                <Reveal className="max-w-2xl">
                  <h2
                    id="verbaende-heading"
                    className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-fg"
                  >
                    {t('associations.title')}
                  </h2>
                  <p className="mt-3 text-base text-fg-muted leading-relaxed">
                    {t('associations.text')}
                  </p>
                </Reveal>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {verbandLinks.map((v) => (
                    <a
                      key={v.org.slug}
                      href={v.href}
                      className="group flex items-start justify-between gap-4 rounded-card border border-line bg-surface/80 p-5 shadow-soft transition hover:border-fg-subtle/40 hover:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: v.org.primaryColor }} />
                          <span className="font-display text-lg font-bold text-fg">{v.org.name}</span>
                        </span>
                        <span className="mt-1.5 block text-sm text-fg-muted">{t('associations.for', { target: termInSentence(v.org.targetGroup, locale, v.org.orgName) })}</span>
                        <span className="mt-0.5 block text-sm text-fg-subtle">{t('associations.login', { authShort: v.org.authProviderShort })}</span>
                        <span className="mt-3 block font-mono text-xs text-fg-subtle">{v.org.domain}</span>
                      </span>
                      <ArrowUpRight className="size-5 shrink-0 text-fg-subtle transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
                    </a>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* So funktioniert's: drei Schritte aus Sicht des OK */}
          <section id="so-funktionierts" className="scroll-mt-24 py-16 md:py-20 border-t border-line/60 relative">
            <div className="mx-auto max-w-6xl px-4">
              <Reveal>
                <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
                  {t('steps.title')}
                </h2>
              </Reveal>
              <StepsTimeline org={org} />
            </div>
          </section>

          {/* Comparison Table: Schichtplan vs. Excel vs. WhatsApp */}
          <ComparisonTable org={org} />

          {/* Section 3: Zielgruppen & Was es euch bringt */}
          <section className="py-20 md:py-28 border-t border-line/60 bg-surface/30 relative">
            <div className="mx-auto max-w-6xl px-4">
              <Reveal className="max-w-2xl mb-12 sm:mb-16">
                <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-2xs font-bold uppercase tracking-[0.16em] bg-surface-2 border border-line text-fg-subtle mb-3">
                  <Sparkles className="size-3 text-accent" />
                  {t('benefits.badge')}
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
                  {t('benefits.title', vocab)}
                </h2>
                <p className="mt-3 text-base text-fg-muted leading-relaxed">
                  {t('benefits.text', vocab)}
                </p>
              </Reveal>

              {/* Zielgruppen-Gliederung */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                <Reveal className="rounded-2xl border border-line bg-surface/70 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
                    <Heart className="size-3.5" />
                    <span>{t('benefits.helpersLabel')}</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-fg mt-2">
                    {t('benefits.helpersTitle')}
                  </h3>
                  <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">
                    {t('benefits.helpersText')}
                  </p>
                </Reveal>

                <Reveal delay={100} className="rounded-2xl border border-line bg-surface/70 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-500">
                    <Users className="size-3.5" />
                    <span>{t('benefits.committeeLabel')}</span>
                  </div>
                  <h3 className="font-display text-base font-bold text-fg mt-2">
                    {t('benefits.committeeTitle')}
                  </h3>
                  <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">
                    {t('benefits.committeeText')}
                  </p>
                </Reveal>

                <Reveal delay={200} className="rounded-2xl border border-line bg-surface/70 p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-500">
                      <ShieldCheck className="size-3.5" />
                      <span>{t('benefits.leadLabel', vocab)}</span>
                    </div>
                    <h3 className="font-display text-base font-bold text-fg mt-2">
                      {t('benefits.leadTitle', vocab)}
                    </h3>
                    <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">
                      {t('benefits.leadText', vocab)}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-line/60">
                    <a
                      href={createDepartmentUrl}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                    >
                      <span>{t('benefits.leadLink', vocab)}</span>
                      <ArrowRight className="size-3" />
                    </a>
                  </div>
                </Reveal>
              </div>

              {/* Asymmetrical Feature Bento Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
                {/* Tile 1: SSO (Large 7-cols) */}
                <Reveal className="md:col-span-7">
                  <div className="h-full rounded-card border border-line/80 bg-surface p-6 sm:p-8 shadow-soft hover:shadow-lift hover:border-line-strong transition-all duration-200 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-xl sm:text-2xl font-bold text-fg">
                        {t('features.loginTitle')}
                      </h3>
                      <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-[50ch]">
                        {t('features.loginText', vocab)}
                      </p>
                    </div>

                    {/* Clean Visual */}
                    <div className="my-5">
                      <HitobitoIsometricGraphic org={org} />
                    </div>

                    <div className="pt-4 border-t border-line/80 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                      <span className="text-2xs text-emerald-500 font-semibold flex items-center gap-1.5 shrink-0">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        {t('features.loginWith', vocab)}
                      </span>
                      <span className="text-2xs text-fg-subtle">{t('features.loginOnce')}</span>
                    </div>
                  </div>
                </Reveal>

                {/* Tile 2: Eigene Subdomain (5-cols) */}
                <Reveal delay={100} className="md:col-span-5">
                  <div className="h-full rounded-card border border-line/80 bg-surface p-6 sm:p-8 shadow-soft hover:shadow-lift hover:border-line-strong transition-all duration-200 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-xl sm:text-2xl font-bold text-fg">
                        {t('features.addressTitle')}
                      </h3>
                      <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                        {t('features.addressText', vocab)}
                      </p>
                    </div>

                    {/* Clean Visual */}
                    <div className="my-5">
                      <SubdomainIsometricGraphic org={org} />
                    </div>

                    <div className="pt-4 border-t border-line/80 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
                      <span className="font-mono text-accent font-bold break-all sm:break-normal text-2xs sm:text-xs">
                        {t('features.addressExample', { slug: vocab.unit.toLowerCase() })}.{org.domain}
                      </span>
                      <a
                        href={createDepartmentUrl}
                        className="inline-flex items-center gap-1 font-semibold text-accent hover:underline text-2xs sm:text-xs"
                      >
                        <span>{t('features.addressLink', vocab)}</span>
                        <ArrowRight className="size-3" />
                      </a>
                    </div>
                  </div>
                </Reveal>

                {/* Tile 3: Multi-Event Unterstützung (5-cols) */}
                <Reveal className="md:col-span-5">
                  <div className="h-full rounded-card border border-line/80 bg-surface p-6 sm:p-8 shadow-soft hover:shadow-lift hover:border-line-strong transition-all duration-200 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-xl sm:text-2xl font-bold text-fg">
                        {t('features.eventsTitle')}
                      </h3>
                      <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                        {t('features.eventsText')}
                      </p>
                    </div>

                    {/* Bespoke Architecture Graphic (Festzelt, Campfire, Jurte) */}
                    <div className="my-5">
                      <MultiEventIsometricGraphic org={org} className="max-h-[190px] sm:max-h-[200px]" />
                    </div>

                    <div className="pt-4 border-t border-line/80 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                      <span className="font-semibold text-fg text-2xs sm:text-xs">{t('features.eventsCount')}</span>
                      <span className="text-2xs text-fg-subtle">{t('features.eventsScope')}</span>
                    </div>
                  </div>
                </Reveal>

                {/* Tile 4: Mobil optimiert & PWA (7-cols) */}
                <Reveal delay={100} className="md:col-span-7">
                  <div className="h-full rounded-card border border-line/80 bg-surface p-6 sm:p-8 shadow-soft hover:shadow-lift hover:border-line-strong transition-all duration-200 flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-xl sm:text-2xl font-bold text-fg">
                        {t('features.mobileTitle')}
                      </h3>
                      <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-[50ch]">
                        {t('features.mobileText')}
                      </p>
                    </div>

                    {/* Smartphone Graphic */}
                    <div className="my-5">
                      <MobilePwaIsometricGraphic org={org} className="max-h-[200px] sm:max-h-[220px]" />
                    </div>

                    <div className="pt-4 border-t border-line/80 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                      <span className="flex items-center gap-1.5 sm:gap-2 text-emerald-500 font-semibold text-2xs sm:text-xs">
                        <CheckCircle2 className="size-3.5 sm:size-4 shrink-0" />
                        {t('features.mobileAge')}
                      </span>
                      <span className="text-2xs text-fg-subtle">{t('features.mobileAgeExample')}</span>
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          {/* Strong Final Conversion & Help Section before Footer */}
          <section className="py-16 md:py-24 border-t border-line/60">
            <div className="mx-auto max-w-6xl px-4">
              <Reveal className="rounded-card border border-line bg-surface/90 p-8 sm:p-12 shadow-soft relative overflow-hidden">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-2xs font-bold uppercase tracking-wider bg-accent/12 text-accent-ink border border-accent/25 mb-4">
                    <Flame className="size-3 text-accent" />
                    <span>{t('final.badge')}</span>
                  </div>
                  <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-fg">
                    {t('final.title')}
                  </h2>
                  <p className="mt-3 text-sm sm:text-base text-fg-muted leading-relaxed">
                    {t('final.text', vocab)}
                  </p>

                  {/* Dynamic Bottom Button */}
                  <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <PrimaryCta
                      loginLabel={t('final.ctaLogin')}
                      className={PRIMARY_CTA_CLASS}
                    />

                    <a
                      href={createDepartmentUrl}
                      className={buttonClasses({
                        variant: 'secondary',
                        size: 'md',
                        className: 'h-12 justify-center font-semibold text-sm px-6 gap-2',
                      })}
                    >
                      <Building2 className="size-4 text-accent" />
                      <span>{t('header.createUnit', vocab)}</span>
                    </a>

                    <a
                      href={helpUrl('/', host, locale)}
                      className={buttonClasses({
                        variant: 'ghost',
                        size: 'md',
                        className: 'h-12 justify-center font-semibold text-sm px-4 gap-1.5 text-fg-muted hover:text-fg',
                      })}
                    >
                      <LifeBuoy className="size-4" />
                      <span>{t('header.help')}</span>
                      <ExternalLink className="size-3.5 text-fg-subtle" />
                    </a>
                  </div>

                  <p className="mt-4 text-xs text-fg-subtle">
                    {t('final.note', vocab)}
                  </p>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-line/60 bg-surface/50 py-10 text-xs text-fg-subtle relative z-10">
          <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="flex items-center gap-3">
              <BrandLogo logoUrl={org.logoUrl} alt={org.name} className="size-7 shrink-0" />
              <span>
                {t('footer.copyright', { ...vocab, year: String(new Date().getFullYear()) })}
                {org.independentNotice && <> · {org.independentNotice}</>}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-5">
              <LandingLocaleSwitcher placement="top" />
              <a href={createDepartmentUrl} className="hover:text-fg transition font-medium text-fg">
                {t('header.createUnit', vocab)}
              </a>
              <a href={helpUrl('/', host, locale)} className="hover:text-fg transition">
                {tFooter('help')}
              </a>
              <a href={statusUrl('/', host)} className="hover:text-fg transition">
                {tFooter('status')}
              </a>
              <Link href="/datenschutz" className="hover:text-fg transition">
                {tFooter('privacy')}
              </Link>
              <Link href="/nutzungsbedingungen" className="hover:text-fg transition">
                {tFooter('terms')}
              </Link>
              <Link href="/impressum" className="hover:text-fg transition">
                {tFooter('imprint')}
              </Link>
              <a
                href="/llms.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-fg transition font-mono text-[11px]"
                title={t('footer.llmsTitle')}
              >
                llms.txt
              </a>
              <a
                href="https://github.com/NelsStorch/schichtplan_v2"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-fg transition inline-flex items-center gap-1"
              >
                <span>GitHub</span>
                <ExternalLink className="size-3" />
              </a>
              <Link href="/login" className="hover:text-fg transition">
                {t('footer.centralLogin')}
              </Link>
            </div>
          </div>
          {verbandLinks.length > 0 && (
            <div className="mx-auto mt-6 max-w-6xl px-4 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2">
              <span>{t('footer.alsoForAssociations')}</span>
              {verbandLinks.map((v) => (
                <a key={v.org.slug} href={v.href} className="hover:text-fg transition">
                  {v.org.name}
                </a>
              ))}
            </div>
          )}
        </footer>
      </div>
    </MeProvider>
  );
}
