# Mitmachen beim Schichtplan 🏕️

Schön, dass du helfen willst! Der Schichtplan ist ein Open-Source-Projekt (AGPL-3.0) für Cevi, Pfadi, Jubla und Vereine.

> **Du willst ihn nur nutzen?** Dafür brauchst du diesen Code nicht. Wähle den Auftritt deines Verbands, Anleitungen findest du im Hilfe-Center (Links in der [README](README.md)).

Bitte schreibe auf **Deutsch (bevorzugt) oder Englisch**. *English summary at the bottom.*

---

## Ohne Code mithelfen

| Du hast … | Dann … |
|---|---|
| einen **Fehler** gefunden | [🐞 Fehler melden](https://github.com/NelsStorch/schichtplan_v2/issues/new?template=fehler.yml) |
| eine **Idee** | [💡 Wunsch oder Idee](https://github.com/NelsStorch/schichtplan_v2/issues/new?template=wunsch.yml) |
| eine **falsche Übersetzung** entdeckt | [🌐 Sprachfehler melden](https://github.com/NelsStorch/schichtplan_v2/issues/new?template=sprachfehler.yml) oder gleich einen Pull Request (siehe [Übersetzungen](#übersetzungen)) |
| eine **Rolle oder Gruppe**, die aus Cevi.DB, MiData oder Jubla-DB falsch erkannt wird | [🧩 Gruppe oder Rolle anpassen](https://github.com/NelsStorch/schichtplan_v2/issues/new?template=rollen.yml) |
| eine **Frage** | die [Discussions](https://github.com/NelsStorch/schichtplan_v2/discussions) |
| eine **Sicherheitslücke** gefunden | **nicht öffentlich**, sondern wie in der [Sicherheitsrichtlinie](SECURITY.md) beschrieben |

Bitte keine Namen, E-Mail-Adressen oder anderen Personendaten von Helfenden in Texten oder Screenshots. Für Screenshots eignen sich die Demo-Daten aus `npm run db:seed`.

---

## Code beitragen

Bei neuen Funktionen oder grösseren Umbauten bitte zuerst ein Issue oder eine Discussion eröffnen, damit keine Arbeit verloren geht. Kleine Korrekturen kannst du direkt als Pull Request schicken. Einstiegspunkte sind die Labels [`good first issue`](https://github.com/NelsStorch/schichtplan_v2/labels/good%20first%20issue) und [`help wanted`](https://github.com/NelsStorch/schichtplan_v2/labels/help%20wanted).

### Setup

Voraussetzungen: Node.js ≥ 26 (siehe `.nvmrc`), npm ≥ 11 und Docker mit Docker Compose.

```bash
git clone https://github.com/NelsStorch/schichtplan_v2.git
cd schichtplan_v2
npm ci
npm run build --workspace=packages/shared
npm run dev:docker      # alle Dienste und die Datenbank
npm run db:migrate      # Migrationen anwenden
npm run db:seed         # Demo-Daten (nur lokal)
```

URLs der Dienste, Mandanten und Verbände lokal testen sowie Tests mit Datenbank stehen in der [README](README.md#-lokale-entwicklung). Den Aufbau erklären die Dokumente unter [`docs/public/`](docs/public/).

### Vor dem Pull Request

`npm run check` (Lint, Typecheck, Übersetzungsprüfung, Tests).

### Regeln, die man nicht erraten kann

* **Datenschutz:** Nicht-Admins sehen nur Personen der eigenen Abteilung oder des eigenen Anlasses (`departments.members_only` und die Rechte-Prüfungen im Backend beachten).
* **Zeiten** nur über `packages/shared/src/timezone.ts` (Europe/Zurich), die Container laufen in UTC.
* **Keine Geheimnisse** im Repo, auch nicht als Fallback. Beispielwerte gehören mit Platzhaltern in die `.env*.example`.
* **Keine fest eingebauten Texte** in Oberflächen oder API-Antworten, alles läuft über `packages/i18n`.
* **Schema-Änderung** heisst neue Prisma-Migration, bestehende bleiben unverändert.
* **Alle vier Auftritte** (Cevi, Pfadi, Jubla, Verein) prüfen, wenn Texte, Begriffe oder Aussehen betroffen sind.
* **Hilfe-Center** (`hilfe/`) anpassen, wenn sich Abläufe für Nutzende ändern.
* Deutsche Texte in **Schweizer Schreibweise** («ss» statt «ß»).

### Übersetzungen

Texte der App liegen in `packages/i18n/src/messages/<de|fr|it|en>/*.json`, das Hilfe-Center unter `hilfe/src/content/docs/` (`fr`, `it`, `en` in Unterordnern). Neue Texte zuerst auf Deutsch anlegen und wenn möglich in allen vier Sprachen ergänzen. Kannst du FR oder IT nicht, sag es im Pull Request. `npm run i18n:check` muss durchlaufen. Details in [`docs/public/i18n.md`](docs/public/i18n.md). Bei den Rechtstexten ist die deutsche Fassung massgebend.

### Commits und Pull Requests

Conventional Commits mit Bereich in Klammern, auf Deutsch oder Englisch:

```
feat(i18n): Sprachwähler als gestyltes Dropdown
fix(deps): bump @react-pdf/renderer to 4.9.2
```

Der Pull Request geht gegen `main`, bleibt bei einem Thema und füllt die Checkliste der Vorlage aus. Bei sichtbaren Änderungen gehört ein Screenshot mit Demo-Daten dazu.

Mit deinem Beitrag erklärst du dich einverstanden, dass er unter der [AGPL-3.0-or-later](LICENSE) steht wie das übrige Projekt.

---

## English summary

* Write in **German (preferred) or English**.
* Report bugs, ideas and translation errors with the [issue templates](https://github.com/NelsStorch/schichtplan_v2/issues/new/choose). Report security issues privately ([SECURITY.md](SECURITY.md)). Please discuss larger changes first.
* Setup: `npm ci`, `npm run dev:docker`, `npm run db:migrate`, `npm run db:seed` (Node ≥ 26, Docker; details in the [README](README.md#-lokale-entwicklung)). Run `npm run check` before opening a PR.
* Rules: no helper data visible to unauthorised people; times only via `packages/shared/src/timezone.ts`; no secrets; no hard-coded UI strings (`packages/i18n`, add German first, other languages if you can); schema changes need a Prisma migration; check all four brands.
* Commits: Conventional Commits, German or English. Contributions are licensed under AGPL-3.0-or-later.
