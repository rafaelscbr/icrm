-- Correção: corretores participantes de uma campanha devem ver todos os registros da campanha
-- sem alterar a propriedade (broker_id permanece com o admin criador)
-- Antes: corretor só via leads onde broker_id = auth.uid() — leads criados pelo admin ficavam invisíveis
-- Depois: qualquer participante da campanha (campaign_participants) vê todos os leads/dados dela

-- ── campaign_leads ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS campaign_leads_policy ON campaign_leads;
CREATE POLICY campaign_leads_policy ON campaign_leads
  FOR ALL USING (
    broker_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM campaign_participants cp
      WHERE cp.campaign_id = campaign_leads.campaign_id
        AND cp.broker_id = auth.uid()
    )
  );

-- ── campaigns ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS campaigns_policy ON campaigns;
CREATE POLICY campaigns_policy ON campaigns
  FOR ALL USING (
    broker_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM campaign_participants cp
      WHERE cp.campaign_id = campaigns.id
        AND cp.broker_id = auth.uid()
    )
  );

-- ── campaign_activity_log ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS activity_log_select ON campaign_activity_log;
CREATE POLICY activity_log_select ON campaign_activity_log
  FOR SELECT USING (
    broker_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM campaign_participants cp
      WHERE cp.campaign_id = campaign_activity_log.campaign_id
        AND cp.broker_id = auth.uid()
    )
  );
