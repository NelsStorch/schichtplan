// Client-Teil der Mehrsprachigkeit (Server-Teil: '@schichtplan/ui/i18n/server').
// Eigener Unterpfad, damit Apps ohne next-intl (Landing bis Schritt 9) ihn nicht laden.
export {
  LocaleSettingsProvider,
  LocaleSwitcher,
  useAppLocale,
  useIntlLocale,
  useLocaleSettings,
  useProfileLocaleSync,
  writeLocaleCookie,
  type LocaleSwitcherProps,
} from './LocaleSwitcher';
export { LocaleMenu, type LocaleMenuOption, type LocaleMenuProps } from './LocaleMenu';
