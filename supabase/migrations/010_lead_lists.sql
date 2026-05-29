-- ─── 010: Base de Leads — listas frias, histórico de campanhas ────────────────

-- Adiciona campos no contato para identificar leads da base fria
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_base_lead      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_lead_profile JSONB;

-- Listas de leads frios
CREATE TABLE IF NOT EXISTS lead_lists (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT        NOT NULL,
  description     TEXT,
  product_profile JSONB,
  total_count     INT         NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  broker_id       UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vínculo contato ↔ lista (sem duplicar o contato)
CREATE TABLE IF NOT EXISTS lead_list_members (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  list_id      TEXT        NOT NULL REFERENCES lead_lists(id) ON DELETE CASCADE,
  contact_id   TEXT        NOT NULL REFERENCES contacts(id)  ON DELETE CASCADE,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  import_batch TEXT,
  raw_phone    TEXT,
  UNIQUE (list_id, contact_id)
);

-- Vínculo campanha ↔ lista (M:N)
CREATE TABLE IF NOT EXISTS campaign_lists (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id TEXT        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  list_id     TEXT        NOT NULL REFERENCES lead_lists(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, list_id)
);

-- Histórico de disparos por lead
CREATE TABLE IF NOT EXISTS lead_campaign_dispatches (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contact_id    TEXT        NOT NULL REFERENCES contacts(id)   ON DELETE CASCADE,
  campaign_id   TEXT        NOT NULL REFERENCES campaigns(id)  ON DELETE CASCADE,
  list_id       TEXT        REFERENCES lead_lists(id)          ON DELETE SET NULL,
  broker_id     UUID        REFERENCES auth.users(id),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_index INT,
  channel       TEXT        NOT NULL DEFAULT 'whatsapp',
  notes         TEXT,
  warmup_score  SMALLINT    NOT NULL DEFAULT 0
);

-- ─── Índices para performance com 60k+ registros ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contacts_is_base_lead    ON contacts (is_base_lead) WHERE is_base_lead = true;
CREATE INDEX IF NOT EXISTS idx_contacts_phone           ON contacts (phone);

CREATE INDEX IF NOT EXISTS idx_lead_list_members_list    ON lead_list_members (list_id);
CREATE INDEX IF NOT EXISTS idx_lead_list_members_contact ON lead_list_members (contact_id);

CREATE INDEX IF NOT EXISTS idx_campaign_lists_campaign   ON campaign_lists (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_lists_list       ON campaign_lists (list_id);

CREATE INDEX IF NOT EXISTS idx_dispatches_contact        ON lead_campaign_dispatches (contact_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_campaign       ON lead_campaign_dispatches (campaign_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_broker         ON lead_campaign_dispatches (broker_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE lead_lists               ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_list_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_lists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_campaign_dispatches ENABLE ROW LEVEL SECURITY;

-- lead_lists: todos leem, admin/dono gerencia
CREATE POLICY "lead_lists_read"  ON lead_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_lists_write" ON lead_lists FOR ALL    TO authenticated
  USING  (is_admin() OR broker_id = auth.uid())
  WITH CHECK (is_admin() OR broker_id = auth.uid());

-- lead_list_members: todos leem, admin/dono da lista gerencia
CREATE POLICY "llm_read"  ON lead_list_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "llm_write" ON lead_list_members FOR ALL    TO authenticated
  USING  (is_admin() OR EXISTS (SELECT 1 FROM lead_lists l WHERE l.id = list_id AND (l.broker_id = auth.uid() OR is_admin())))
  WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM lead_lists l WHERE l.id = list_id AND (l.broker_id = auth.uid() OR is_admin())));

-- campaign_lists: todos leem, admin/dono da campanha gerencia
CREATE POLICY "cl_read"  ON campaign_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "cl_write" ON campaign_lists FOR ALL    TO authenticated
  USING  (is_admin() OR EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND (c.broker_id = auth.uid() OR is_admin())))
  WITH CHECK (is_admin() OR EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND (c.broker_id = auth.uid() OR is_admin())));

-- dispatches: cada corretor vê os próprios; admin vê tudo
CREATE POLICY "disp_read"   ON lead_campaign_dispatches FOR SELECT TO authenticated
  USING (is_admin() OR broker_id = auth.uid());
CREATE POLICY "disp_write"  ON lead_campaign_dispatches FOR INSERT TO authenticated
  WITH CHECK (broker_id = auth.uid() OR is_admin());
CREATE POLICY "disp_delete" ON lead_campaign_dispatches FOR DELETE TO authenticated
  USING (is_admin() OR broker_id = auth.uid());
