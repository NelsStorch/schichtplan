# Anmeldung und Berechtigungen 🔐

Wie sich Personen anmelden, wie sie einer Abteilung beitreten und wer was darf. Das Dokument beschreibt den Stand des Codes im Backend (`apps/backend`) und in `packages/shared`.

---

## 1. Single Sign-On über mehrere Domains

Jeder Verband hat eine eigene Domain und meldet sich über ein eigenes Login-Portal an. Ein Cookie gilt für alle Subdomains des Verbands.

* **Wildcard-Cookie pro Verband:**
  `Set-Cookie: token=...; Domain=.<domain>; Path=/; Secure; HttpOnly; SameSite=Lax`
  * Cevi: `.cevi-schichtplan.ch`
  * Pfadi: `.pfadi-schichtplan.ch`
  * Jubla: `.jubla-schichtplan.ch`
  * Vereine: `.vereins-schichtplan.ch`
* Das einmalige Anmelden auf `login.<domain>` schaltet den Zugriff auf alle Abteilungs- und Vereins-Subdomains desselben Verbands frei.
* Der Cookie-Name ist über `COOKIE_NAME` einstellbar. Test- und Produktivumgebung nutzen verschiedene Namen, damit sie sich nicht in die Quere kommen.

---

## 2. Anmeldemethoden

### 2.1 Verbands-SSO über Hitobito (OAuth 2.0)

Cevi, Pfadi und Jubla melden sich mit ihrer Verbands-Datenbank an. Alle drei sind Hitobito-Instanzen.

| Verband | Provider | `OrganizationType` |
|---|---|---|
| Cevi | `db.cevi.ch` | `CEVI` |
| Pfadi (PBS MiData) | `db.scout.ch` | `PFADI` |
| Jubla | `db.jubla.ch` | `JUBLA` |

* **Callback:** `https://login.<domain>/api/auth/cevidb/callback`
* **Lokal entwickeln:** Hitobito erlaubt kein `http://localhost` als Redirect-URI. Lokal meldet man sich deshalb mit E-Mail und Passwort, mit dem Pfadi- bzw. Cevi-Namen oder mit der simulierten Verbands-DB an (siehe 2.2).
* **Übernommene Daten:** Vor- und Nachname, Spitzname (Pfadiname, Cevi-Name), Geburtsdatum und Stufen (`Group::Stufe::*`). Die Handynummer wird im Schichtplan gepflegt, der Scope `people` wird bewusst nicht angefragt. Das Geburtsdatum ist im Profil gesperrt.
* **Scopes:** `email name with_roles groups` (einstellbar über `CEVIDB_OAUTH_SCOPES`). `groups` liest die Gruppenstruktur. Der breite Scope `api` wird nicht angefragt.
* **Gruppenstruktur:** Das Profil nennt pro Rolle nur die Gruppe. Jungschar oder Abteilung und Ortsgruppe stehen in der Gruppen-API (`/groups/{id}.json`). Das Backend liest sie beim Login mit dem Token der Person und legt nur die Gruppenangaben in `hitobito_groups` ab (24 Stunden, keine Personendaten). Das Token selbst wird nicht gespeichert. Code: `services/hitobitoGroups.ts`.
* **Dem Profil nicht blind trauen:** `ortsgruppe_id` kann jede Person im eigenen Hitobito-Profil ändern und es wird nach der ersten Rolle nie nachgeführt. Rechte und Quelle `CEVIDB` hängen deshalb nur an `roles` und `primary_group_id`.

#### Automatische Abteilungszuordnung

