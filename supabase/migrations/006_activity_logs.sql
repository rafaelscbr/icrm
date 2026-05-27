-- ─── Migration 006: Logs de Atividade ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id  uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  action     text        NOT NULL,
  details    jsonb,
  page       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_broker_id_idx ON public.activity_logs (broker_id);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs (created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;

-- Corretor lê só os próprios; admin lê tudo
CREATE POLICY "activity_logs_select" ON public.activity_logs
  FOR SELECT USING (broker_id = auth.uid() OR public.is_admin());

-- Qualquer usuário autenticado insere (próprio broker_id é injetado pelo app)
CREATE POLICY "activity_logs_insert" ON public.activity_logs
  FOR INSERT WITH CHECK (broker_id = auth.uid());
