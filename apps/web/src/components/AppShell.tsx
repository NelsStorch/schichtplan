'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  LifeBuoy,
  LogIn,
  LogOut,
  Settings,
  Smartphone,
  Ticket,
  UserRound,
} from 'lucide-react';
import {
  AppVersion,
  Avatar,
  Badge,
  Button,
  CeviLogo,
  Dialog,
  NotificationSettings,
  ThemeToggle,
  buttonClasses,
  cn,
  isStandaloneDisplay,
  useOrganization,
} from '@schichtplan/ui';
import {
  getLandingUrl,
  getRootDomain,
  helpUrl,
  imprintUrl,
  privacyUrl,
  statusUrl,
  type MyHoursSummaryDto,
} from '@schichtplan/shared';
import { LocaleSwitcher } from '@schichtplan/ui/i18n';
import { useTranslations } from 'next-intl';
import { api, useDepartmentSetupHref, useLoginHref } from '@/lib/api';
import { usePermissionText } from '@/lib/permissionText';
import { displayName, usePortal } from '@/lib/portal';
import { useInstallPrompt } from '@/lib/offline';
import { usePushHint } from '@/lib/pushHint';
import { CommandPaletteButton } from './command';
import { OfflineBanner } from './OfflineBanner';

export function AppShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname();
  const { department, user } = usePortal();
  const tFooter = useTranslations('common.footer');
  const tShell = useTranslations('web.shell');
  const org = useOrganization();
  const [accountOpen, setAccountOpen] = useState(false);
  const loginHref = useLoginHref();
  const departmentSetupHref = useDepartmentSetupHref();
  const { show: pushHintShown, markSeen: markPushHintSeen } = usePushHint(user?.id);
  const openAccount = () => {
    setAccountOpen(true);
    markPushHintSeen();
  };

  const nav = [
    { href: '/', label: tShell('navEvents'), icon: CalendarDays, match: (p: string) => p === '/' || p.startsWith('/events') },
    { href: '/meine-schichten', label: tShell('navMyShifts'), icon: Ticket, match: (p: string) => p.startsWith('/meine-schichten') },
  ];

  // `?konto=push` (z. B. von der Profilseite auf der Startseite) öffnet den Konto-Dialog mit dem Push-Schalter
  useEffect(() => {
    if (!user) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('konto')) return;
    setAccountOpen(true);
    markPushHintSeen();
    url.searchParams.delete('konto');
    window.history.replaceState(window.history.state, '', url.toString());
  }, [user, markPushHintSeen]);

  return (
    <div className="grain flex min-h-[100dvh] flex-col bg-campfire bg-no-repeat">
      <header className="sticky top-0 z-header border-b border-line/70 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-full pr-2">
            <CeviLogo className="size-9" logoUrl={department?.logoUrl} alt="" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[15px] font-bold tracking-tight text-fg">
                {department?.name ?? org.name}
              </span>
              <span className="block text-2xs font-medium text-fg-subtle">{tShell('brandSubtitle')}</span>
            </span>
          </Link>

          <nav aria-label={tShell('x.mainNav')} className="ml-6 hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    active ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <CommandPaletteButton />
            {actions}
            <ThemeToggle className="hidden md:flex" />
            {user ? (
              <button
                type="button"
                onClick={openAccount}
                className="hidden items-center gap-2.5 rounded-full py-1 pl-1 pr-3.5 transition hover:bg-surface-2 md:flex"
              >
                <span className="relative">
                  <Avatar name={displayName(user)} size="sm" highlight />
                  {pushHintShown && <HintDot />}
                </span>
                {/* Kein aria-label: Der Name kommt aus dem sichtbaren Namen plus Zusatz für Screenreader (WCAG 2.5.3) */}
                <span className="max-w-32 truncate text-sm font-semibold text-fg">{displayName(user)}</span>
                <span className="sr-only">{pushHintShown ? tShell('openAccountAriaPushOff') : tShell('openAccountAria')}</span>
              </button>
            ) : (
              <a href={loginHref} className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'hidden md:inline-flex' })}>
                <LogIn /> {tShell('loginBtn')}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Offline-Hinweis mit Stand-Zeitstempel: wird nur gerendert wenn offline */}
      <OfflineBanner />

      {user?.needsDepartmentSetup && (
        <div className="border-b border-warning/25 bg-warning/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
            <p className="text-fg">
              <span className="font-semibold">{tShell('needsDepartmentTitle', { unitTerm: org.unitTerm })}</span>{' '}
              <span className="text-fg-muted">{tShell('needsDepartmentDesc', { unitTerm: org.unitTerm })}</span>
            </p>
            <a href={departmentSetupHref} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
              <Building2 /> {tShell('specifyDepartmentBtn', { unitTerm: org.unitTerm })}
            </a>
          </div>
        </div>
      )}

      <main id="inhalt" className="flex-1 pb-12 md:pb-20">{children}</main>

      {/* Mobil Platz für die fixe Tab-Leiste lassen, damit Hilfe/Datenschutz erreichbar bleiben */}
      <footer className="border-t border-line/70 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-6 text-xs text-fg-subtle md:px-6">
          <p>
            © {new Date().getFullYear()} {department ? department.name : org.name}
            {org.independentNotice && <> · {org.independentNotice}</>}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href={helpUrl('/', org.domain)} className="transition hover:text-fg">
              {tFooter('help')}
            </a>
            {/* Handy: nur das Nötigste (Hilfe, Recht, Sprache), der Rest ab md */}
            <a href={statusUrl('/', org.domain)} className="transition hover:text-fg max-md:hidden">
              {tFooter('status')}
            </a>
            <a href={privacyUrl(org.domain)} className="transition hover:text-fg">
              {tFooter('privacy')}
            </a>
            <a href={imprintUrl(org.domain)} className="transition hover:text-fg">
              {tFooter('imprint')}
            </a>
            <AppVersion className="max-md:hidden" />
            <LocaleSwitcher placement="top" onPersist={user ? (locale) => api('/api/auth/me', { method: 'PATCH', json: { locale } }) : undefined} />
            <a
              href={getLandingUrl('/', org.domain)}
              className="transition hover:text-fg max-md:hidden"
            >
              {typeof window !== 'undefined' && window.location.hostname.includes('.')
                ? getRootDomain(window.location.hostname)
                : org.domain}
            </a>
          </div>
        </div>
      </footer>

      {/* Mobile Tab-Leiste: Daumen-Zone statt Hamburger-Menü */}
      <nav
        aria-label={tShell('x.mainNav')}
        className="fixed inset-x-0 bottom-0 z-header border-t border-line/70 bg-canvas/85 pb-safe-b backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        <div className="grid h-16 grid-cols-3">
          {nav.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 text-2xs font-semibold transition-colors',
                  active ? 'text-fg' : 'text-fg-subtle'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    active && 'bg-accent/14 text-accent-ink'
                  )}
                >
                  <Icon className="size-5" />
                </span>
                {item.label}
              </Link>
            );
          })}
          {user ? (
            <button
              type="button"
              onClick={openAccount}
              aria-label={pushHintShown ? tShell('mobileNavAccountPushOff') : undefined}
              className="flex flex-col items-center justify-center gap-1 text-2xs font-semibold text-fg-subtle"
            >
              <span className="relative flex h-7 w-12 items-center justify-center">
                <Avatar name={displayName(user)} size="sm" className="size-6 text-[9px]" />
                {pushHintShown && <HintDot />}
              </span>
              {tShell('mobileNavAccount')}
            </button>
          ) : (
            <a href={loginHref} className="flex flex-col items-center justify-center gap-1 text-2xs font-semibold text-fg-subtle">
              <span className="flex h-7 w-12 items-center justify-center">
                <UserRound className="size-5" />
              </span>
              {tShell('mobileNavLogin')}
            </a>
          )}
        </div>
      </nav>

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}