* `departments.hitobitoGroupId` verknüpft eine Abteilung mit der Ortsgruppe. Hat eine Ortsgruppe mehrere Jungscharen, verknüpft sie stattdessen die Jungschar.
* Eine Gruppe gehört zur Abteilung ihrer Jungschar, sonst zur Abteilung ihrer Ortsgruppe.
* **Heimabteilung:** erst die Hauptgruppe, sonst eine Leitungsrolle, sonst die einzige Abteilung, sonst die bisherige. Rollen in weiteren Abteilungen ergeben dort die Rolle `HELPER`. Bleibt mehr als eine Abteilung offen, wählt die Person selbst.
* **Leitungsrollen:** Personen mit einer Rolle aus `CEVIDB_DEPARTMENT_LEADER_ROLES` (z. B. `Group::Jungschar::Abteilungsleiter`) erhalten automatisch die Rolle **Abteilungsleitung** (`ADMIN`, `leaderSource = 'CEVIDB'`), aber nur in der Abteilung ihrer Rolle.
* **Von Hand bestätigt:** Rollen ohne Jungschar (z. B. nur Vorstand) führen in einer Ortsgruppe mit mehreren Jungscharen zu keiner Abteilung. Die Person wählt selbst (Quelle `SELF`), und die Abteilungsleitung kann die Wahl bestätigen (`POST /api/departments/current/people/:userId/confirm`, nicht für sich selbst, nur für Hitobito-Konten derselben Ortsgruppe). Die Quelle wird dann `CONFIRMED`, dazu kommen `homeDepartmentConfirmedById`, `homeDepartmentConfirmedAt` und ein Protokolleintrag. `CONFIRMED` ist bewusst von `CEVIDB` getrennt und zählt bei Verbands-Anlässen als verifizierte Heimabteilung (`isVerifiedHomeSource`). Die Bestätigung endet beim Abteilungswechsel, wenn die Rollen nicht mehr in der Ortsgruppe liegen oder wenn eine Jungschar-Rolle dazukommt (dann `CEVIDB`).
* **Ohne Gruppenstruktur** (Hitobito nicht erreichbar, Scope fehlt): Bestehende Abteilungen und Leitungen bleiben, neue Leitungen gibt es nicht. Wer noch keine Abteilung hat, bekommt die zu `ortsgruppe_id` mit Quelle `SELF`. Das gilt auch für eine Abteilung, die an einer Ortsgruppe mit mehreren Jungscharen hängt: Dort ist die Leitung nicht prüfbar.
* **Leitungsrolle fällt weg:** Die Rolle wird beim nächsten Login wieder entzogen, ausser es ist die letzte Leitung der Abteilung.
* **Neue Abteilung anlegen:** Hat die Gruppe noch keine Abteilung, wird eine berechtigte Verbandsleitung auf `login.<domain>/abteilung-erstellen` weitergeleitet. Die Gruppe ergibt sich aus der Leitungsrolle: die Ortsgruppe, bei mehreren Jungscharen die Jungschar.

### 2.2 Simulierte Verbands-DB (nur Dev und lokal)

Damit lassen sich Rollen, Ebenen und Mehrfach-Zugehörigkeiten testen, ohne echte Konten zu brauchen. Code: `services/hitobitoSimulation.ts` und `routes/auth/hitobitoSimulation.ts`.

* **Ablauf:** Mit `HITOBITO_SIMULATION=true` führt «Mit Jubla-DB/MiData/Cevi.DB anmelden» zuerst auf `/api/auth/hitobito-sim/authorize`. Dort wählt man eine Persona oder «Weiter zur echten …». Die Persona führt auf einen eigenen Callback (`/api/auth/hitobito-sim/callback`), der nur mit dem Schalter registriert ist. Er prüft den `state` gegen den Cookie, baut das Profil aus der Persona, schreibt die simulierte Gruppenstruktur in `hitobito_groups` und startet danach den normalen Login.
* **Schranken:** Die Routen sind nur mit dem Schalter registriert. Zusätzlich prüfen Login-Start, Auswahlseite und Callback, ob der Host `dev.` enthält oder `localhost` ist. Auf Produktiv-Domains ist die Simulation nie aktiv, auch nicht mit gesetztem Schalter. In `docker-compose.yml` (Produktion) gibt es die Variable bewusst nicht.
* **IDs:** Simulierte Personen und Gruppen haben IDs ab 900 000 000, die E-Mail-Adressen enden auf `@simulation.invalid` und der Nachname lautet «(Simulation)». So kollidieren sie nie mit echten Hitobito-IDs, auch wenn Dev an der produktiven Verbands-DB hängt.
* **Personas:** pro Verband in `hitobitoSimulation.ts` (Bund, Kanton, Region, Schar oder Abteilung, Leitende, mehrere Scharen, Kasse, ohne Rollen).
* **Eigene Rollen:** höchstens 16 zur Auswahl. Die Auswahl als Bitmaske ergibt die Personen-ID, gleiche Auswahl heisst gleiches Konto.
* **Zurücksetzen:** nur per POST aus der Auswahlseite und nur, wenn `state` zum Cookie `cevidb_oauth_state` passt. Es werden nur simulierte Konten und Schichtpläne mit Gruppen-ID ab 900 000 000 gelöscht.

### 2.3 E-Mail und Passwort

Die Hauptmethode für Vereine und der Fallback für alle anderen.

