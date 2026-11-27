import { cn } from '../utils/cn';

export interface AppVersionProps {
  className?: string;
  /** Gibt an, ob der Git-Commit-Kurz-Hash mit angezeigt werden soll (Standard: true) */
  showCommit?: boolean;
}

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '3.1.1';
const REVISION = process.env.NEXT_PUBLIC_APP_REVISION || '';
const GITHUB_REPO_URL = 'https://github.com/NelsStorch/schichtplan';

export function AppVersion({ className, showCommit = true }: AppVersionProps) {
  const cleanSha = REVISION.replace(/-dirty-\d+$/, '').replace(/-dirty$/, '');
  const isGitSha = /^[0-9a-f]{7,40}$/i.test(cleanSha);
  const commitHref = isGitSha ? `${GITHUB_REPO_URL}/commit/${cleanSha}` : GITHUB_REPO_URL;

  const label = showCommit && cleanSha
    ? `v${VERSION} (${cleanSha})`
    : `v${VERSION}`;

  return (
    <a
      href={commitHref}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center font-mono text-2xs text-fg-subtle transition hover:text-fg',
        className
      )}
      title={`Version ${VERSION}${cleanSha ? ` (${cleanSha})` : ''} · Quellcode auf GitHub`}
      // Kein aria-label: Es müsste den sichtbaren Text «v3.1.0 (abc1234)» enthalten (WCAG 2.5.3),
      // der sichtbare Text ist als Name verständlich genug
    >
      {label}
    </a>
  );
}
