-- Properties: permuta
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS accepts_permuta BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS permuta_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS permuta_regions TEXT[] DEFAULT '{}';

-- Leads: permuta discard
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS permuta_type TEXT,
  ADD COLUMN IF NOT EXISTS permuta_property_region TEXT,
  ADD COLUMN IF NOT EXISTS permuta_property_value NUMERIC,
  ADD COLUMN IF NOT EXISTS permuta_car_model TEXT,
  ADD COLUMN IF NOT EXISTS permuta_car_value NUMERIC;

-- Leads: radar
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS radar_property_type TEXT,
  ADD COLUMN IF NOT EXISTS radar_region TEXT,
  ADD COLUMN IF NOT EXISTS radar_value_min NUMERIC,
  ADD COLUMN IF NOT EXISTS radar_value_max NUMERIC,
  ADD COLUMN IF NOT EXISTS radar_area_min NUMERIC,
  ADD COLUMN IF NOT EXISTS radar_bedrooms INTEGER;

-- Update discard_reason constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_discard_reason_check;
ALTER TABLE leads ADD CONSTRAINT leads_discard_reason_check
  CHECK (discard_reason IN ('sem_condicao','fora_de_nicho','parou_de_responder','nunca_respondeu','telefone_invalido','permuta'));
