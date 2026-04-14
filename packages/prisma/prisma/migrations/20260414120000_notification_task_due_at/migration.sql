-- AlterTable
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "task_due_at" TIMESTAMPTZ(6);

-- Backfill: bestehende Task-Erinnerungen mit aktuellem due_at der Aufgabe (best effort)
UPDATE "notifications" AS n
SET "task_due_at" = t."due_at"
FROM "tasks" AS t
WHERE n."task_id" = t."id"
  AND n."type" IN ('task_due_now', 'task_due_soon')
  AND n."task_due_at" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_task_id_type_task_due_at_idx" ON "notifications" ("task_id", "type", "task_due_at");
