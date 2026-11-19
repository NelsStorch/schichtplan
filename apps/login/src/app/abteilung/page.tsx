'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Database, Search, UsersRound } from 'lucide-react';
import type { DepartmentDirectoryItemDto, StufeRole, UserDto } from '@schichtplan/shared';
import { Button, Callout, BrandLogo, Input, ThemeToggle, cn, useOrganization } from '@schichtplan/ui';
import { cleanReturnTo, departmentSlugFromReturnTo, finalDestination } from '@/lib/destination';
import { AuthFooter } from '@/components/AuthFooter';
import { OtherProviderHint } from '@/components/OtherProviderHint';

const NONE = 'NONE';

const ROLE_OPTIONS: { value: StufeRole | null; label: string }[] = [
  { value: null, label: 'Nein' },
  { value: 'TEILNEHMER', label: 'Teilnehmer*in' },
  { value: 'LEITUNG', label: 'Leitung' },
];

function DepartmentSetup() {
  const searchParams = useSearchParams();
  const returnTo = cleanReturnTo(searchParams.get('return_to'));
  const inviteToken = searchParams.get('invite')?.trim() || null;
  const returnToSlug = departmentSlugFromReturnTo(returnTo);

  // Verband der Domain, vom Server-Layout bereitgestellt (richtig schon beim ersten Rendern)
  const org = useOrganization();

  const [user, setUser] = useState<UserDto | null>(null);
  const [departments, setDepartments] = useState<DepartmentDirectoryItemDto[] | null>(null);
  // Abteilungen der eigenen Gruppen in der Verbands-DB: nur diese sind bei LINK_ONLY ohne Link wählbar
  const [ownDepartmentIds, setOwnDepartmentIds] = useState<Set<string>>(new Set());
  // Davon laut Rollen belegt: Beitritt auch bei INVITE_ONLY ohne Einladung (bestätigt durch die DB)
  const [verifiedDepartmentIds, setVerifiedDepartmentIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [stufen, setStufen] = useState<Record<string, StufeRole>>({});
  const [inviteLocked, setInviteLocked] = useState(false);
  const [inviteDeptId, setInviteDeptId] = useState<string | null>(null);
  // Andere Abteilung als die Heimabteilung (Link oder Einladung): zusätzlich beitreten statt wechseln
  const [extraTarget, setExtraTarget] = useState<DepartmentDirectoryItemDto | null>(null);
  const [extraBlocked, setExtraBlocked] = useState(false);
  const [asHome, setAsHome] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      if (meRes.status === 401) {
        const params = new URLSearchParams();
        if (returnTo) params.set('return_to', returnTo);
        if (inviteToken) params.set('invite', inviteToken);
        const qs = params.toString();
        window.location.href = qs ? `/?${qs}` : '/';
        return;
      }
      const me = (await meRes.json()) as UserDto;
      setUser(me);
      if (me.homeDepartment) setSelected(me.homeDepartment.id);
      else if (!me.needsDepartmentSetup) setSelected(NONE);
      setStufen(Object.fromEntries((me.stufen ?? []).map((s) => [s.stufeId, s.role])));

      const [dirRes, ownRes] = await Promise.all([
        fetch('/api/departments/directory'),
        fetch('/api/auth/me/own-departments', { cache: 'no-store' }),
      ]);
      const dirList: DepartmentDirectoryItemDto[] = dirRes.ok ? await dirRes.json() : [];
      const own = ownRes.ok
        ? ((await ownRes.json()) as { departmentIds: string[]; verifiedIds?: string[] })
        : { departmentIds: [], verifiedIds: [] };
      const verified = new Set(own.verifiedIds ?? []);
      setOwnDepartmentIds(new Set(own.departmentIds));
      setVerifiedDepartmentIds(verified);
      setDepartments(dirList);

      let target = returnToSlug ? dirList.find((d) => d.slug === returnToSlug) : undefined;
      // Einladungslink ohne (passendes) Abteilungs-Ziel: Abteilung über den Token bestimmen
      if (inviteToken && !target) {
        const lookupRes = await fetch(`/api/departments/invite-lookup?token=${encodeURIComponent(inviteToken)}`, {
          cache: 'no-store',
        });
        if (lookupRes.ok) {
          const found = (await lookupRes.json()) as DepartmentDirectoryItemDto;
          target = dirList.find((d) => d.id === found.id) ?? found;
          if (!dirList.some((d) => d.id === found.id)) setDepartments([...dirList, found]);
        } else {
          const data = await lookupRes.json().catch(() => ({}));
          setError(data.error || 'Dieser Einladungslink ist ungültig oder wurde inzwischen ersetzt.');
        }
      }

      const stufenOf = (d: DepartmentDirectoryItemDto) =>
        (me.stufen ?? [])
          .filter((s) => d.stufen.some((x) => x.id === s.stufeId))
          .map((s) => ({ stufeId: s.stufeId, role: s.role }));

      // Heimabteilung ist eine andere: Beitritt zusätzlich, die Heimabteilung bleibt
      const home = me.homeDepartment;
      if (target && home && home.id !== target.id) {
        if (inviteToken) setInviteDeptId(target.id);
        const joinedHere = me.joinedDepartments?.find((d) => d.id === target!.id);
        // Schon dabei: per Einladung direkt weiter, sonst die normale Seite (Haupt-Abteilung, Beitritte verwalten)
        if (joinedHere?.confirmed && inviteToken) {
          window.location.href = finalDestination(returnTo, me, org.dbType);
          return;
        }
        if (joinedHere?.counts && !inviteToken) return;
        if (inviteToken && target.stufen.length === 0) {
          const res = await fetch('/api/auth/me/memberships', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ departmentId: target.id, inviteToken, viaLink: true, stufen: [] }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            window.location.href = finalDestination(returnTo, data as UserDto, org.dbType);
            return;
          }
          setError(data.error || 'Der Einladungslink konnte nicht eingelöst werden.');
        }
        setExtraBlocked(!inviteToken && target.joinMode === 'INVITE_ONLY' && !verified.has(target.id));
        setExtraTarget(target);
        setSelected(target.id);
        setStufen(Object.fromEntries(stufenOf(target).map((s) => [s.stufeId, s.role])));
        return;
      }

      const join = async (stufenList: { stufeId: string; role: StufeRole }[]) => {
        const joinRes = await fetch('/api/auth/me/department', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departmentId: target!.id, inviteToken, viaLink: true, stufen: stufenList }),
        });
        const joinData = await joinRes.json().catch(() => ({}));
        if (joinRes.ok) {
          window.location.href = finalDestination(returnTo, joinData as UserDto, org.dbType);
          return;
        }
        setError(joinData.error || 'Der Einladungslink konnte nicht eingelöst werden.');
      };

      if (inviteToken && target) {
        setInviteDeptId(target.id);
        if (me.homeDepartmentFromCeviDb) {
          if (!(me.homeDepartment?.id === target.id && me.needsDepartmentSetup && target.stufen.length > 0)) {
            await join((me.stufen ?? []).map((s) => ({ stufeId: s.stufeId, role: s.role })));
            return;
          }
        } else if (me.homeDepartment?.id === target.id && !me.needsDepartmentSetup) {
          // Gleiche Abteilung: Einladung bestätigt die Zugehörigkeit, Stufen bleiben, wie sie sind
          await join((me.stufen ?? []).map((s) => ({ stufeId: s.stufeId, role: s.role })));
          return;
        } else if (!me.homeDepartment && target.stufen.length === 0) {
          // Noch keine Abteilung und nichts zu wählen: direkt aufnehmen
          await join([]);
          return;
        } else {
          // Stufen wählen: nur mit ausdrücklichem Speichern
          setSelected(target.id);
          setInviteLocked(true);
        }
      } else if (
        !me.homeDepartment &&
        target &&
        (target.joinMode === 'OPEN' || target.joinMode === 'LINK_ONLY' || verified.has(target.id))
      ) {
        setSelected(target.id);
      }
    })().catch(() => setError('Die Angaben konnten nicht geladen werden. Bitte lade die Seite neu.'));
  }, [returnTo, inviteToken, returnToSlug, org.dbType]);

  const fromCeviDb = Boolean(user?.homeDepartmentFromCeviDb);
  const lockedStufen = useMemo(
    () => new Set((user?.stufen ?? []).filter((s) => s.source === 'CEVIDB').map((s) => s.stufeId)),
    [user]
  );
  const selectedDepartment = departments?.find((d) => d.id === selected) ?? null;

  // Wählbar: offene Abteilungen, die eigene, die des Links, die der Einladung, bei LINK_ONLY die der eigenen Gruppen
  // in der Verbands-DB und die laut eigenen Rollen belegten (fremde nur über ihren Link oder eine Einladung)
  const selectable = useMemo(
    () =>
      (departments ?? []).filter((d) => {
        if (d.id === user?.homeDepartment?.id) return true;
        if (user?.joinedDepartments?.some((j) => j.id === d.id)) return true;
        if (d.id === inviteDeptId) return true;
        if (d.joinMode === 'LINK_ONLY' && returnToSlug && d.slug === returnToSlug) return true;
        if (d.joinMode === 'LINK_ONLY' && ownDepartmentIds.has(d.id)) return true;
        // Laut eigenen Rollen belegt: auch «nur per Einladung»
        if (verifiedDepartmentIds.has(d.id)) return true;
        return !d.joinMode || d.joinMode === 'OPEN';
      }),
    [departments, user?.homeDepartment?.id, user?.joinedDepartments, ownDepartmentIds, verifiedDepartmentIds, inviteDeptId, returnToSlug]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? selectable.filter((d) => d.name.toLowerCase().includes(q) || d.slug.includes(q)) : selectable;
  }, [selectable, query]);

  const choose = (id: string) => {
    if (fromCeviDb) return;
    setSelected(id);
    if (id !== selected) setStufen({});
  };

  const selectedStufen = () =>
    Object.entries(stufen)
      .filter(([stufeId]) => selectedDepartment?.stufen.some((s) => s.id === stufeId))
      .map(([stufeId, role]) => ({ stufeId, role }));

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      // Zusätzlich beitreten: Heimabteilung bleibt unverändert
      if (extraTarget && !asHome) {
        const res = await fetch('/api/auth/me/memberships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            departmentId: extraTarget.id,
            inviteToken: inviteToken || undefined,
            viaLink: Boolean(returnToSlug && extraTarget.slug === returnToSlug),
            stufen: selectedStufen(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Beitreten hat nicht geklappt.');
        window.location.href = finalDestination(returnTo, data as UserDto, org.dbType);
        return;
      }
      const departmentId = selected === NONE ? null : selected;
      const res = await fetch('/api/auth/me/department', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId,
          inviteToken: inviteToken || undefined,
          viaLink: Boolean(returnToSlug && selectedDepartment?.slug === returnToSlug),
          stufen: departmentId ? selectedStufen() : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Speichern hat nicht geklappt.');
      window.location.href = finalDestination(returnTo, data as UserDto, org.dbType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern hat nicht geklappt.');
      setSaving(false);
    }
  };

  const leave = async (departmentId: string, name: string) => {
    if (!window.confirm(`${name} verlassen? Deine Stufen dort werden entfernt. Rechte bleiben, bis die Leitung sie entfernt.`)) {
      return;
    }
    setLeaving(departmentId);
    setError(null);
    try {
      const res = await fetch(`/api/auth/me/memberships/${departmentId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Verlassen hat nicht geklappt.');
      setUser(data as UserDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verlassen hat nicht geklappt.');
    } finally {
      setLeaving(null);
    }
  };

  const loading = !user || !departments;
  const rootHost = typeof window === 'undefined' ? '' : window.location.hostname.replace(/^login\./, '');

  const isMasculine = org.unitTerm === 'Verein';
  const toWhichUnit = isMasculine ? `Zu welchem ${org.unitTerm}` : `Zu welcher ${org.unitTerm}`;
  const forAUnit = isMasculine ? `für einen ${org.unitTerm}` : `für eine ${org.unitTerm}`;
  const joinAUnit = isMasculine ? `einem ${org.unitTerm}` : `einer ${org.unitTerm}`;
  const yourUnitGenitive = isMasculine ? `deines ${org.unitTerm}s` : `deiner ${org.unitTerm}`;
  const noUnitFound = isMasculine ? `Keinen ${org.unitTerm} gefunden.` : `Keine ${org.unitTerm} gefunden.`;
  const belongsToNoUnit = isMasculine ? `Ich gehöre zu keinem ${org.unitTerm}` : `Ich gehöre zu keiner ${org.unitTerm}`;

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
        <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
          {user ? `Hallo ${user.nickname || user.ceviName || user.firstName}.` : `Deine ${org.unitTerm}`} {toWhichUnit} gehörst du?
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
          Manche Anlässe sind nur {forAUnit} oder einzelne Stufen. Du kannst das später jederzeit ändern.
        </p>

        <div className="mt-8 space-y-6">
          {error && <Callout tone="danger">{error}</Callout>}
          <OtherProviderHint user={user} org={org} />

          {loading ? (
            <div className="space-y-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-field bg-surface-2" />
              ))}
            </div>
          ) : (
            <>
              {extraTarget && user?.homeDepartment ? (
                <section aria-label={`${extraTarget.name} beitreten`} className="space-y-3">
                  <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
                    <BrandLogo className="size-10 shrink-0" logoUrl={extraTarget.logoUrl} alt="" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">{extraTarget.name}</span>
                      <span className="block text-[13px] text-fg-subtle">
                        {inviteToken ? 'Über deinen Einladungslink' : `Über den Link der ${org.unitTerm}`}
                      </span>
                    </span>
                  </div>
                  {extraBlocked ? (
                    <Callout tone="info" title="Nur per Einladung">
                      <p className="mt-1 text-[13px] leading-relaxed text-fg">
                        {extraTarget.name} nimmt neue Mitglieder nur über einen Einladungslink auf. Frag die Leitung
                        nach einem Link.
                      </p>
                    </Callout>
                  ) : (
                    <div role="radiogroup" className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface/70">
                      <DepartmentOption
                        selected={!asHome}
                        onSelect={() => setAsHome(false)}
                        title="Zusätzlich beitreten"
                        subtitle={`${user.homeDepartment.name} bleibt deine Haupt-${org.unitTerm}`}
                        icon={<UsersRound className="size-[18px]" />}
                      />
                      {!fromCeviDb && (
                        <DepartmentOption
                          selected={asHome}
                          onSelect={() => setAsHome(true)}
                          title={`Als Haupt-${org.unitTerm} festlegen`}
                          subtitle={`Ersetzt ${user.homeDepartment.name} als Haupt-${org.unitTerm}`}
                          icon={<Check className="size-[18px]" />}
                        />
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="text-[13px] font-semibold text-accent-ink underline underline-offset-2"
                    onClick={() => {
                      // Zur normalen Ansicht: Haupt-Abteilung und bestehende Beitritte
                      setExtraTarget(null);
                      setExtraBlocked(false);
                      setAsHome(false);
                      setSelected(user.homeDepartment?.id ?? null);
                      setStufen(Object.fromEntries((user.stufen ?? []).map((s) => [s.stufeId, s.role])));
                    }}
                  >
                    {extraBlocked ? 'Zurück zu meinen Angaben' : 'Nicht beitreten'}
                  </button>
                </section>
              ) : (fromCeviDb || inviteLocked) && selectedDepartment ? (
                <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
                  {inviteLocked ? (
                    <BrandLogo className="size-10 shrink-0" logoUrl={selectedDepartment.logoUrl} alt="" />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent/10 text-accent-ink">
                      <Database className="size-[18px]" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">{selectedDepartment.name}</span>
                    <span className="block text-[13px] text-fg-subtle">
                      {fromCeviDb
                        ? `Aus deinem ${org.authProviderShort}-Profil übernommen`
                        : 'Über deinen Einladungslink ausgewählt'}
                    </span>
                  </span>
                </div>
              ) : (
                <section aria-label={`${org.unitTerm} wählen`} className="space-y-3">
                  {selectable.length > 6 && (
                    <div className="relative">
                      <Search
                        aria-hidden
                        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                      />
                      <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`${org.unitTerm} suchen`}
                        aria-label={`${org.unitTerm} suchen`}
                        className="pl-11"
                      />
                    </div>
                  )}
                  {selectable.length > 0 ? (
                    <div
                      role="radiogroup"
                      className="max-h-[22rem] divide-y divide-line overflow-y-auto rounded-card border border-line bg-surface/70"
                    >
                      {visible.map((d) => (
                        <DepartmentOption
                          key={d.id}
                          selected={selected === d.id}
                          onSelect={() => choose(d.id)}
                          title={d.name}
                          subtitle={`${d.slug}.${rootHost}`}
                          logoUrl={d.logoUrl}
                        />
                      ))}
                      {visible.length === 0 && (
                        <p className="px-5 py-4 text-sm text-fg-subtle">{noUnitFound}</p>
                      )}
                    </div>
                  ) : (
                    <Callout tone="info">
                      Um {joinAUnit} beizutreten, öffne bitte den direkten Link oder Einladungslink {yourUnitGenitive}.
                    </Callout>
                  )}
                  <div role="radiogroup" className="overflow-hidden rounded-card border border-line bg-surface/70">
                    <DepartmentOption
                      selected={selected === NONE}
                      onSelect={() => choose(NONE)}
                      title={belongsToNoUnit}
                      subtitle="Eltern, Ehemalige, Freund*innen und Gäste"
                      icon={<UsersRound className="size-[18px]" />}
                    />
                  </div>
                </section>
              )}

              {selectedDepartment && selectedDepartment.stufen.length > 0 && !extraBlocked && (
                <section aria-labelledby="stufen-titel" className="animate-fade-in">
                  <h2 id="stufen-titel" className="text-sm font-semibold text-fg">
                    In welchen Stufen bist du dabei?
                  </h2>
                  <p className="mt-1 text-[13px] text-fg-subtle">Wähle alle, die passen. Keine ist auch in Ordnung.</p>
                  <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface/70">
                    {selectedDepartment.stufen.map((stufe) => {
                      const locked = lockedStufen.has(stufe.id);
                      const role = stufen[stufe.id] ?? null;
                      return (
                        <li key={stufe.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-fg">{stufe.name}</span>
                            {locked && <span className="block text-xs text-fg-subtle">aus {org.authProviderShort || 'Verband'}</span>}
                          </span>
                          <div
                            role="radiogroup"
                            aria-label={`Rolle in ${stufe.name}`}
                            className="flex rounded-full bg-surface-2 p-0.5"
                          >
                            {ROLE_OPTIONS.map((option) => {
                              const active = role === option.value;
                              return (
                                /* biome-ignore lint/a11y/useSemanticElements: Segmented Control mit ARIA-Radio-Pattern */
                                <button
                                  key={option.label}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  disabled={locked}
                                  onClick={() =>
                                    setStufen((prev) => {
                                      const next = { ...prev };
                                      if (option.value) next[stufe.id] = option.value;
                                      else delete next[stufe.id];
                                      return next;
                                    })
                                  }
                                  className={cn(
                                    'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                                    active ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                                    locked && 'cursor-not-allowed opacity-70'
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {!extraTarget && (user?.joinedDepartments?.length ?? 0) > 0 && (
                <section aria-labelledby="weitere-titel">
                  <h2 id="weitere-titel" className="text-sm font-semibold text-fg">
                    Weitere {org.unitTerm === 'Verein' ? 'Vereine' : 'Mitgliedschaften'}
                  </h2>
                  <p className="mt-1 text-[13px] text-fg-subtle">
                    Hier bist du zusätzlich dabei. Beitreten geht über den Link oder Einladungslink
                    {org.slug !== 'verein' ? `, oder automatisch über deine Rollen in ${org.authProviderShort}` : ''}.
                  </p>
                  <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface/70">
                    {user!.joinedDepartments!.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-fg">{d.name}</span>
                          <span className="block text-xs text-fg-subtle">
                            {d.fromProvider
                              ? `Aus ${org.authProviderShort}`
                              : d.confirmed
                                ? 'Bestätigt'
                                : d.counts
                                  ? 'Selbst beigetreten'
                                  : 'Wartet auf Bestätigung'}
                          </span>
                        </span>
                        {d.fromProvider ? (
                          // Kommt beim Login aus den Rollen und lässt sich nur in der Verbands-DB ändern
                          <span className="shrink-0 text-xs text-fg-subtle">nur in {org.authProviderShort} änderbar</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={leaving === d.id}
                            onClick={() => leave(d.id, d.name)}
                          >
                            Verlassen
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {!extraBlocked && (
                <Button size="lg" className="w-full" disabled={!selected} loading={saving} onClick={save}>
                  {extraTarget && !asHome ? `${extraTarget.name} beitreten` : 'Speichern und weiter'}
                </Button>
              )}
            </>
          )}
        </div>
      </main>

      <AuthFooter />
    </div>
  );
}

function DepartmentOption({
  selected,
  onSelect,
  title,
  subtitle,
  logoUrl,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  logoUrl?: string | null;
  icon?: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: Interaktive Abteilungs-Kachel mit ARIA-Radio-Rolle
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
        selected && 'bg-accent/8'
      )}
    >
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-tile bg-surface-2 text-fg-muted">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-full object-cover" />
          ) : (
            (icon ?? <BrandLogo className="size-6" alt="" />)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-fg-subtle">{subtitle}</span>
        </span>
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border transition',
            selected ? 'border-accent bg-accent text-white' : 'border-line-strong'
          )}
        >
          {selected && <Check className="size-3" />}
        </span>
      </button>
  );
}

export default function DepartmentSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <DepartmentSetup />
    </Suspense>
  );
}
