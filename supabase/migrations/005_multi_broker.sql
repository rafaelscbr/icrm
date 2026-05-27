-- ─── Migration 005: Sistema Multi-Corretor ────────────────────────────────────
-- Execute este script no SQL Editor do Supabase Dashboard.
-- IMPORTANTE: leia os comentários com !! antes de rodar.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Tabela de perfis (estende auth.users)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL DEFAULT '',
  role       text        NOT NULL DEFAULT 'broker' CHECK (role IN ('admin', 'broker')),
  active     boolean     NOT NULL DEFAULT true,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Adiciona broker_id nas tabelas de dados do corretor
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.leads             ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id);
ALTER TABLE public.sales             ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id);
ALTER TABLE public.tasks             ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id);
ALTER TABLE public.goals             ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id);
ALTER TABLE public.campaigns         ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id);
ALTER TABLE public.campaign_leads    ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id);
ALTER TABLE public.daily_logs        ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id);
ALTER TABLE public.lead_interactions ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Corrige constraint única do daily_logs
--    Era: UNIQUE(date) — agora: UNIQUE(date, broker_id)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.daily_logs DROP CONSTRAINT IF EXISTS daily_logs_date_key;
ALTER TABLE public.daily_logs DROP CONSTRAINT IF EXISTS daily_logs_date_broker_key;
ALTER TABLE public.daily_logs ADD  CONSTRAINT daily_logs_date_broker_key UNIQUE (date, broker_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Habilita RLS em todas as tabelas
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_config       ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Função auxiliar: verifica se o usuário atual é admin
--    SECURITY DEFINER = roda com permissão de superusuário (bypass RLS interno)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Políticas RLS
-- ──────────────────────────────────────────────────────────────────────────────

-- Profiles: qualquer usuário autenticado lê; só admin altera outros perfis
DROP POLICY IF EXISTS "profiles_select"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_update"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete"        ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (public.is_admin());

-- Leads
DROP POLICY IF EXISTS "leads_policy" ON public.leads;
CREATE POLICY "leads_policy" ON public.leads
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- Sales
DROP POLICY IF EXISTS "sales_policy" ON public.sales;
CREATE POLICY "sales_policy" ON public.sales
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- Tasks
DROP POLICY IF EXISTS "tasks_policy" ON public.tasks;
CREATE POLICY "tasks_policy" ON public.tasks
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- Goals
DROP POLICY IF EXISTS "goals_policy" ON public.goals;
CREATE POLICY "goals_policy" ON public.goals
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- Campaigns
DROP POLICY IF EXISTS "campaigns_policy" ON public.campaigns;
CREATE POLICY "campaigns_policy" ON public.campaigns
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- Campaign Leads
DROP POLICY IF EXISTS "campaign_leads_policy" ON public.campaign_leads;
CREATE POLICY "campaign_leads_policy" ON public.campaign_leads
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- Daily Logs
DROP POLICY IF EXISTS "daily_logs_policy" ON public.daily_logs;
CREATE POLICY "daily_logs_policy" ON public.daily_logs
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- Lead Interactions
DROP POLICY IF EXISTS "lead_interactions_policy" ON public.lead_interactions;
CREATE POLICY "lead_interactions_policy" ON public.lead_interactions
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- Contacts: todos os usuários autenticados leem e escrevem
DROP POLICY IF EXISTS "contacts_policy" ON public.contacts;
CREATE POLICY "contacts_policy" ON public.contacts
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Properties: todos os usuários autenticados leem e escrevem
DROP POLICY IF EXISTS "properties_policy" ON public.properties;
CREATE POLICY "properties_policy" ON public.properties
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Lead Config: todos os usuários autenticados leem e escrevem
DROP POLICY IF EXISTS "lead_config_policy" ON public.lead_config;
CREATE POLICY "lead_config_policy" ON public.lead_config
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Trigger: cria perfil automaticamente no cadastro de novo usuário
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'broker')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. Cria o perfil admin para o usuário já existente
--    !! IMPORTANTE: substitua 'SEU_USER_ID_AQUI' pelo seu user ID real !!
--    Para encontrar: Supabase Dashboard > Authentication > Users > copie o UUID
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO public.profiles (id, name, role)
VALUES ('7844d77b-330a-4ffa-a4bd-f9e1134952f1', 'Rafael', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin', name = 'Rafael';

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. Atribui todos os dados existentes ao admin
--    !! IMPORTANTE: rode APÓS o INSERT acima (passo 8), substituindo o mesmo ID !!
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  admin_id uuid := '7844d77b-330a-4ffa-a4bd-f9e1134952f1';
BEGIN
  UPDATE public.leads             SET broker_id = admin_id WHERE broker_id IS NULL;
  UPDATE public.sales             SET broker_id = admin_id WHERE broker_id IS NULL;
  UPDATE public.tasks             SET broker_id = admin_id WHERE broker_id IS NULL;
  UPDATE public.goals             SET broker_id = admin_id WHERE broker_id IS NULL;
  UPDATE public.campaigns         SET broker_id = admin_id WHERE broker_id IS NULL;
  UPDATE public.campaign_leads    SET broker_id = admin_id WHERE broker_id IS NULL;
  UPDATE public.daily_logs        SET broker_id = admin_id WHERE broker_id IS NULL;
  UPDATE public.lead_interactions SET broker_id = admin_id WHERE broker_id IS NULL;
END $$;
