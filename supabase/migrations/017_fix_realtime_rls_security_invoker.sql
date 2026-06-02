-- ─────────────────────────────────────────────────────────────────────────────
-- PROBLEMA: is_admin() era SECURITY DEFINER
-- No contexto do Supabase Realtime (WAL), funções SECURITY DEFINER não
-- recebem o JWT (auth.uid() retorna NULL) → is_admin() sempre retorna false
-- para o admin no realtime → admin nunca recebia eventos de outros corretores.
--
-- SOLUÇÃO: recriar is_admin() como SECURITY INVOKER para que herde o
-- contexto JWT do usuário chamador, funcionando corretamente no realtime.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Recria as políticas RLS para forçar recompilação com a nova função.

DROP POLICY IF EXISTS "campaign_leads_policy" ON public.campaign_leads;
CREATE POLICY "campaign_leads_policy" ON public.campaign_leads
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "campaigns_policy" ON public.campaigns;
CREATE POLICY "campaigns_policy" ON public.campaigns
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "leads_policy" ON public.leads;
CREATE POLICY "leads_policy" ON public.leads
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "sales_policy" ON public.sales;
CREATE POLICY "sales_policy" ON public.sales
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    broker_id = auth.uid()
    OR assigned_to_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "goals_policy" ON public.goals;
CREATE POLICY "goals_policy" ON public.goals
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "daily_logs_policy" ON public.daily_logs;
CREATE POLICY "daily_logs_policy" ON public.daily_logs
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "lead_interactions_policy" ON public.lead_interactions;
CREATE POLICY "lead_interactions_policy" ON public.lead_interactions
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "contacts_policy" ON public.contacts;
CREATE POLICY "contacts_policy" ON public.contacts
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "participants_policy" ON public.campaign_participants;
CREATE POLICY "participants_policy" ON public.campaign_participants
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "activity_logs_select" ON public.activity_logs;
CREATE POLICY "activity_logs_select" ON public.activity_logs
  FOR SELECT USING (broker_id = auth.uid() OR public.is_admin());
