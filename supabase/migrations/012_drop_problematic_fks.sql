-- FKs incompatíveis com a arquitetura de saves fire-and-forget do app
-- (saves são async independentes — race condition garantida com FKs)
ALTER TABLE campaign_leads DROP CONSTRAINT IF EXISTS campaign_leads_transferred_to_lead_id_fkey;
ALTER TABLE leads           DROP CONSTRAINT IF EXISTS leads_contact_id_fkey;
