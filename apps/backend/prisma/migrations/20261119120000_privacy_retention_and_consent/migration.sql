-- Datenschutz: Löschung inaktiver Konten, sensible Fragen mit Einwilligung, Zustimmung zu den Nutzungsbedingungen
ALTER TABLE "users" ADD COLUMN "inactivity_warned_at" TIMESTAMP(3);
ALTER TABLE "event_questions" ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_answers" ADD COLUMN "consent_at" TIMESTAMP(3);
ALTER TABLE "shift_signup_answers" ADD COLUMN "consent_at" TIMESTAMP(3);
ALTER TABLE "departments" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "departments" ADD COLUMN "terms_version" TEXT;
