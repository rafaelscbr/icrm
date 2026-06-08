-- ─── Migration 025: Tarefas Compartilhadas ────────────────────────────────────
-- Cria a tabela task_participants (N participantes por tarefa) e atualiza
-- RLS da tabela tasks para incluir acesso via participação.
-- A delegação existente (assigned_to_id) permanece inalterada.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Tabela task_participants
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_participants (
  task_id  text        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id  uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE public.task_participants ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Funções SECURITY DEFINER para evitar recursão de RLS
--    tasks.RLS → task_participants (sem RLS da tabela)
--    task_participants.RLS → tasks (sem RLS da tabela)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_is_task_participant(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_participants
    WHERE task_id = p_task_id
      AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.user_is_task_owner(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = p_task_id
      AND broker_id = auth.uid()
  )
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RLS para task_participants
-- ──────────────────────────────────────────────────────────────────────────────

-- SELECT: próprio registro de participação OU criador da tarefa OU admin
CREATE POLICY "tp_select" ON public.task_participants
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.user_is_task_owner(task_id)
    OR public.is_admin()
  );

-- INSERT: somente criador da tarefa OU admin podem adicionar participantes
CREATE POLICY "tp_insert" ON public.task_participants
  FOR INSERT WITH CHECK (
    public.user_is_task_owner(task_id)
    OR public.is_admin()
  );

-- DELETE: participante remove a si mesmo OU criador remove qualquer um OU admin
CREATE POLICY "tp_delete" ON public.task_participants
  FOR DELETE USING (
    user_id = auth.uid()
    OR public.user_is_task_owner(task_id)
    OR public.is_admin()
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Atualiza RLS da tabela tasks para incluir acesso via participação
-- ──────────────────────────────────────────────────────────────────────────────

-- SELECT: próprias OU delegadas OU compartilhadas com você OU admin
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT USING (
    broker_id = auth.uid()
    OR assigned_to_id = auth.uid()
    OR public.user_is_task_participant(id)
    OR public.is_admin()
  );

-- UPDATE: próprias OU delegadas para você OU compartilhadas com você OU admin
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    broker_id = auth.uid()
    OR assigned_to_id = auth.uid()
    OR public.user_is_task_participant(id)
    OR public.is_admin()
  );

-- DELETE: apenas o criador ou admin (sem alteração)
-- (já correto desde migration 008)

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Habilita Realtime para sincronização em tempo real
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'task_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_participants;
  END IF;
END $$;
