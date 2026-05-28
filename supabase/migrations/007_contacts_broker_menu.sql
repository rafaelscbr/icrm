-- ─── Migration 007: Contatos por corretor + permissões de menu ───────────────
-- Execute este script no SQL Editor do Supabase Dashboard.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Adiciona broker_id na tabela contacts
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS broker_id uuid REFERENCES auth.users(id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Atribui contatos existentes ao admin
--    !! IMPORTANTE: substitua o UUID abaixo pelo seu user ID de admin !!
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE public.contacts
SET broker_id = '7844d77b-330a-4ffa-a4bd-f9e1134952f1'
WHERE broker_id IS NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Atualiza RLS dos contatos: cada corretor vê só os seus; admin vê todos
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contacts_policy" ON public.contacts;
CREATE POLICY "contacts_policy" ON public.contacts
  FOR ALL USING (broker_id = auth.uid() OR public.is_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Adiciona campo de permissões de menu no perfil do corretor
--    NULL = todos os menus liberados (padrão)
--    array = apenas os menus listados ficam visíveis
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_menus text[] DEFAULT NULL;
