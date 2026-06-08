-- ── Migration 023: Índices de performance por broker_id ──────────────────────
--
-- Problema: todas as queries fazem full table scan porque o PostgreSQL aplica
-- o filtro RLS (broker_id = auth.uid()) sem índice disponível. Com esses
-- índices o planner usa Index Scan diretamente nas linhas do corretor.
--
-- Risco: ZERO — CREATE INDEX IF NOT EXISTS é não-destrutivo e executa sem
-- bloquear leituras/escritas (Supabase usa PostgreSQL 17 com CONCURRENTLY).
-- ─────────────────────────────────────────────────────────────────────────────

-- leads: tabela central — filtrada por broker em TODA navegação
CREATE INDEX IF NOT EXISTS idx_leads_broker_id
  ON public.leads (broker_id);

-- Composto: broker + funnel_stage para alertas do dashboard (leads sem contato)
CREATE INDEX IF NOT EXISTS idx_leads_broker_funnel
  ON public.leads (broker_id, funnel_stage);

-- tasks: filtradas por broker + status + due_date no dashboard e página de tarefas
CREATE INDEX IF NOT EXISTS idx_tasks_broker_id
  ON public.tasks (broker_id);

CREATE INDEX IF NOT EXISTS idx_tasks_broker_status_due
  ON public.tasks (broker_id, status, due_date);

-- sales: filtradas por broker + data nas queries de KPI e comissões
CREATE INDEX IF NOT EXISTS idx_sales_broker_id
  ON public.sales (broker_id);

CREATE INDEX IF NOT EXISTS idx_sales_broker_date
  ON public.sales (broker_id, date DESC);

-- goals: pequena mas consultada por broker
CREATE INDEX IF NOT EXISTS idx_goals_broker_id
  ON public.goals (broker_id);

-- daily_logs: consultada por broker + data em daily_logs store
CREATE INDEX IF NOT EXISTS idx_daily_logs_broker_id
  ON public.daily_logs (broker_id);

-- campaigns: filtradas por broker e status
CREATE INDEX IF NOT EXISTS idx_campaigns_broker_id
  ON public.campaigns (broker_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_broker_status
  ON public.campaigns (broker_id, status);

-- campaign_leads: tabela grande — o índice composto cobre o caso mais comum
CREATE INDEX IF NOT EXISTS idx_campaign_leads_broker_id
  ON public.campaign_leads (broker_id);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_broker_campaign
  ON public.campaign_leads (broker_id, campaign_id);

-- lead_interactions: pode crescer bastante; filtrada por broker e por lead_id
CREATE INDEX IF NOT EXISTS idx_lead_interactions_broker_id
  ON public.lead_interactions (broker_id);

CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id
  ON public.lead_interactions (lead_id);

-- disparo_logs: 5 queries paralelas em todo load() do useDisparosStore
-- Sem esses índices cada load() faz 5 full scans — o impacto mais visível.
CREATE INDEX IF NOT EXISTS idx_disparo_logs_broker_id
  ON public.disparo_logs (broker_id);

-- Composto broker_id + fired_at DESC cobre as 4 range queries (dia, semana, mês, histórico)
CREATE INDEX IF NOT EXISTS idx_disparo_logs_broker_fired
  ON public.disparo_logs (broker_id, fired_at DESC);

-- Partial index para a query de cooldown (só linhas com cooldown_until NOT NULL)
CREATE INDEX IF NOT EXISTS idx_disparo_logs_broker_cooldown
  ON public.disparo_logs (broker_id, fired_at DESC)
  WHERE cooldown_until IS NOT NULL;
