# End-to-End-Tests

Prüfen die wichtigsten Abläufe im echten Browser (Playwright, Chromium) gegen die **lokale** Umgebung:

| Datei | Ablauf |
|---|---|
| `login.spec.ts` | Login-Portal mit E-Mail und Passwort, falsches Passwort, kein offener Redirect |
| `membersOnly.spec.ts` | Abteilung «Nur für Mitglieder»: ohne Anmeldung keine Anlässe, kein Arbeitskatalog |
| `helperSignup.spec.ts` | Helfer*in trägt sich ein, sieht die Schicht in «Meine Schichten», trägt sich aus; ohne Anmeldung kein Eintragen |
| `nickname.spec.ts` | Spitznamen-Profil anlegen und wieder anmelden, falsches Geburtsdatum |
| `okArea.spec.ts` | Abteilungsleitung im OK-Bereich, Helfende ohne Rechte bekommen keine OK-Daten |
| `registration.spec.ts` | Konto mit Passwort erstellen, Login erst nach Bestätigung, Bestätigungslink aus der Mail, «Passwort vergessen» mit Link (gilt nur einmal, altes Passwort danach ungültig) |
| `twoFactor.spec.ts` | Zwei-Faktor mit frischem Konto: einschalten, Passwort allein reicht nicht, falscher und schon verwendeter Code, Wiederherstellungscode (nur einmal), ausschalten nur mit Code |
| `permissions.spec.ts` | Datenschutz: ohne Anmeldung keine Daten, Helfende ohne Personenlisten, Protokoll und Anlass-Listen, keine Admin-API, fremde Abteilung «nur für Mitglieder», Anlass nicht unter fremder Subdomain |
| `organizations.spec.ts` | Cevi- und Pfadi-Abteilung mit gleicher Subdomain bleiben getrennt (`<slug>.localhost` / `<slug>.pfadi.localhost`), Verzeichnis je Verband, Verbands-Login-Knopf je Domain |
| `adminPortal.spec.ts` | Admin-Portal: ohne Anmeldung nichts, Helfende «Kein Zugriff», globale Admin sieht Daten, Admin-API lehnt Aufrufe von fremder Seite ab (CSRF) |
| `simulation.spec.ts` | Verbands-Login über die simulierte Cevi.DB: Auswahlseite, Stufenleiterin ohne Schichtplan (Grund und Rollen), Abteilungsleitung legt an, automatische Zugehörigkeit, eigene Rollen. Setzt die Simulation vorher und nachher zurück |
| `accessibility.spec.ts` | Barrierefreiheit (axe-core, WCAG 2.1 A/AA): Landing, Login, Abteilung, Anlass, Meine Schichten und Admin-Portal ohne schwere Verstösse; Skip-Link per Tastatur; Dialog mit Esc schliessbar |

Die Tests legen pro Lauf eigene Anlässe in der Zukunft an (Slug `e2e-…`) und löschen sie danach wieder, ebenso
die Test-Abteilungen (`e2e-fremd-…`, `e2e-org-…`). Cevi-Name-Testprofile (`E2E…`) und Testkonten
(`e2e-…@example.com`) bleiben in der lokalen Datenbank.

**Mails:** Lokal ist kein `SMTP_PASSWORD` gesetzt, das Backend schreibt Mails darum ins Container-Log. Die Tests lesen
Bestätigungs- und Reset-Links mit `docker logs schichtplan-dev-backend` aus und brechen ab, wenn ein Link nicht auf
`localhost` zeigt (nie echte Domains öffnen).

## Ausführen

```bash
npm run dev:docker
```

In einem zweiten Terminal einmalig die Datenbank vorbereiten (ein beliebiges lokales Passwort für die Demo-Konten wählen):

```bash
docker exec schichtplan-dev-backend npx prisma migrate deploy
docker exec -e SEED_PASSWORD=mein-lokales-passwort schichtplan-dev-backend npm run db:seed
```

Einmalig den Browser installieren, dann die Tests mit demselben Passwort starten:

```bash
npx playwright install chromium
SEED_PASSWORD=mein-lokales-passwort npm run test:e2e
```

