-- Adiciona coluna dispatch_type em disparo_logs para separar disparos novos de follow-ups.
-- Registros existentes recebem 'legacy' como valor padrão.

ALTER TABLE public.disparo_logs
  ADD COLUMN IF NOT EXISTS dispatch_type TEXT NOT NULL DEFAULT 'legacy'
  CHECK (dispatch_type IN ('new', 'followup', 'legacy'));

-- Índice para queries filtradas por corretor + tipo + data (usadas pelos contadores)
CREATE INDEX IF NOT EXISTS idx_disparo_logs_broker_type_fired
  ON public.disparo_logs (broker_id, dispatch_type, fired_at DESC);
