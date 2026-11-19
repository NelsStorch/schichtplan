import { describe, expect, it } from 'vitest';
import { isPageLoadRequest, pageLoadDim } from '@schichtplan/shared';
import { tenantHeaderAllowed } from '../src/plugins/tenant.js';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const doc = (extra: Record<string, string> = {}) =>
  new Headers({ 'user-agent': CHROME, 'sec-fetch-dest': 'document', accept: 'text/html', ...extra });

describe('Seitenaufrufe (Server)', () => {
  it('zählt nur echte Seitenladungen im Browser', () => {
    expect(isPageLoadRequest('GET', '/', doc())).toBe(true);
    expect(isPageLoadRequest('GET', '/events/chilbi', doc())).toBe(true);
    // ältere Browser ohne Sec-Fetch-Dest
    expect(isPageLoadRequest('GET', '/', new Headers({ 'user-agent': CHROME, accept: 'text/html' }))).toBe(true);

    expect(isPageLoadRequest('POST', '/', doc())).toBe(false);
    expect(isPageLoadRequest('GET', '/', doc({ rsc: '1' }))).toBe(false);
    expect(isPageLoadRequest('GET', '/', doc({ 'next-router-prefetch': '1' }))).toBe(false);
    expect(isPageLoadRequest('GET', '/', doc({ 'sec-purpose': 'prefetch;prerender' }))).toBe(false);
    expect(isPageLoadRequest('GET', '/', doc({ 'sec-fetch-dest': 'image' }))).toBe(false);
    expect(isPageLoadRequest('GET', '/logo.svg', doc())).toBe(false);
    expect(isPageLoadRequest('GET', '/api/health', doc())).toBe(false);
    expect(isPageLoadRequest('GET', '/', doc({ 'user-agent': 'Googlebot/2.1' }))).toBe(false);
    expect(isPageLoadRequest('GET', '/', doc({ 'user-agent': 'WhatsApp/2.23' }))).toBe(false);
    expect(isPageLoadRequest('GET', '/', doc({ 'user-agent': 'Uptime-Kuma/2.0' }))).toBe(false);
    expect(isPageLoadRequest('GET', '/', doc({ 'user-agent': '' }))).toBe(false);
  });

  it('unterteilt nach Verband der Domain und App', () => {
    expect(pageLoadDim('web', 'illnau.cevi-schichtplan.ch')).toBe('cevi_web');
    expect(pageLoadDim('landing', 'pfadi-schichtplan.ch')).toBe('pfadi_landing');
    expect(pageLoadDim('login', 'login.dev.jubla-schichtplan.ch')).toBe('jubla_login');
    expect(pageLoadDim('web', 'fc.vereins-schichtplan.ch')).toBe('verein_web');
  });

  it('nimmt Meldungen in Produktion nur intern an (nicht über Traefik)', () => {
    const prod = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    expect(tenantHeaderAllowed({}, prod)).toBe(true);
    expect(tenantHeaderAllowed({ 'x-forwarded-for': '1.2.3.4' }, prod)).toBe(false);
  });
});
