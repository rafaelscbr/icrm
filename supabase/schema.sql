-- iCRM - Schema para Supabase
-- Execute este script no SQL Editor do Supabase (projeto > SQL Editor > New query)

-- ============================================================
-- TABELAS
-- ============================================================

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  company TEXT,
  birthdate TEXT,
  photo_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  has_children BOOLEAN NOT NULL DEFAULT FALSE,
  children_names TEXT,
  is_married BOOLEAN NOT NULL DEFAULT FALSE,
  spouse_name TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('ready', 'off_plan')),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('apartment', 'house', 'commercial', 'land')),
  neighborhood TEXT NOT NULL,
  value NUMERIC NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('opportunity', 'market_price', 'above_market')),
  owner_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  development_name TEXT,
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'finished')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_leads (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  extra TEXT,
  funnel_stage TEXT NOT NULL CHECK (funnel_stage IN ('new', 'sent', 'attended', 'presentation', 'proposal', 'sale')) DEFAULT 'new',
  situation TEXT CHECK (situation IN ('no_interest', 'stop_messages', 'invalid')),
  notes TEXT,
  first_contact_at TIMESTAMPTZ,
  proposal_value NUMERIC,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  property_name TEXT NOT NULL,
  date TEXT NOT NULL,
  value NUMERIC NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('off_plan', 'ready')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  due_time TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'cancelled')) DEFAULT 'pending',
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  category TEXT CHECK (category IN ('visita', 'agenciamento', 'proposta', 'outro')),
  completed_at TIMESTAMPTZ,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  google_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('visita', 'agenciamento', 'proposta', 'venda')),
  target INTEGER NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  new_leads INTEGER NOT NULL DEFAULT 0,
  owner_calls INTEGER NOT NULL DEFAULT 0,
  funnel_followup BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_contacts_phone      ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_tags       ON contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_properties_owner    ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_status   ON properties(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_camp ON campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_funnel ON campaign_leads(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date      ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_sales_date          ON sales(date);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date     ON daily_logs(date);

-- ============================================================
-- ROW LEVEL SECURITY
-- Desabilitado para o import inicial.
-- Habilite após importar os dados caso queira multi-usuário.
-- ============================================================

-- ALTER TABLE contacts        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE properties      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE campaigns       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE campaign_leads  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sales           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tasks           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE goals           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE daily_logs      ENABLE ROW LEVEL SECURITY;
