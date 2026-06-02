-- Solução definitiva: lead herda broker_id da campanha.
--
-- Problema raiz: leads eram importados com broker_id = admin (quem importou),
-- mas o corretor dono da campanha precisava atualizá-los. Toda complexidade
-- de RLS com EXISTS/subqueries era workaround para esse problema.
--
-- Solução correta:
--   1. Lead recebe broker_id = campaign.broker_id na importação
--   2. Corretor dono da campanha = dono dos leads → política simples funciona
--   3. Transferência de campanha já usa transferLeadsToBroker() para atualizar

-- ── Corrige todos os leads existentes ────────────────────────────────────────
UPDATE campaign_leads cl
SET broker_id = c.broker_id
FROM campaigns c
WHERE cl.campaign_id = c.id
  AND cl.broker_id IS DISTINCT FROM c.broker_id;

-- ── Remove políticas complexas das migrations 019-021 ─────────────────────────
DROP POLICY IF EXISTS campaign_leads_policy ON campaign_leads;
DROP POLICY IF EXISTS campaign_leads_select ON campaign_leads;
DROP POLICY IF EXISTS campaign_leads_insert ON campaign_leads;
DROP POLICY IF EXISTS campaign_leads_update ON campaign_leads;
DROP POLICY IF EXISTS campaign_leads_delete ON campaign_leads;

-- ── Política simples e robusta ────────────────────────────────────────────────
-- broker_id = auth.uid() é suficiente porque o lead agora tem o broker_id certo
CREATE POLICY campaign_leads_policy ON campaign_leads
  FOR ALL USING (broker_id = auth.uid() OR is_admin());