Statt `SEED_PASSWORD` jedes Mal mitzugeben, kann es in `e2e/.env.e2e` stehen (gitignored, Zeile `SEED_PASSWORD=…`).
Nach Änderungen am Backend-Code den Container neu starten (`docker restart schichtplan-dev-backend`): Unter Windows
kommen Dateiänderungen über den Mount nicht immer beim Watcher an.

## Hinweise

- **Nur lokal:** `global-setup.ts` bricht ab, wenn eine Adresse nicht auf `localhost` zeigt. Die Tests legen Konten an und tragen sich ein.
- **In der CI** laufen die Tests im Job `e2e` genauso gegen `docker-compose.dev.yml`, sobald Code, Tests oder die Dev-Umgebung geändert werden. Bei einem Fehler liegen Screenshots und Traces als Artefakt `e2e-test-results` am Lauf.
- **Anmelden in den Tests:** Lokal gilt das Cookie des Login-Portals (`localhost:3002`) nicht für `demo.localhost:3000`. Die Tests melden sich darum direkt über den API-Proxy der Abteilungsseite an; den Login über das Portal prüft `login.spec.ts` separat.
- Bei einem Fehler liegen Screenshot und Trace unter `test-results/` (`npx playwright show-trace …`).

## Testplan auf Dev mit der simulierten Verbands-DB

Auf Dev (`HITOBITO_SIMULATION=true`) führt «Mit … anmelden» zuerst auf eine Auswahlseite: erfundene Person, eigene Rollen oder weiter zur echten DB. Vor einem Durchgang einmal **Simulation zurücksetzen**. Nach jeder Person abmelden (oder privates Fenster).

**Jubla** (`login.dev.jubla-schichtplan.ch`)

| Person | Erwartet |
|---|---|
| Leiterin | «Für Jubla Sim-Uster gibt es noch keinen Schichtplan», Rolle «keine Leitung», Knopf «An Scharleitung senden» |
| Scharleitung Sim-Uster | Formular «Jubla Sim-Uster hat noch keinen Schichtplan», anlegen (Subdomain z. B. `sim-uster`) |
| Leiterin (nochmals) | landet direkt in Sim-Uster, kein «Anlegen» mehr |
| Leiterin in zwei Scharen | Heimabteilung offen oder Sim-Uster; auf der Auswahlseite «Weitere Mitgliedschaften»: Sim-Wetzikon erst, wenn dort ein Schichtplan existiert |
| Scharleitung Sim-Wetzikon | anlegen; danach Leiterin in zwei Scharen: Sim-Wetzikon «Aus Jubla-DB», kein «Verlassen»; im Protokoll von Sim-Wetzikon «Dazugekommen» |
| Leiterin, Ehemalige anderswo | Sim-Wetzikon zählt **nicht** (Ehemalige) |
| Bundesleitung | Formular «Jubla Schweiz (Sim) hat noch keinen Schichtplan», anlegen; im neuen Schichtplan heisst es «Organisation» und «Leitung», nicht «Schar» |
| Bundesleitung mit Schar | landet in Sim-Uster; Startseite zeigt «Du leitest auch …», falls der Bund noch keinen Schichtplan hat |
| Kasse Bundesleitung | kein Anlegen, Rolle «keine Leitung» |
| Regional- und Scharleitung | Auswahl der Ebene beim Anlegen (Schar zuerst), Region heisst danach «Organisation» |
| Lagerleitung | keine Leitung |
| Ohne Rollen | Auswahl «Zu welcher Schar gehörst du?», nur offene Scharen wählbar |

**Pfadi** (`login.dev.pfadi-schichtplan.ch`): Mitarbeiter*in Geschäftsstelle darf den Bund anlegen, Geschäftsleitung Bund nicht; Abteilungsleitung Sim-Adler legt an; Leitung in zwei Abteilungen wie bei Jubla.

**Cevi** (`login.dev.cevi-schichtplan.ch`): Geschäftsleitung Dachverband darf den Dachverband anlegen; Abteilungsleitung Sim-Stadt Nord legt die Jungschar Nord an (Ortsgruppe mit zwei Jungscharen); Stufenleiterin wie Leiterin bei Jubla.

**Vereine** (`login.dev.vereins-schichtplan.ch`): keine Simulation (kein Verbands-Login); Beitritt nur über Link, Einladung oder offene Vereine.

Zum Schluss **Simulation zurücksetzen**: löscht die simulierten Konten und ihre Schichtpläne, echte Daten bleiben.
