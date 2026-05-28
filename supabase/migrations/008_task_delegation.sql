-- ─── Migration 008: Delegação de Tarefas ────────────────────────────────────
-- Execute no SQL Editor do Supabase Dashboard.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Adiciona coluna assigned_to_id (para delegação)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_to_id uuid REFERENCES auth.users(id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Trigger: garante que broker_id nunca seja NULL no INSERT
--    Resolve race condition onde getCurrentUserId() pode retornar null antes
--    da sessão do Supabase ser carregada no cliente.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_task_broker_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.broker_id IS NULL THEN
    NEW.broker_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_broker_id_default ON public.tasks;
CREATE TRIGGER tasks_broker_id_default
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_broker_id();

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Atualiza RLS da tabela tasks para suportar delegação
--    - Criador vê/edita suas tarefas
--    - Pessoa para quem foi delegada vê/edita
--    - Admin vê tudo
-- ──────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_policy"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_select"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_update"  ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete"  ON public.tasks;

-- SELECT: próprias tarefas OU tarefas delegadas para você OU admin
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    broker_id = auth.uid()
    OR assigned_to_id = auth.uid()
    OR public.is_admin()
  );

-- INSERT: broker_id deve ser o próprio usuário OU admin pode inserir para qualquer um
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    broker_id = auth.uid()
    OR broker_id IS NULL   -- trigger vai preencher auth.uid()
    OR public.is_admin()
  );

-- UPDATE: próprias tarefas OU delegadas para você OU admin
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    broker_id = auth.uid()
    OR assigned_to_id = auth.uid()
    OR public.is_admin()
  );

-- DELETE: próprias tarefas OU admin
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    broker_id = auth.uid()
    OR public.is_admin()
  );
