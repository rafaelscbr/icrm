-- ─── Migration 029: pg_cron — recaptura de leads com SLA vencido ──────────────
-- Roda recapture_overdue_leads() a cada minuto. A função usa FOR UPDATE SKIP
-- LOCKED, então execuções concorrentes não conflitam.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('recapture-leads-sla')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recapture-leads-sla');

SELECT cron.schedule(
  'recapture-leads-sla',
  '* * * * *',
  $$SELECT public.recapture_overdue_leads()$$
);
