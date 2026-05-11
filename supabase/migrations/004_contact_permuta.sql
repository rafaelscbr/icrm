-- Permuta info on contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS permuta_type TEXT CHECK (permuta_type IN ('imovel', 'carro')),
  ADD COLUMN IF NOT EXISTS permuta_property_region TEXT,
  ADD COLUMN IF NOT EXISTS permuta_property_value NUMERIC,
  ADD COLUMN IF NOT EXISTS permuta_car_model TEXT,
  ADD COLUMN IF NOT EXISTS permuta_car_value NUMERIC;
