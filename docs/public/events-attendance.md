# Anlässe, Anwesenheit und Helferverwaltung 📋

## 1. Zugang zu Anlässen (`events.accessType`)

* Die Selbsteintragung braucht grundsätzlich ein Konto. Ein Spitzname-Profil ohne Passwort genügt (siehe [Anmeldung und Berechtigungen](auth-permissions.md)).
* **Zugangstypen (`EVENT_ACCESS_TYPES`):**
  * `PUBLIC`: für alle Personen offen.
  * `CEVIDB_ALL`: nur mit verifiziertem Verbands-DB-Konto.
  * `DEPARTMENT`: nur für Mitglieder der eigenen Abteilung.
  * `DEPARTMENT_CEVIDB`: Mitglieder der eigenen Abteilung mit Verbands-DB-Login.
  * `WHITELIST` und `WHITELIST_CEVIDB`: nur für freigegebene Abteilungen (`event_allowed_departments`).
* **Zugangs-Links (`event_access_links`):**
  * Werden als `?zugang=TOKEN` übergeben.
  * Typ `PERSONAL` bindet sich fest an das erste angemeldete Konto, `GROUP` steht allen Personen mit dem Link offen.
* **Startseite nur für Mitglieder (`departments.members_only`):**
  * Verhindert, dass Externe interne Anlässe sehen.
  * Öffentliche Anlässe bleiben per Direktlink erreichbar.

---

## 2. Anwesenheitsliste und QR-Check-in

* **Modi (`events.attendance_mode`):** `OFF` (Standard), `OK_ONLY` (nur das OK hakt ab) und `OK_AND_QR` (zusätzlich Selbst-Check-in per QR-Code).
* **Status pro Eintragung:** `PRESENT`, `EXCUSED`, `NO_SHOW` (gespeichert in `shift_signups.attendance`, `null` heisst offen).
* **QR-Check-in:**
  * Das Backend erzeugt die QR-Codes selbst (`services/qrGenerator.ts`). Externe Dienste werden dafür nicht aufgerufen.
  * Helfende markieren sich in einem Zeitfenster rund um die Schicht selbst als anwesend (`POST /api/events/:slug/checkin`). Das Fenster ist pro Anlass einstellbar (`checkinEarlyMinutes`, `checkinLateMinutes`, Standard je 30 Minuten).
  * Alle Statusänderungen stehen im Schicht-Protokoll (`shift_signup_logs`).

---

## 3. «Ersatz gesucht»

* Wer verhindert ist, kann die eigene Schicht als «Ersatz gesucht» ausschreiben.
* **Wichtig:** Die Person **bleibt eingetragen**, bis jemand anderes die Schicht verbindlich übernimmt.
* **Frist:** bis `events.replacement_cutoff_hours` Stunden vor Schichtbeginn.
* **Übernahme:** über `POST /api/shifts/:id/signup {replacesSignupId}`. Dabei wird die ursprüngliche Person automatisch ausgetragen und per E-Mail informiert.

---

## 4. OK-Bereich und Schichtplanung

* **Aufbau:**
  * Die Unterseiten liegen unter `apps/web/src/app/events/[slug]/ok/`.
  * Gemeinsames Layout in `components/ok/OkLayout.tsx`, gemeinsamer Zustand in `components/ok/OkContext.tsx`.
* **Dauer des Anlasses:**
  * `events.startDate` und `endDate` berechnet `syncEventRange()` automatisch aus der ersten und der letzten Schicht.
  * Ein Anlass lässt sich mit `POST /api/events/:slug/move {days}` um ganze Tage verschieben.
* **Massenbearbeitung:** `POST /api/events/:slug/shifts/bulk` löscht, verschiebt oder ändert mehrere Schichten und Kategorien auf einmal.
* **Nachrichten an Helfende:** `POST /api/events/:slug/messages` verschickt gezielte E-Mails an Schichten, Helfende oder das OK. Begrenzung: 10 Nachrichten pro Stunde und Anlass.
* **Schichtplan-PDF:** wird im Browser mit `@react-pdf/renderer` erzeugt (`components/ok/ShiftPlanPdf.tsx`).

---

## 5. Verpflegungs- und Getränkebons 🍔🥤

* **Einstellungen (`events.catering_tokens_enabled`):**
  * Lassen sich in den Anlass-Einstellungen einschalten.
  * `catering_token_items`: Bon-Titel pro Schicht (Standard `["1x Helfermenü", "1x Getränk"]`).
  * `catering_early_hours`: Vorlaufzeit in Stunden vor Schichtbeginn (Standard `2`), damit Helfende einer Nachmittagsschicht schon mittags essen können.
* **Lebenszyklus (`catering_tokens`):**
  * Die Bons entstehen automatisch beim Check-in (`POST /api/events/:slug/checkin`) oder bei der Anwesenheitsmarkierung (`PUT /api/events/:slug/signups/:id/attendance`).
  * Status: `AVAILABLE`, dann `REDEEMED` (oder `CANCELLED`).
  * Verfügbar ist ein Bon, sobald die Person anwesend ist oder die Zeit im Vorlauf liegt (`now >= startTime - earlyHours`).
* **Einlösen am Stand (Wischen):**
  * Helfende wischen auf dem eigenen Handy vor dem Standpersonal (`POST /api/events/:slug/catering-tokens/:id/redeem`).
  * Das Personal muss das Gerät nicht anfassen, das ist hygienisch an Grill und Essensständen.
  * **Schutz vor Screenshots:** Nach dem Wischen erscheint 120 Sekunden lang eine Live-Uhrzeit mit laufenden Sekunden und Countdown.
* **Auswertung und Kassensturz:**
  * Im OK-Anwesenheitspanel (`EventAttendancePanel`) unter «Verpflegungs-Statistik» (`GET /api/events/:slug/catering-overview`).
  * Liefert Gesamtzahlen, Einlösequote und eine Aufschlüsselung nach Bon-Typ für die Abrechnung der Festkasse.
