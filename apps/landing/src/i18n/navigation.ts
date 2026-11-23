import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Sprachbewusste Navigation (lokalisierte Pfade wie /fr/protection-des-donnees) für Komponenten */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
