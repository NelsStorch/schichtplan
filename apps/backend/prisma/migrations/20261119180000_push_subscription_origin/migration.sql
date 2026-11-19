-- Push-Abo gehört zum Service Worker einer bestimmten Adresse: Hostname mitspeichern
ALTER TABLE "push_subscriptions" ADD COLUMN "origin" TEXT;
