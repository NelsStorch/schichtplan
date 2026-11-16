import { spawnSync } from 'node:child_process';

/**
 * Mails der lokalen Umgebung: Ohne SMTP_PASSWORD verschickt das Backend nichts, sondern schreibt jede Mail
 * ins Container-Log (services/email.ts, «[Mail-Dev / Mock]»). Die Tests lesen Links daraus.
 */
const BACKEND_CONTAINER = process.env.E2E_BACKEND_CONTAINER || 'schichtplan-dev-backend';

/** Zeitpunkt für `docker logs --since`, vor der Aktion festhalten, die eine Mail auslöst */
export function mailMark(): string {
  return new Date(Date.now() - 1000).toISOString();
}

function backendLog(since: string): string {
  const res = spawnSync('docker', ['logs', '--since', since, BACKEND_CONTAINER], { encoding: 'utf8' });
  if (res.error) throw new Error(`docker logs ging nicht (${res.error.message}). Läuft npm run dev:docker?`);
  return `${res.stdout}\n${res.stderr}`;
}

/**
 * Wartet auf die Mail an `to` und gibt den ersten Link zurück, dessen Pfad `path` enthält
 * (z. B. «/verify-email» oder «/passwort-zuruecksetzen»).
 */
export async function waitForMailLink(to: string, path: string, since: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const escaped = to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(String.raw`Empfänger:\s+${escaped}[\s\S]*?Text:\s+([^\n]*)`, 'g');
  while (Date.now() < deadline) {
    const log = backendLog(since);
    const texts = [...log.matchAll(block)].map((m) => m[1]);
    for (const text of texts.reverse()) {
      const link = text.match(/https?:\/\/\S+/g)?.find((url) => new URL(url).pathname.includes(path));
      if (link) {
        // Nie einen Link auf eine echte Domain öffnen: lokale Mails müssen auf localhost zeigen
        const host = new URL(link).hostname;
        if (host !== 'localhost' && !host.endsWith('.localhost')) {
          throw new Error(`Mail-Link zeigt nicht auf localhost, sondern auf ${host}: ${link.split('?')[0]}`);
        }
        return link;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Keine Mail mit Link «${path}» an ${to} im Backend-Log (seit ${since})`);
}
