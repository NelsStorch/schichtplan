# Mitmachen beim Schichtplan

Schön, dass du helfen willst! Bitte schreibe auf **Deutsch (bevorzugt) oder Englisch**. *English summary at the bottom.*

## Ohne Code mithelfen

| Du hast … | Dann … |
|---|---|
| einen **Fehler** gefunden | [Fehler melden](https://github.com/NelsStorch/schichtplan_v2/issues/new?template=fehler.yml) |
| eine **Idee** | [Wunsch oder Idee](https://github.com/NelsStorch/schichtplan_v2/issues/new?template=wunsch.yml) |
| eine **falsche Übersetzung** entdeckt | [Sprachfehler melden](https://github.com/NelsStorch/schichtplan_v2/issues/new?template=sprachfehler.yml) oder direkt ein Pull Request (siehe [Übersetzungen](#übersetzungen)) |
| eine **Rolle oder Gruppe**, die aus Cevi.DB, MiData oder Jubla-DB falsch erkannt wird | [Gruppe oder Rolle anpassen](https://github.com/NelsStorch/schichtplan_v2/issues/new?template=rollen.yml) |
| eine **Frage** | [Discussions](https://github.com/NelsStorch/schichtplan_v2/discussions) |
| eine **Sicherheitslücke** gefunden | **nicht öffentlich**, sondern wie in [SECURITY.md](SECURITY.md) beschrieben |

Bitte keine Namen, E-Mail-Adressen oder anderen Personendaten von Helfenden in Texten oder Screenshots. Für Screenshots eignen sich die Demo-Daten (siehe unten).

---

## Code beitragen

Bei neuen Funktionen oder grösseren Umbauten bitte zuerst ein Issue oder eine Discussion eröffnen, damit keine Arbeit umsonst ist. Kleine Korrekturen kannst du direkt als Pull Request schicken. Gute Einstiegspunkte sind die Labels [`good first issue`](https://github.com/NelsStorch/schichtplan_v2/labels/good%20first%20issue) und [`help wanted`](https://github.com/NelsStorch/schichtplan_v2/labels/help%20wanted).

### Lokal starten

Du brauchst Node.js 26 oder neuer (siehe `.nvmrc`), npm 11 und Docker.

```bash
git clone https://github.com/NelsStorch/schichtplan_v2.git
cd schichtplan_v2
npm ci
npm run build --workspace=packages/i18n
npm run build --workspace=packages/shared
npm run dev:docker      # startet alle Dienste und die Datenbank
npm run db:migrate      # in einem zweiten Terminal
npm run db:seed         # Demo-Daten
```

Danach laufen:

| Dienst | Adresse |
|---|---|
| Startseite | http://localhost:3001 |
| Abteilung | http://localhost:3000 |
| Login | http://localhost:3002 |
| Admin-Portal | http://localhost:3003 |
| Backend | http://localhost:4000 |
| Datenbank | `127.0.0.1:5432` |

Die Demo-Daten enthalten eine Abteilung `demo` mit Anlässen und Schichten sowie das Konto `admin@example.com`. Das Passwort wird beim Seed ausgegeben oder über `SEED_PASSWORD` gesetzt. `npm run db:studio` öffnet Prisma Studio.

**Abteilungen und Verbände ohne DNS testen:** Hostnamen unter `localhost` funktionieren direkt. `demo.localhost:3000` öffnet die Demo-Abteilung. Enthält der Hostname `pfadi`, `jubla` oder `verein`, gilt dieser Verband, z. B. `pfadi.localhost:3001` oder `demo.jubla.localhost:3000`. Sonst gilt Cevi. Für API-Aufrufe geht auch der Header `x-tenant-slug: <abteilung>`.

**Anmelden:** Hitobito akzeptiert kein `localhost` als Rücksprungadresse. Lokal meldest du dich mit E-Mail und Passwort an oder mit der simulierten Verbands-DB, die lokal standardmässig eingeschaltet ist (siehe [Anmeldung und Berechtigungen](docs/public/auth-permissions.md#22-simulierte-verbands-db-nur-dev-und-lokal)).

### Tests

```bash
npm run check           # Lint, Typecheck, Übersetzungsprüfung und Unit-Tests
npm run test:db         # Integrationstests mit Datenbank (startet bei Bedarf einen Postgres-Container)
npm run test:e2e        # End-to-End-Tests, Voraussetzungen in e2e/README.md
```

Vor jedem Pull Request muss `npm run check` durchlaufen.

### Hilfe-Center

Das Hilfe-Center unter `hilfe/` ist ein eigenes Astro-Starlight-Projekt.

```bash
npm run hilfe:dev       # http://localhost:3004
npm run hilfe:build     # statischer Build mit Suchindex
```

### Regeln, die man nicht erraten kann

* **Datenschutz:** Nicht-Admins sehen nur Personen der eigenen Abteilung oder des eigenen Anlasses. Die Rechteprüfung passiert im Backend (`services/permissions.ts`), nicht im Frontend.
* **Zeiten** nur über `packages/shared/src/timezone.ts` (Europe/Zurich). Die Container laufen in UTC.
* **Keine Geheimnisse** im Repo, auch nicht als Fallback. Beispielwerte mit Platzhaltern gehören in die `.env*.example`.
* **Keine fest eingebauten Texte** in Oberflächen oder API-Antworten, alles läuft über `packages/i18n`.
* **Schemaänderungen** brauchen eine neue Prisma-Migration. Bestehende Migrationen bleiben unverändert.
* **Alle vier Auftritte** (Cevi, Pfadi, Jubla, Verein) prüfen, wenn Texte, Begriffe oder das Aussehen betroffen sind.
* **Hilfe-Center** anpassen, wenn sich Abläufe für Nutzende ändern.
* Deutsche Texte in **Schweizer Schreibweise** («ss» statt «ß»).

### Übersetzungen

Die Texte der App liegen in `packages/i18n/src/messages/<de|fr|it|en>/*.json`, das Hilfe-Center in `hilfe/src/content/docs/` (Deutsch direkt, die anderen Sprachen in Unterordnern). Neue Texte zuerst auf Deutsch anlegen und wenn möglich in allen vier Sprachen ergänzen. Wenn du Französisch oder Italienisch nicht kannst, schreib es in den Pull Request. `npm run i18n:check` prüft Format, Platzhalter und Abdeckung. Mehr dazu in [Mehrsprachigkeit](docs/public/i18n.md).

### Commits und Pull Requests

Conventional Commits mit Bereich, auf Deutsch oder Englisch:

```
feat(i18n): Sprachwähler als gestyltes Dropdown
fix(deps): bump @react-pdf/renderer to 4.9.2
```

Ein Pull Request geht gegen `main`, behandelt ein Thema und füllt die Checkliste der Vorlage aus. Bei sichtbaren Änderungen gehört ein Screenshot mit Demo-Daten dazu.

Mit deinem Beitrag stimmst du zu, dass er wie das übrige Projekt unter der [AGPL-3.0-or-later](LICENSE) steht.

---

## English summary

* Write in **German (preferred) or English**.
* Report bugs, ideas and translation errors with the [issue templates](https://github.com/NelsStorch/schichtplan_v2/issues/new/choose). Report security issues privately ([SECURITY.md](SECURITY.md)). Please discuss larger changes first.
* Setup: Node 26+, Docker, then `npm ci`, `npm run build --workspace=packages/i18n`, `npm run build --workspace=packages/shared`, `npm run dev:docker`, `npm run db:migrate`, `npm run db:seed`. Run `npm run check` before opening a PR, `npm run test:db` for integration tests.
* Rules: helper data must never be visible to unauthorised people; times only via `packages/shared/src/timezone.ts`; no secrets in the repo; no hard-coded UI strings (`packages/i18n`, German first); schema changes need a new Prisma migration; check all four brands.
* Commits follow Conventional Commits. Contributions are licensed under AGPL-3.0-or-later.
