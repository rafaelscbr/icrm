-- A política FOR ALL sem WITH CHECK usa o mesmo USING para checar a linha NOVA
-- no UPDATE. O PostgREST pode rejeitar silenciosamente o update quando
-- campaign_leads.broker_id ≠ auth.uid(), mesmo que o corretor seja dono da campanha.
-- Solução: separar em políticas por operação com WITH CHECK explícito no UPDATE.

DROP POLICY IF EXISTS campaign_leads_policy ON campaign_leads;

CREATE POLICY campaign_leads_select ON campaign_leads
  FOR SELECT USING (
    broker_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM campaign_participants cp
      WHERE cp.campaign_id = campaign_leads.campaign_id
        AND cp.broker_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_leads.campaign_id
        AND c.broker_id = auth.uid()
    )
  );

CREATE POLICY campaign_leads_insert ON campaign_leads
  FOR INSERT WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_leads.campaign_id
        AND c.broker_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM campaign_participants cp
      WHERE cp.campaign_id = campaign_leads.campaign_id
        AND cp.broker_id = auth.uid()
    )
  );

-- USING checa a linha velha (visibilidade), WITH CHECK checa a linha nova.
-- WITH CHECK não exige broker_id = auth.uid() — basta ter acesso à campanha.
CREATE POLICY campaign_leads_update ON campaign_leads
  FOR UPDATE
  USING (
    broker_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM campaign_participants cp
      WHERE cp.campaign_id = campaign_leads.campaign_id
        AND cp.broker_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_leads.campaign_id
        AND c.broker_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_leads.campaign_id
        AND c.broker_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM campaign_participants cp
      WHERE cp.campaign_id = campaign_leads.campaign_id
        AND cp.broker_id = auth.uid()
    )
  );

CREATE POLICY campaign_leads_delete ON campaign_leads
  FOR DELETE USING (
    broker_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_leads.campaign_id
        AND c.broker_id = auth.uid()
    )
  );
