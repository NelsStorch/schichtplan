import path from 'path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const rootPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));

function getGitRevision(): string {
  if (process.env.NEXT_PUBLIC_APP_REVISION) return process.env.NEXT_PUBLIC_APP_REVISION;
  if (process.env.APP_REVISION) return process.env.APP_REVISION;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

/**
 * Content-Security-Policy: nur eigene Skripte/Verbindungen, keine fremden Frames/Formulare. Next braucht
 * Inline-Skripte (Hydration, Theme-Skript); 'wasm-unsafe-eval' für den PDF-Export (react-pdf/yoga).
 * Bilder auch von https:, weil Logos/Banner fremde Adressen sein dürfen. Lokal zusätzlich eval + WebSocket (HMR).
 */
const isDev = process.env.NODE_ENV !== 'production';
// Optionale Web-Statistik (Umami, siehe UmamiScript): dessen Ursprung für Skript und Meldungen erlauben.
// Wird beim Build gelesen, darum ist UMAMI_SCRIPT_URL auch ein Build-Argument.
const umamiOrigin = (() => {
  try {
    return process.env.UMAMI_SCRIPT_URL ? ` ${new URL(process.env.UMAMI_SCRIPT_URL).origin}` : '';
  } catch {
    return '';
  }
})();
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}${umamiOrigin}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${umamiOrigin}${isDev ? ' ws: wss:' : ''}`,
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: rootPkg.version,
    NEXT_PUBLIC_APP_REVISION: getGitRevision(),
  },
  transpilePackages: ['@schichtplan/ui'],
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

// next-intl: Sprache und Texte pro Anfrage aus src/i18n/request.ts (ohne Sprach-Präfix in der URL)
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
