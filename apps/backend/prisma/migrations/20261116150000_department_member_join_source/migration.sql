-- Herkunft eines Beitritts: CEVIDB = aus den Rollen der Verbands-DB (Login trägt ein und nimmt wieder weg)
-- Zero-Downtime: nur additive, nullable Spalte
ALTER TABLE "department_members" ADD COLUMN "join_source" TEXT;
