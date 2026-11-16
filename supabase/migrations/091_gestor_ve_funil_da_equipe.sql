-- 091 · Gestor: corretor que pode VER o funil dos colegas (sem mexer)
--
-- Novo atributo no usuário: "Gestor". O gestor continua sendo corretor — recebe
-- lead, tem o próprio funil, aparece nas roletas — e ganha UMA coisa a mais:
-- abrir o Kanban de outro corretor em modo somente leitura.
--
-- Como a leitura é dada, e por que desse jeito:
--   • A regra de acesso da tabela `leads` NÃO muda (cada corretor só enxerga os
--     próprios leads; o admin, todos). Se a regra mudasse, os leads dos colegas
--     entrariam em todas as telas do gestor — lista, dashboard, followup,
--     contadores — e ele poderia gravar neles.
--   • O gestor lê por uma função própria, `team_funnel_leads`, que devolve só o
--     funil ABERTO de um corretor (sem descartados e sem vendidos) e SEM os
--     dados de contato: telefone, e-mail, anotações e respostas do formulário
--     voltam vazios. Dá para acompanhar o funil; não dá para abordar o lead.
--   • Nenhuma permissão de escrita é criada. Mover, editar, transferir e
--     registrar contato no lead de outro corretor continuam bloqueados pela
--     regra da tabela, mesmo que alguém tente por fora da tela.
--
-- Junto, duas correções de segurança na tabela de usuários — sem elas o novo
-- atributo não valeria nada:
--   1. Hoje qualquer corretor consegue alterar a PRÓPRIA linha em `profiles`,
--      inclusive o papel: dava para virar admin (ou gestor) por conta própria.
--      Passa a existir uma trava: papel, ativo/desativado, telas liberadas e
--      gestor só mudam pelas mãos do admin.
--   2. Na criação de usuário o papel vinha do que o cadastro informasse: uma
--      conta nova podia nascer como admin. Toda conta nova passa a nascer
--      corretor; promover a admin é decisão do admin, na tela de Corretores.

-- ── O atributo ───────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_manager IS
  'Gestor: corretor que pode ver, somente leitura, o funil dos outros corretores (migração 091).';

-- Gestor ou admin, e ativo. O admin já vê tudo; entra aqui para a mesma função
-- de leitura servir aos dois.
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND active AND (is_manager OR role = 'admin')
  );
$function$;

REVOKE ALL ON FUNCTION public.is_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;

-- ── Trava: só o admin muda papel, acesso e permissões ────────────────────────
-- Quem não tem usuário logado (função interna, cron, criação de conta) passa:
-- a trava é contra o corretor mexendo na própria linha pela API.
CREATE OR REPLACE FUNCTION public.profiles_guard_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'broker' OR NEW.is_manager THEN
      RAISE EXCEPTION 'Só o admin pode criar um usuário com papel de admin ou gestor';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role          IS DISTINCT FROM OLD.role
     OR NEW.active        IS DISTINCT FROM OLD.active
     OR NEW.is_manager    IS DISTINCT FROM OLD.is_manager
     OR NEW.allowed_menus IS DISTINCT FROM OLD.allowed_menus THEN
    RAISE EXCEPTION 'Só o admin pode mudar papel, acesso ou permissões de um usuário';
  END IF;

  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.profiles_guard_privileges() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileges ON public.profiles;
CREATE TRIGGER trg_profiles_guard_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileges();

-- ── Conta nova nasce corretor ────────────────────────────────────────────────
-- Igual à função atual, menos o papel vindo do cadastro.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'broker'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ── O funil de um corretor, para o gestor ver ────────────────────────────────
CREATE OR REPLACE FUNCTION public.team_funnel_leads(p_broker_id uuid)
RETURNS SETOF public.leads
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;
  IF NOT is_manager() THEN
    RAISE EXCEPTION 'Só gestor ou admin pode ver o funil de outro corretor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_broker_id AND active AND role = 'broker') THEN
    RAISE EXCEPTION 'Corretor não encontrado ou inativo';
  END IF;

  RETURN QUERY
  SELECT (jsonb_populate_record(l, jsonb_build_object(
            'phone', '', 'email', NULL, 'notes', NULL, 'form_answers', NULL))).*
  FROM leads l
  WHERE l.broker_id = p_broker_id
    AND l.discard_reason IS NULL
    AND l.closed_at IS NULL;
END $function$;

REVOKE ALL ON FUNCTION public.team_funnel_leads(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_funnel_leads(uuid) TO authenticated;