* Auf `vereins-schichtplan.ch` (`organization === 'OTHER'`) gibt es **kein Verbands-SSO**. Mitglieder und Leitungen melden sich mit E-Mail und Passwort an.
* **Verein anlegen:** Wer eine verifizierte E-Mail-Adresse oder ein gesetztes Passwort hat, kann auf `login.vereins-schichtplan.ch/abteilung-erstellen` einen Verein mit freiem Namen und Subdomain anlegen. Die Person wird Hauptverantwortliche (`role = 'ADMIN'`, `leaderSource = 'MANUAL'`).
* **Vereinsleitung verwalten:** Eine bestehende Vereinsleitung kann unter *Personen* andere Mitglieder zur Vereinsleitung ernennen oder den Status wieder entziehen (`role = 'HELPER'`).
  * **Schutz:** Mindestens eine Leitung bleibt immer in der Abteilung. Die letzte kann sich weder selbst degradieren noch entfernt werden.
  * Jede Ernennung und jeder Entzug steht im Protokoll (`department_audit_logs`, `LEADER_GRANT` bzw. `LEADER_REVOKE`).
* **Passwort-Reset** läuft über SHA-256-Tokens (`password_reset_tokens`).

### 2.4 Spitzname-Login (ohne Passwort)

Für Helfende, Eltern und Ehemalige, die kein Konto anlegen wollen. Code: `services/ceviNameLogin.ts`.

* **Geltungsbereich:** nur, wenn `return_to` auf eine Abteilungs-Subdomain zeigt.
* **Zugang:** Spitzname (Pfadiname, Cevi-Name) **und** Geburtsdatum **und** Abteilung.
* **Rechte:** Solche Profile bleiben strikt `HELPER` ohne Sonderrechte und können weder Abteilungsleitung noch OK-Leitung werden.
* **Automatisches Zusammenführen:** Meldet sich die Person später mit Hitobito oder E-Mail und Passwort an, werden Schichten und Stufen übernommen und das Spitzname-Profil gelöscht (`services/mergeProfiles.ts`).

### 2.5 Zwei-Faktor-Anmeldung (TOTP)

Code: `services/twoFactor.ts`, `routes/auth/twoFactor.ts`.

* **Standard:** RFC 6238 (HMAC-SHA1, 30 Sekunden, 6 Ziffern, ±1 Zeitschritt), eigene Implementierung ohne Zusatzpaket. Jede Authenticator-App funktioniert.
* **Für wen:** Konten mit Passwort oder Hitobito. Nicht für Spitzname-Profile.
* **Wann gefragt:** Beim Passwort-Login immer. Beim Hitobito-Login nur, wenn die Person das im Profil eingeschaltet hat (`users.totp_on_provider_login`, Standard aus).
* **Ablauf:** Der Login prüft Passwort bzw. OAuth und setzt dann statt des Login-Tokens den Cookie `mfa_challenge` (nur für diesen Host, 10 Minuten, HMAC-signiert, bewusst kein JWT). Erst `POST /api/auth/2fa/verify` auf `login.<domain>/zwei-faktor` stellt das Login-Token aus. Beim OAuth-Login steht das Weiterleitungsziel in der Challenge.
* **Geheimnis:** Das TOTP-Secret liegt AES-256-GCM-verschlüsselt in `users.totp_secret`. Der Schlüssel `TOTP_ENCRYPTION_KEY` (32 Byte) steht in der Server-`.env`. Ohne ihn lässt sich 2FA in Produktion nicht einrichten. **Wer den Schlüssel verliert oder wechselt, macht alle eingerichteten 2FA unbrauchbar.**
* **Schutz:** Ein Code lässt sich nicht zweimal verwenden (`totp_last_step`). Fehlversuche sind begrenzt (5 pro Konto und 15 Minuten, 30 pro IP und 10 Minuten). Es gibt 10 Wiederherstellungscodes, die nur als SHA-256 gespeichert und je einmal gültig sind.
* **Profil:** Einrichten verlangt bei Passwort-Konten das Passwort. Ausschalten, Schalter ändern und neue Wiederherstellungscodes verlangen einen aktuellen Code.
* **Passwort-Reset** schaltet 2FA nicht aus: Der Reset loggt nicht ein, danach gilt wieder Passwort plus Code.
* **Admin:** `POST /api/admin/users/:id/2fa/reset` (Protokoll `USER_TWO_FACTOR_RESET`), im Admin-Portal im Personen-Dialog.

---

## 3. Beitritt zu Abteilungen und Einladungen

Code: `services/departmentJoin.ts`, `services/inviteToken.ts`.

