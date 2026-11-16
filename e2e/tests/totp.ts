import crypto from 'node:crypto';

/**
 * Authenticator-App für die Tests: TOTP nach RFC 6238 (SHA-1, 30 s, 6 Stellen), wie services/twoFactor.ts.
 * Das Backend nimmt den Zeitschritt davor und danach an, aber nie einen Schritt zweimal.
 */
const PERIOD = 30;

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) throw new Error(`Ungültiges Base32-Zeichen: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function currentStep(): number {
  return Math.floor(Date.now() / 1000 / PERIOD);
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

/**
 * Nächster gültiger Code nach `lastStep`: der aktuelle Schritt oder, falls schon verbraucht, der nächste
 * (liegt noch im Fenster). Wartet nur, wenn auch der schon verbraucht ist.
 */
export async function nextCode(secret: string, lastStep: number | null): Promise<{ code: string; step: number }> {
  for (;;) {
    const now = currentStep();
    const step = lastStep === null || lastStep < now ? now : lastStep + 1;
    if (step <= now + 1) return { code: totpCode(secret, step), step };
    await new Promise((r) => setTimeout(r, 1000));
  }
}
