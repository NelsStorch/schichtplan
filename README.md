# Schichtplan · Cevi · Pfadi · Jubla · Vereine 🏕️

[![CI](https://github.com/NelsStorch/schichtplan/actions/workflows/ci.yml/badge.svg)](https://github.com/NelsStorch/schichtplan/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D26-brightgreen.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-black.svg)](https://fastify.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-blue.svg)](https://www.postgresql.org/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)

Der Schichtplan hilft Jugendverbänden und Vereinen in der Schweiz, Helfende für ihre Anlässe einzuteilen: von der Chilbi über das Sommerlager bis zum Dorffest. Eine Codebasis bedient vier Auftritte, jeder mit eigener Domain, eigenem Erscheinungsbild und eigenem Login:

| Auftritt | Für | Login | Hilfe-Center |
|---|---|---|---|
| [cevi-schichtplan.ch](https://cevi-schichtplan.ch/) | Cevi-Abteilungen | Cevi.DB | [hilfe.cevi-schichtplan.ch](https://hilfe.cevi-schichtplan.ch/) |
| [pfadi-schichtplan.ch](https://pfadi-schichtplan.ch/) | Pfadi-Abteilungen | PBS MiData | [hilfe.pfadi-schichtplan.ch](https://hilfe.pfadi-schichtplan.ch/) |
| [jubla-schichtplan.ch](https://jubla-schichtplan.ch/) | Jubla-Scharen | Jubla-DB | [hilfe.jubla-schichtplan.ch](https://hilfe.jubla-schichtplan.ch/) |
| [vereins-schichtplan.ch](https://vereins-schichtplan.ch/) | Vereine und Festkomitees | E-Mail und Passwort | [hilfe.vereins-schichtplan.ch](https://hilfe.vereins-schichtplan.ch/) |

Helfende ohne Verbandskonto tragen sich überall mit E-Mail und Passwort oder als Gast ein.

> [!NOTE]
> **Du willst den Schichtplan nur nutzen?** Dafür brauchst du diesen Code nicht. Wähle oben den Auftritt deines Verbands, Anleitungen findest du im Hilfe-Center. Dieses Repository ist für alle, die mitentwickeln oder den Aufbau verstehen wollen.

<sub>Unabhängiges Projekt: Pfadi Schichtplan wird nicht von der Pfadibewegung Schweiz (PBS) betrieben oder herausgegeben.</sub>

![Schichtplan eines Anlasses aus Sicht von Helfenden](docs/screenshots/anlass.webp)

<table>
  <tr>
    <td width="68%"><img src="docs/screenshots/ok-schichten.webp" alt="OK-Bereich: Schichten planen und Personen einteilen"></td>
    <td width="32%"><img src="docs/screenshots/mobil-meine-schichten.webp" alt="Meine Schichten auf dem Handy mit Kalender-Abo"></td>
  </tr>
  <tr>
    <td align="center"><sub>OK-Bereich: Schichten planen und einteilen</sub></td>
    <td align="center"><sub>«Meine Schichten» auf dem Handy</sub></td>
  </tr>
</table>

<sub>Screenshots mit Demo-Daten.</sub>

---

## Funktionen

**Für Abteilungen und Vereine**
* Eigene Subdomain pro Abteilung, Schar oder Verein (z. B. `<abteilung>.cevi-schichtplan.ch`) mit Logo, Farben und Stufen.
* Beliebig viele Anlässe parallel.
* Anmeldung über die Verbandsdatenbank (Hitobito): Namen, Geburtsdatum und Stufen werden übernommen, Abteilungs- und Scharleitungen erhalten ihre Rechte automatisch.

**Für das OK**
* Katalog an Aufgaben und Einsatzbereichen mit Jugendschutz-Regeln (Mindestalter, J+S-Leitung).
* Seriengenerator für wiederkehrende Schichten, Soll-Roster zur Kontrolle der Abdeckung.
* Fein abgestufte Rechte für OK-Mitglieder, Leitungen und Vorstände.
* Nachrichten an Helfende per E-Mail, Export als PDF, CSV und Excel.
* Anwesenheitsliste mit QR-Check-in, Verpflegungs- und Getränkebons.

**Für Helfende**
* Eintragen mit einem Klick oder als Gast.
* «Ersatz gesucht»: Wer verhindert ist, schreibt die Schicht aus und bleibt eingetragen, bis jemand übernimmt.
* Kalender-Abo, Erinnerungen per E-Mail und Push.
* Installierbar als App, Schichtdetails sind auch offline verfügbar.

**Datenschutz und Sprachen**
* Keine Wohnadressen, einstellbare Löschfristen für Zusatzfragen, Anlässe auf Wunsch nur für Mitglieder sichtbar.
* Alles auf Deutsch, Französisch, Italienisch und Englisch: Oberfläche, E-Mails, PDFs und Hilfe-Center.

---

## Aufbau

Ein Monorepo mit fünf Diensten, einem statischen Hilfe-Center und gemeinsamen Paketen. Alle Dienste nutzen dasselbe Backend und dieselbe Datenbank. Welcher Verband gilt, ergibt sich aus der Domain.

```
                 Traefik (Reverse Proxy)
                           │
   ┌──────────┬────────────┼───────────┬──────────┐
   ▼          ▼            ▼           ▼          ▼
landing      web         login       admin      hilfe
(Startseite) (Abteilung) (SSO)       (Portal)   (Starlight)
   └──────────┴─────┬──────┴───────────┘
                    ▼ /api/*
               backend (Fastify, Prisma)
                    ▼
               PostgreSQL 17
```

| Adresse | Dienst | Zweck |
|---|---|---|
| `<verband>` | `apps/landing` | Öffentliche Startseite |
| `login.<verband>` | `apps/login` | Anmeldung für alle Verbände |
| `<abteilung>.<verband>` | `apps/web` | Anlässe, Schichten und OK-Bereich |
| `admin.cevi-schichtplan.ch` | `apps/admin` | Verwaltung für globale Admins |
| `*/api/*` | `apps/backend` | REST-API und Kalender-Feeds |
| `hilfe.<verband>` | `hilfe/` | Hilfe-Center |

`<verband>` steht für eine der vier Domains. Die Verbände sind in `packages/shared/src/organizations.ts` konfiguriert.

```
apps/        admin, backend, landing, login, web
packages/    i18n (Übersetzungen), shared (Typen, Schemas, Verbände), ui (Design-System)
hilfe/       Hilfe-Center (Astro Starlight)
docs/public/ Dokumentation für Entwickler:innen
e2e/         End-to-End-Tests (Playwright)
```

---

## Mitmachen

Fehler melden, Ideen einbringen, Übersetzungen verbessern oder Code beitragen: Wie das geht und wie du das Projekt lokal startest, steht in [CONTRIBUTING.md](CONTRIBUTING.md). Wie Anmeldung, Rechte, Datenmodell und Mehrsprachigkeit funktionieren, erklären die Dokumente unter [`docs/public/`](docs/public/README.md).

Bitte schreibe auf Deutsch (bevorzugt) oder Englisch.

> **FR:** Une erreur de traduction ? Signalez-la via le [formulaire « Sprachfehler melden »](https://github.com/NelsStorch/schichtplan/issues/new?template=sprachfehler.yml), en allemand ou en anglais.<br>
> **IT:** Un errore di traduzione? Segnalalo con il [modulo «Sprachfehler melden»](https://github.com/NelsStorch/schichtplan/issues/new?template=sprachfehler.yml), in tedesco o in inglese.<br>
> **EN:** Found a translation error? Report it via the [“Sprachfehler melden” form](https://github.com/NelsStorch/schichtplan/issues/new?template=sprachfehler.yml), in German or English.

---

## Selbst betreiben

Für eine eigene Installation reichen `docker-compose.yml` und eine `.env` nach der Vorlage `.env.prod.example`. Vorausgesetzt werden:

* ein laufender Traefik v3 mit externem Proxy-Netzwerk und Zertifikats-Resolver (siehe Labels in `docker-compose.yml`),
* pro Domain ein DNS-Eintrag für die Domain selbst und ein Wildcard-Eintrag für die Subdomains,
* OAuth-Zugangsdaten der jeweiligen Verbandsdatenbank und ein SMTP-Server.

Alle Variablen sind in `.env.prod.example` beschrieben. Die Skripte `deploy.ps1`, `rollback.ps1` und `restore.ps1` sind auf den Betrieb der vier offiziellen Domains zugeschnitten und für eigene Installationen nicht nötig.

---

## Sicherheit

Sicherheitslücken bitte vertraulich melden, wie in [SECURITY.md](SECURITY.md) beschrieben, und nicht als öffentliches Issue.

## Lizenz

[GNU Affero General Public License v3](LICENSE). Wer den Schichtplan verändert und als Dienst im Netz betreibt, muss den Quellcode ebenfalls offenlegen.
