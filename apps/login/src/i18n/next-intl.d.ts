// Typsichere Schlüssel für useTranslations/getTranslations: Struktur aus den deutschen Katalogen
import type { Messages } from '@schichtplan/i18n';

declare module 'next-intl' {
  interface AppConfig {
    Messages: Messages;
  }
}
