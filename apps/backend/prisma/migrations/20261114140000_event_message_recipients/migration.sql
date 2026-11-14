-- Empfänger*innen einer OK-Nachricht merken, damit der Verlauf pro Person zeigt, wer schon angeschrieben wurde
-- Zero-Downtime: nur additive Spalte mit Default
ALTER TABLE "event_messages" ADD COLUMN "recipient_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
