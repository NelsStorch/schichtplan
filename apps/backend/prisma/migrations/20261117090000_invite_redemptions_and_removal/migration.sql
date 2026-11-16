-- Persönliche Einladungen mit Rechten nur einmal einlösbar, «von der Leitung entfernt» sperrt ältere Einladungen,
-- Herkunft einer bestätigten Heimabteilung (Einladung oder Verbands-DB).
-- Zero-Downtime: nur additive Spalten und eine neue Tabelle
ALTER TABLE "department_members" ADD COLUMN "removed_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "home_department_confirm_source" TEXT;

CREATE TABLE "department_invite_redemptions" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_invite_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "department_invite_redemptions_token_hash_key" ON "department_invite_redemptions"("token_hash");
CREATE INDEX "department_invite_redemptions_department_id_idx" ON "department_invite_redemptions"("department_id");

ALTER TABLE "department_invite_redemptions" ADD CONSTRAINT "department_invite_redemptions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_invite_redemptions" ADD CONSTRAINT "department_invite_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
