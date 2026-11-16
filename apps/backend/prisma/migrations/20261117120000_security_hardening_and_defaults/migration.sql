-- Passwortlose Spitznamen-Anmeldung für neue Abteilungen standardmässig deaktivieren
-- und Hinweis-Flag für verworfene Kalender-Tokens nach dem Zusammenführen von Spitznamen-Profilen ergänzen.
ALTER TABLE "departments" ALTER COLUMN "allow_passwordless" SET DEFAULT false;
ALTER TABLE "users" ADD COLUMN "calendar_reset_notice" BOOLEAN NOT NULL DEFAULT false;
