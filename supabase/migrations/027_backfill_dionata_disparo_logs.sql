-- Backfill disparo_logs for Dionata's dispatches via KanbanTab
-- Root cause: before commit 484965e (Jun 7 2026), KanbanTab did not call persistDisparo.
-- Dionata dispatched 74 leads via KanbanTab Jun 2-8 without recording in disparo_logs.
-- Source of truth: campaign_leads.last_sent_at / last_sent_by_id for campaign Porto Velas.

INSERT INTO public.disparo_logs (
  fired_at,
  broker_id,
  campaign_id,
  lead_id,
  lead_name,
  dispatch_type
)
SELECT
  cl.last_sent_at,
  '54fd0e07-124f-43e6-aded-e17589e9c9ff',   -- Dionata's broker_id
  '1780418828582-9fxwqgs',                   -- Porto Velas campaign_id
  cl.id,
  cl.name,
  'legacy'                                    -- retroactive records
FROM public.campaign_leads cl
WHERE cl.campaign_id = '1780418828582-9fxwqgs'
  AND cl.last_sent_at IS NOT NULL
  AND cl.last_sent_by_id = '54fd0e07-124f-43e6-aded-e17589e9c9ff'
  AND NOT EXISTS (
    SELECT 1 FROM public.disparo_logs dl
    WHERE dl.lead_id = cl.id
      AND dl.broker_id = '54fd0e07-124f-43e6-aded-e17589e9c9ff'
  );
