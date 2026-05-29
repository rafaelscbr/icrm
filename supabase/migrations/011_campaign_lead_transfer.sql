-- Rastreia quando um lead de campanha foi migrado para o funil principal
ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS transferred_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transferred_to_lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL;
