import { defineConfig } from 'vitest/config';

// Reine Logik (Sprachermittlung, Kataloge, Prüfungen), ohne Browser
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Wie der Server-Container (UTC): Ausgaben müssen explizit in Schweizer Zeit rechnen
    env: { TZ: 'UTC' },
  },
});
