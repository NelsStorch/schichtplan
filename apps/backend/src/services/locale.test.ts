import { describe, expect, it } from 'vitest';
import { LOCALES, fromDbLocale, toDbLocale } from '@schichtplan/i18n';
import {
  SUPPORTED_LOCALES,
  UpdateDepartmentSchema,
  UpdateProfileSchema,
  localeFromDb,
  localeToDb,
} from '@schichtplan/shared';
import { Locale } from '../generated/prisma/client.js';

describe('Sprachen: shared, i18n und Datenbank stimmen überein', () => {
  it('gleiche Liste in @schichtplan/shared und @schichtplan/i18n', () => {
    expect([...SUPPORTED_LOCALES]).toEqual([...LOCALES]);
  });

  it('jede Sprache hat einen Wert im Prisma-Enum Locale', () => {
    expect(Object.values(Locale).sort()).toEqual(SUPPORTED_LOCALES.map(localeToDb).sort());
  });

  it('Umwandlung in beide Richtungen wie in i18n', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(localeToDb(locale)).toBe(toDbLocale(locale));
      expect(localeFromDb(localeToDb(locale))).toBe(locale);
      expect(fromDbLocale(localeToDb(locale))).toBe(locale);
    }
    expect(localeFromDb(null)).toBeNull();
    expect(localeFromDb('RM')).toBeNull();
  });
});

describe('Eingaben', () => {
  it('Profil: Sprache wählen, zurücksetzen, Ungültiges ablehnen', () => {
    expect(UpdateProfileSchema.parse({ locale: 'fr' }).locale).toBe('fr');
    expect(UpdateProfileSchema.parse({ locale: null }).locale).toBeNull();
    expect(UpdateProfileSchema.parse({}).locale).toBeUndefined();
    expect(UpdateProfileSchema.safeParse({ locale: 'FR' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ locale: 'rm' }).success).toBe(false);
  });

  it('Abteilung: Standardsprache nur aus der Liste, nicht leer', () => {
    expect(UpdateDepartmentSchema.parse({ defaultLocale: 'it' }).defaultLocale).toBe('it');
    expect(UpdateDepartmentSchema.safeParse({ defaultLocale: null }).success).toBe(false);
    expect(UpdateDepartmentSchema.safeParse({ defaultLocale: 'xx' }).success).toBe(false);
  });
});
