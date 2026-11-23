import { getOrganization } from '@schichtplan/shared';
import { type OgSubpage, getRequestOrigin, ogSubpageMetadata } from '@schichtplan/ui/og';
import { getLocale, getTranslations } from 'next-intl/server';

type Org = ReturnType<typeof getOrganization>;
type MetaT = Awaited<ReturnType<typeof getTranslations<'login.meta'>>>;

/** Unterseiten des Logins mit eigener Link-Vorschau. Schlüssel = Pfad ohne Schrägstrich, Texte: `login.meta.<Schlüssel>` */
export const LOGIN_PAGE_KEYS = [
  'abteilung',
  'abteilung-erstellen',
  'konto-verknuepfen',
  'verify-email',
  'passwort-vergessen',
  'passwort-zuruecksetzen',
  'zwei-faktor',
] as const;

export type LoginPageKey = (typeof LOGIN_PAGE_KEYS)[number];

const isLoginPageKey = (key: string): key is LoginPageKey => (LOGIN_PAGE_KEYS as readonly string[]).includes(key);

/** Katalogschlüssel ohne Bindestrich (abteilung-erstellen → abteilung_erstellen) */
type CatalogKey<K extends string> = K extends `${infer A}-${infer B}` ? `${A}_${CatalogKey<B>}` : K;
const catalogKey = (key: LoginPageKey) => key.replace(/-/g, '_') as CatalogKey<LoginPageKey>;

function pageTexts(key: LoginPageKey, org: Org, t: MetaT): OgSubpage {
  const id = catalogKey(key);
  const values = {
    org: org.slug,
    unit: org.unitTerm,
    name: org.name,
    orgName: org.orgName,
    authShort: org.authProviderShort,
  };
  return {
    title: t(`${id}.title`, values),
    description: t(`${id}.description`, values),
    subtitle: t(`${id}.subtitle`, values),
  };
}

/** Texte einer Unterseite in der Sprache der Anfrage (Verbandsbegriffe ebenfalls übersetzt) */
export async function loginPage(key: string | null | undefined, host: string): Promise<OgSubpage | null> {
  if (!key || !isLoginPageKey(key)) return null;
  const [t, locale] = await Promise.all([getTranslations('login.meta'), getLocale()]);
  return pageTexts(key, getOrganization(host, locale), t);
}

/** Metadaten samt eigenem Vorschaubild für eine Login-Unterseite */
export async function loginPageMetadata(key: LoginPageKey) {
  const { host } = await getRequestOrigin();
  const page = await loginPage(key, host);
  return ogSubpageMetadata(key, `/${key}`, page as OgSubpage);
}
