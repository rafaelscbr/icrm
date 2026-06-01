-- ── 1. campaign_leads: rastreabilidade e delegação ──────────────────────────
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS last_sent_by_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_sent_by_name text,
  ADD COLUMN IF NOT EXISTS last_sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_name  text;

-- ── 2. campaign_participants ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_participants (
  id           text        PRIMARY KEY,
  campaign_id  text        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  broker_id    uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'collaborator',
  added_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, broker_id)
);
ALTER TABLE public.campaign_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants_policy" ON public.campaign_participants
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- ── 3. campaign_activity_log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_activity_log (
  id           text        PRIMARY KEY,
  campaign_id  text        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id      text        REFERENCES public.campaign_leads(id)     ON DELETE SET NULL,
  lead_name    text,
  broker_id    uuid        REFERENCES auth.users(id)                ON DELETE SET NULL,
  broker_name  text,
  action_type  text        NOT NULL,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_select" ON public.campaign_activity_log
  FOR SELECT USING (broker_id = auth.uid() OR public.is_admin());
CREATE POLICY "activity_log_insert" ON public.campaign_activity_log
  FOR INSERT WITH CHECK (broker_id = auth.uid() OR public.is_admin());

CREATE INDEX IF NOT EXISTS activity_log_campaign_idx
  ON public.campaign_activity_log (campaign_id, created_at DESC);

-- ── 4. Realtime ──────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_participants;
