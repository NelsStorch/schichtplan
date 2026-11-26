# Datenbank und Datenmodell 🗄️

## 1. PostgreSQL 17 und Prisma 7

* Schema: `apps/backend/prisma/schema.prisma`. Der generierte Client (`apps/backend/src/generated/prisma`) liegt nicht im Git, Verbindung über `@prisma/adapter-pg` (`apps/backend/src/db.ts`).
* **Migrationen:** `npm run db:migrate`. Bestehende werden nicht verändert. Neue Spalten sind nullable oder haben einen Standardwert, damit Updates ohne Ausfall laufen.

---

## 2. Kerntabellen im Überblick

| Tabelle | Beschreibung |
|---|---|
| `departments` | Abteilungen, Scharen und Vereine mit Slug, Name, Farben, Logo, `hitobitoGroupId` (Ortsgruppe oder Jungschar) und `default_locale` (Standardsprache). |
| `hitobito_groups` | Zwischenspeicher der Gruppenstruktur aus der Verbands-DB (Jungschar, Ortsgruppe, Anzahl Jungscharen). Keine Personendaten. |
| `department_members` | Zugehörigkeit zur Abteilung (`ADMIN` oder `HELPER`), `permissions text[]`, `leader_source`. |
| `events` | Anlässe pro Abteilung mit Zeitraum, `accessType`, `attendance_mode`, `allow_replacement`. |
| `shifts` | Schichten eines Anlasses mit Start- und Endzeit, Kategorie, `minAge` und benötigten Helfenden. |
| `shift_signups` | Eintragungen von Helfenden mit Schichtbezug, Anwesenheitsstatus und Ersatz-Status. |
| `users` | Personen: E-Mail, Passwort-Hash, Vor- und Nachname, `nickname`, `birthDate`, `locale` (Sprache), `isGlobalAdmin`. |
| `user_hitobito_roles` | Rollen einer Person aus der Verbands-DB: nur Rollentyp und Gruppe, bei jedem Login ersetzt. Nur für die Berechtigungs-Diagnose im Admin-Portal (`GET /api/admin/users/:id/access-diagnosis`, nur globale Admins). |
| `event_questions`, `event_answers` | Dynamische Fragen pro Anlass mit einstellbarer Löschfrist (`retention_days`). |
| `department_audit_logs`, `admin_audit_logs` | Protokolle für Rechteänderungen und administrative Aktionen. |

Die vollständige Liste steht in `schema.prisma`.

### Sprachen

* `enum Locale { DE FR IT EN }`
* `users.locale` ist `null`, solange die Person nie eine Sprache gewählt hat. Dann greift die Sprachermittlung (siehe [Mehrsprachigkeit](i18n.md)).
* `departments.default_locale` ist die Standardsprache der Abteilung (Standard `DE`).

---

## 3. Zeitzonen (Europe/Zurich)

> **Wichtig:** Alle Container laufen in **UTC**. Ein- und Ausgaben für Nutzende gelten strikt in **Europe/Zurich**.

* **Goldene Regel:** Keine JavaScript-Datumsfunktionen wie `getHours()`, `getDate()`, `new Date(y, m, d)` oder `toLocale…` ohne ausdrückliche Zeitzone. Sie laufen lokal auf Schweizer Zeit, auf dem Server aber in UTC, mit 1 bis 2 Stunden Unterschied.
* **Standard-Helfer:** Nur die Funktionen aus `packages/shared/src/timezone.ts` verwenden:
  * `toZurichInput()` und `zurichInputToIso()` für `<input type="datetime-local">`
  * `zurichDayKey()`, `zurichTimeKey()`, `zurichDateTime()`
  * `addZurichDays()`, `addDaysToDayKey()`
  * `formatZurichTimeRange()` für einheitliche Zeitangaben («18:00–22:00»)
  * `ageAt(birthDate, shift.startTime)` für Altersprüfungen zum Schichtbeginn

---

## 4. Nutzungsstatistik und Datensparsamkeit

* **Prinzip:** Es werden nur anonymisierte Summen gezählt (pro Tag bzw. Stunde). Es werden **keine** IP-Adressen, Cookies, User-Agents oder Klartext-URLs gespeichert.
* **Kennzahlen:** definiert in `packages/shared/src/stats.ts` (`USAGE_METRICS`).
* **Tabellen:** `usage_counters`, `request_stats`, `stats_snapshots`.
* **Aktivität pro Person:** Einzige Angabe ist `users.last_seen_on` (nur das Datum, höchstens eine Aktualisierung pro Tag).
* **Browser-Tracking:** `<UsageTracker app>` aus `@schichtplan/ui` respektiert Browser-Einstellungen wie `DNT: 1` und `Sec-GPC: 1`.
