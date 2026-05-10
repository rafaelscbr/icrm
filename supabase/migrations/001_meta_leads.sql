-- Migration 001: Suporte a leads do Meta Ads
-- Execute no SQL Editor do Supabase antes de fazer o deploy da Edge Function

-- 1. Torna campaign_id opcional (leads do Meta não pertencem a uma campanha iCRM)
ALTER TABLE campaign_leads ALTER COLUMN campaign_id DROP NOT NULL;

-- 2. Adiciona coluna de origem do lead
ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'import', 'meta_ads'));

-- 3. Guarda o nome exato do anúncio que gerou o lead (para rastreabilidade)
ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS meta_ad_name TEXT;

-- Índice para filtrar leads por origem
CREATE INDEX IF NOT EXISTS idx_campaign_leads_source ON campaign_leads(source);
