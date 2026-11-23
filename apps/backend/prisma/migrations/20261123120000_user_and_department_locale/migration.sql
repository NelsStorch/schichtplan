-- Mehrsprachigkeit: Sprache der Person (null = automatisch) und Standardsprache der Abteilung
CREATE TYPE "Locale" AS ENUM ('DE', 'FR', 'IT', 'EN');
ALTER TABLE "users" ADD COLUMN "locale" "Locale";
ALTER TABLE "departments" ADD COLUMN "default_locale" "Locale" NOT NULL DEFAULT 'DE';