function HintDot() {
  return (
    <span
      aria-hidden
      className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-canvas"
    />
  );
}

/**
 * Kleiner Konto-Dialog der Abteilungs-App. Alle grösseren Einstellungen (Angaben, Benachrichtigungen,
 * Sicherheit, Daten herunterladen, Konto löschen) liegen auf der Startseite unter /profil. Hier bleibt das
 * Nötigste: Push für dieses Gerät (gilt im ganzen Schichtplan), App installieren und das Design.
 */
function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tShell = useTranslations('web.shell');
  const perm = usePermissionText();
  const { user, setUser, department, logout } = usePortal();
  const org = useOrganization();
  const { canInstall, install } = useInstallPrompt();
  const [stats, setStats] = useState<MyHoursSummaryDto | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [profileHref, setProfileHref] = useState(() => getLandingUrl('/profil'));

  useEffect(() => {
    if (!open) return;
    setStandalone(isStandaloneDisplay());
    // Die Profilseite bietet damit «Zurück zu <Abteilung>» an die aktuelle Seite an
    const params = new URLSearchParams({ von: window.location.href });
    if (department?.name) params.set('name', department.name);
    setProfileHref(getLandingUrl(`/profil?${params.toString()}`));
  }, [open, department?.name]);

  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    api<MyHoursSummaryDto>('/api/shifts/my/summary')
      .then((data) => active && setStats(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, user]);

  if (!user) return null;
  const role =
    user.isGlobalAdmin && user.departmentRole !== 'ADMIN'
      ? tShell('rolePlatformAdmin')
      : perm.roleLabel({
          isLeader: user.departmentRole === 'ADMIN',
          permissions: user.departmentPermissions ?? [],
          isHomeDepartment:
            user.homeDepartment?.id === department?.id ||
            Boolean(user.joinedDepartments?.some((d) => d.id === department?.id && d.counts)),
        });

  return (
    <Dialog open={open} onClose={onClose} size="sm" title={tShell('accountDialogTitle')}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={displayName(user)} size="lg" highlight className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-display text-lg font-bold text-fg">{displayName(user)}</h3>
              <Badge tone="accent" size="sm">
                {role}
              </Badge>
            </div>
            <p className="flex items-center gap-1 truncate text-xs text-fg-subtle">
              <Building2 className="size-3 shrink-0" />
              {user.homeDepartment ? user.homeDepartment.name : user.needsDepartmentSetup ? tShell('missingDepartment') : tShell('noDepartment')}
            </p>
          </div>
          <ThemeToggle className="shrink-0" />
        </div>

        <NotificationSettings user={user} onUserChange={setUser} compact />

        <div className="grid gap-2">
          <Link href="/meine-schichten" onClick={onClose} className={buttonClasses({ variant: 'secondary', className: 'justify-start' })}>
            <Ticket className="size-4 text-accent" />
            <span>{tShell('navMyShifts')}</span>
            {stats && stats.shiftCount > 0 && (
              <span className="ml-auto text-xs font-medium text-fg-subtle">{tShell('myShiftsHours', { hours: stats.totalHours })}</span>
            )}
          </Link>
          <a href={profileHref} className={buttonClasses({ variant: 'secondary', className: 'justify-start' })}>
            <Settings className="size-4 text-accent" />
            <span>{tShell('profileAndSettings')}</span>
            {standalone && <span className="ml-auto text-xs font-medium text-fg-subtle">{tShell('opensInBrowser')}</span>}
            <ArrowUpRight className={cn('size-4 text-fg-subtle', !standalone && 'ml-auto')} />
          </a>
          {canInstall && (
            <Button variant="secondary" className="justify-start" onClick={() => void install()}>
              <Smartphone className="size-4 text-accent" /> {tShell('installAppBtn')}
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-3">
          <a href={helpUrl('/', org.domain)} className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'text-xs' })}>
            <LifeBuoy className="size-3.5" /> {tShell('helpBtn')}
          </a>
          <Button variant="ghost" size="sm" onClick={logout} className="text-xs">
            <LogOut className="size-3.5" /> {tShell('logoutBtn')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
