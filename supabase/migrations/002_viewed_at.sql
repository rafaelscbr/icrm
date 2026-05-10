-- Migration 002: Campo viewed_at para controle de leads não visualizados
-- Execute no SQL Editor do Supabase

ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

-- Marca como já visualizados todos os leads existentes (exceto os do Meta que chegaram hoje)
UPDATE campaign_leads
SET viewed_at = updated_at
WHERE source != 'meta_ads' OR viewed_at IS NOT NULL;
