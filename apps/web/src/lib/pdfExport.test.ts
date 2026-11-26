import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DepartmentStatsResponseDto } from '@schichtplan/shared';
import { renderDepartmentStatsPdf } from '@/components/DepartmentStatsPdf';

const here = dirname(fileURLToPath(import.meta.url));
const requireFromWeb = createRequire(join(here, '../../package.json'));

/** Ordner, in dem Node `target` aus Sicht von `fromPackage` findet (wie die Modulsuche: nach oben wandern) */
function packageDirSeenFrom(fromPackage: string, target: string) {
  let dir = dirname(requireFromWeb.resolve(`${fromPackage}/package.json`));
  for (;;) {
    const candidate = join(dir, 'node_modules', target);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`${target} nicht gefunden (von ${fromPackage} aus)`);
    dir = parent;
  }
}

describe('PDF-Export: Abhängigkeiten', () => {
  // Regression: Mit zwei getrennten pdfkit-Kopien (z. B. weil das Backend eine andere Version
  // braucht) registriert @react-pdf/font die Standardschriften in der falschen Kopie. Im Browser
  // scheitert dann jedes PDF mit «Standard font "Helvetica" is not registered».
  it('@react-pdf/renderer und @react-pdf/font teilen sich genau eine pdfkit-Kopie', () => {
    const fromRenderer = packageDirSeenFrom('@react-pdf/renderer', 'pdfkit');
    const fromFont = packageDirSeenFrom('@react-pdf/font', 'pdfkit');
    expect(fromRenderer).toBe(fromFont);
  });
});

describe('PDF-Export: Statistik-PDF', () => {
  const data: DepartmentStatsResponseDto = {
    year: 2026,
    availableYears: [2026, 2025],
    filter: { countAttendedOnly: false, includeSetupTeardown: true },
    summary: {
      totalHours: 42.5,
      totalMinutes: 2550,
      formattedTime: '42 h 30 min',
      totalHelpers: 3,
      totalShifts: 12,
      totalEvents: 1,
      totalRequiredSlots: 14,
      totalFilledSlots: 12,
      fillRatePct: 86,
      attendedHours: 40,
      attendedRatePct: 94,
      setupHours: 5,
      eventHours: 37.5,
      averageHoursPerHelper: 14.2,
    },
    events: [
      {
        id: 'ev-1',
        title: 'Sommerfest',
        slug: 'sommerfest',
        startDate: '2026-06-20T08:00:00Z',
        endDate: '2026-06-21T18:00:00Z',
        isPublished: true,
        helpersCount: 3,
        totalShifts: 12,
        totalSlots: 14,
        filledSlots: 12,
        fillRatePct: 86,
        totalHours: 42.5,
        totalMinutes: 2550,
        attendedHours: 40,
        attendedRatePct: 94,
        setupHours: 5,
        eventHours: 37.5,
      },
    ],
    stufen: [{ id: 's-1', name: 'Pfadi', helpersCount: 3, totalHours: 42.5, totalMinutes: 2550, totalShifts: 12, percentageOfTotal: 100 }],
    topHelpers: ['Fuchs', 'Bär', 'Luchs'].map((ceviName, i) => ({
      userId: `u-${i}`,
      displayName: ceviName,
      firstName: 'Anna',
      lastName: 'Muster',
      ceviName,
      hours: 20 - i * 5,
      minutes: (20 - i * 5) * 60,
      formattedTime: `${20 - i * 5} h`,
      shiftCount: 6 - i,
      eventCount: 1,
      attendedShiftCount: 6 - i,
      stufen: ['Pfadi'],
      isGuest: false,
    })),
  };

  it.each(['de', 'fr-CH', 'it', 'en'])('erzeugt ein gültiges PDF (%s)', async (locale) => {
    const fontBase = join(here, '../../public/fonts/pdf');
    expect(readFileSync(join(fontBase, 'Geist-Regular.ttf')).length).toBeGreaterThan(0);

    const blob = await renderDepartmentStatsPdf(data, null, { locale, nicknameTerm: 'Cevi-Name' }, fontBase);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe('application/pdf');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
  }, 30000);
});
