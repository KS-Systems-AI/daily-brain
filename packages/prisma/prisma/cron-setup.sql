-- pg_cron + pg_net: Task reminder notifications via Supabase Edge Function
-- ALREADY EXECUTED - this file serves as documentation.
-- The cron job runs every minute and calls the send-reminders Edge Function.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule: every minute, call the Edge Function
SELECT cron.schedule(
  'send-task-reminders',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jdgolotkssanvzwflxej.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZ29sb3Rrc3NhbnZ6d2ZseGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTYxNDYsImV4cCI6MjA5MTM5MjE0Nn0._Vv8MK5dWezQ2s5TO1bGi3_4j9uK4fQJW3l9RDzgAO8"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
