-- Caso real: admin cria campanha com broker_id = corretor, importa listas
-- (leads ficam com broker_id = admin). Corretor não via os leads pois o
-- EXISTS anterior só cobria campaign_participants.
-- Nova condição: se a campanha está atribuída ao corretor (campaigns.broker_id),
-- ele enxerga todos os leads dessa campanha, independente de participantes.

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
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_leads.campaign_id
        AND c.broker_id = auth.uid()
    )
  );

-- ── campaign_activity_log (mesmo padrão) ─────────────────────────────────────
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
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_activity_log.campaign_id
        AND c.broker_id = auth.uid()
    )
  );
