# End-to-End-Tests

Prüfen die wichtigsten Abläufe im echten Browser (Playwright, Chromium) gegen die **lokale** Umgebung:

| Datei | Ablauf |
|---|---|
| `login.spec.ts` | Login-Portal mit E-Mail und Passwort, falsches Passwort, kein offener Redirect |
| `membersOnly.spec.ts` | Abteilung «Nur für Mitglieder»: ohne Anmeldung keine Anlässe, kein Arbeitskatalog |
| `helperSignup.spec.ts` | Helfer*in trägt sich ein, sieht die Schicht in «Meine Schichten», trägt sich aus; ohne Anmeldung kein Eintragen |
| `nickname.spec.ts` | Spitznamen-Profil anlegen und wieder anmelden, falsches Geburtsdatum |
| `okArea.spec.ts` | Abteilungsleitung im OK-Bereich, Helfende ohne Rechte bekommen keine OK-Daten |
| `simulation.spec.ts` | Verbands-Login über die simulierte Cevi.DB: Auswahlseite, Stufenleiterin ohne Schichtplan (Grund und Rollen), Abteilungsleitung legt an, automatische Zugehörigkeit, eigene Rollen. Setzt die Simulation vorher und nachher zurück |

Die Tests legen pro Lauf eigene Anlässe in der Zukunft an (Slug `e2e-…`) und löschen sie danach wieder.
Cevi-Name-Testprofile (`E2E…`) bleiben in der lokalen Datenbank.

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

## Hinweise

- **Nur lokal:** `global-setup.ts` bricht ab, wenn eine Adresse nicht auf `localhost` zeigt. Die Tests legen Konten an und tragen sich ein.
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