* **Beitrittsmodus** pro Abteilung: `OPEN` (frei wählbar), `LINK_ONLY` (nur über den Abteilungslink) und `INVITE_ONLY` (nur Einladung, passende Rollen in der Verbands-DB oder Bestätigung durch die Leitung).
* **Abteilungslink** (`departments.invite_token`): Wer ihn nutzt, wird Mitglied. Er hat kein Ablaufdatum, bis die Leitung «Neu erzeugen» wählt. Er ist bewusst keine Schranke.
* **Persönliche Einladung per E-Mail:** 14 Tage gültig (`PERSONAL_INVITE_TTL_DAYS`). Mit Rechte-Vorlage gilt sie nur für die eingeladene, bestätigte E-Mail-Adresse und lässt sich nur einmal einlösen (`department_invite_redemptions`, nur als SHA-256 gespeichert).
* **Entfernen durch die Leitung** setzt `department_members.removed_at`. Danach gilt nur noch eine später ausgestellte persönliche Einladung, nicht mehr der Abteilungslink. Beitritte aus der Verbands-DB (`join_source` `CEVIDB` bzw. `CEVIDB_CONFIRMED`) lassen sich weder selbst verlassen noch von der Leitung entfernen.
* **Herkunft einer bestätigten Heimabteilung** (`users.home_department_confirm_source`): `INVITE` und `FOUNDER` (Verein angelegt) bleiben bestehen. `CEVIDB` und `null` (Leitung) prüft jeder Verbands-Login gegen die Rollen.
* **Einladung über alle Login-Wege:** Der Parameter `invite` geht beim Verbands-Login im OAuth-`state` mit, auch über «Konto verknüpfen», 2FA und Fehlerseiten. Danach landet die Person auf `/abteilung?invite=…`. Die Bestätigungsmail enthält `return_to` und `invite`.
* **Registrierung** legt keinen Gast-Eintrag in der Abteilung mehr an. Die Abteilung wird nach dem ersten Login auf `/abteilung` gewählt.

---

## 4. Rollen und Rechte

### Stufe 0: Globale Admins (`users.isGlobalAdmin`)
* Voller Zugriff auf das Admin-Portal.
* Haben in jeder Abteilung automatisch alle Leitungsrechte.
* Im Admin-Portal lässt sich nach Verband (Cevi, Pfadi, Jubla, Vereine) filtern.

### Stufe 1: Abteilungsleitung und Vereinsleitung (`department_members.role = 'ADMIN'`)
* **Cevi, Pfadi, Jubla:** entsteht über die Verbands-DB (`CEVIDB`) oder das Admin-Portal (`MANUAL`).
* **Vereine (`OTHER`):** entsteht beim Anlegen des Vereins oder durch Ernennung durch eine andere Vereinsleitung (`MANUAL`).
* Hat alle Rechte in der eigenen Abteilung bzw. im eigenen Verein.
* Die letzte Leitung kann weder gelöscht noch degradiert werden.

### Stufe 2: Einzelne Abteilungsrechte (`department_members.permissions`, Rolle `HELPER`)
* 15 fein abgestufte Rechte (`DEPARTMENT_PERMISSIONS` in `packages/shared/src/constants.ts`).
* **Vorlagen:** Administration (alle Rechte), Anlass-Koordination, Anlässe bearbeiten, Anlässe erstellen.
* **Prüfung:** zentral im Backend in `services/permissions.ts` (`departmentAccess`, `eventCapabilities`, `managerFlags`). Das Frontend liest die wirksamen Rechte aus `viewer.access.capabilities`.

### Stufe 3: Anlass-OK (`event_organizers`)
Gilt nur für einen einzelnen Anlass.
* `OK_MEMBER`: Schichten planen, Helfende sehen, Nachrichten senden, Anwesenheit prüfen, Vorlagen nutzen.
* `OK_LEAD`: zusätzlich Anlass-Einstellungen bearbeiten und das OK-Team verwalten.
* Einen Anlass löschen darf nur die Abteilungsleitung.

---

## 5. Sicherheit des Admin-Portals

Alle Admin-Routen laufen über `requireGlobalAdmin`:

1. **Origin-Prüfung:** Zugriff nur von `admin.<domain>` (`Sec-Fetch-Site: same-origin` oder `none`).
2. **Sitzungsdauer:** Das Token ist höchstens 12 Stunden alt (`ADMIN_SESSION_MAX_HOURS`).
3. **Verbands-Login Pflicht:** In Produktion müssen Admins über die Verbands-DB angemeldet sein (`ADMIN_REQUIRE_CEVIDB_LOGIN`, `amr=cevidb`).
4. **Protokoll:** Jede administrative Änderung steht in `admin_audit_logs`.
5. **Server-Alarme:** `services/serverAlert.ts` sendet Meldungen an einen Webhook (`ADMIN_ALERT_WEBHOOK_URL`), z. B. bei erschöpftem Datenbank-Pool, SMTP-Fehlern oder 500er-Fehlern.
