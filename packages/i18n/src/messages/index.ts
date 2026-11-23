/**
 * Übersetzungskataloge, eine JSON-Datei pro Sprache und Namespace (`<sprache>/<namespace>.json`).
 * Neuer Namespace: Datei in `de/` anlegen, hier importieren und in `NAMESPACES` und `CATALOGS` eintragen
 * (`npm run i18n:check` meldet vergessene Dateien). Andere Sprachen dürfen unvollständig sein: Fehlendes
 * erscheint auf Deutsch.
 */
import deCommon from './de/common.json' with { type: 'json' };
import deApi from './de/api.json' with { type: 'json' };
import enCommon from './en/common.json' with { type: 'json' };
import enApi from './en/api.json' with { type: 'json' };
import frCommon from './fr/common.json' with { type: 'json' };
import frApi from './fr/api.json' with { type: 'json' };
import itCommon from './it/common.json' with { type: 'json' };
import itApi from './it/api.json' with { type: 'json' };
import deUi from './de/ui.json' with { type: 'json' };
import enUi from './en/ui.json' with { type: 'json' };
import frUi from './fr/ui.json' with { type: 'json' };
import itUi from './it/ui.json' with { type: 'json' };
import deLogin from './de/login.json' with { type: 'json' };
import enLogin from './en/login.json' with { type: 'json' };
import frLogin from './fr/login.json' with { type: 'json' };
import itLogin from './it/login.json' with { type: 'json' };
import deWeb from './de/web.json' with { type: 'json' };
import enWeb from './en/web.json' with { type: 'json' };
import frWeb from './fr/web.json' with { type: 'json' };
import itWeb from './it/web.json' with { type: 'json' };
import type { Locale } from '../config.js';

/**
 * - `common`: gemeinsame Texte aller Apps (Sprachwahl, Fusszeilen, Aktionen)
 * - `ui`: Komponenten aus @schichtplan/ui (Dialoge, Profil, Benachrichtigungen, Fehlerseiten)
 * - `api`: Meldungen der API (Backend: Fehler über `reply.fail`, Erfolgsmeldungen unter `success.*`)
 * - `login`: Texte des Login-Portals
 * - `web`: Texte der Web-App (Schichtplan, Helfer-Flows, OK-Bereich)
 */
export const NAMESPACES = ['common', 'ui', 'api', 'login', 'web'] as const;
export type Namespace = (typeof NAMESPACES)[number];

/** Struktur aller Texte, abgeleitet aus der deutschen Quelle */
export interface Messages {
  common: typeof deCommon;
  ui: typeof deUi;
  api: typeof deApi;
  login: typeof deLogin;
  web: typeof deWeb;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Rohkataloge ohne Fallback; `de` ist vollständig, die anderen Sprachen dürfen Lücken haben */
export const CATALOGS: { de: Messages } & Record<Exclude<Locale, 'de'>, DeepPartial<Messages>> = {
  de: { common: deCommon, ui: deUi, api: deApi, login: deLogin, web: deWeb },
  fr: { common: frCommon, ui: frUi, api: frApi, login: frLogin, web: frWeb },
  it: { common: itCommon, ui: itUi, api: itApi, login: itLogin, web: itWeb },
  en: { common: enCommon, ui: enUi, api: enApi, login: enLogin, web: enWeb },
};
