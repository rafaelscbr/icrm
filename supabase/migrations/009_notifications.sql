-- ─── Migration 009: Sistema de Notificações ──────────────────────────────────
-- Execute no SQL Editor do Supabase Dashboard.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Tabela de notificações
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          text        NOT NULL DEFAULT 'task_assigned',
  title         text        NOT NULL,
  body          text,           -- ex: título da tarefa
  resource_id   text,           -- ex: task UUID
  resource_type text,           -- 'task'
  read          boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (user_id, read)
  WHERE NOT read;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Cada usuário vê apenas as suas próprias notificações; admin vê todas
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

-- Qualquer usuário autenticado pode criar notificações (trigger usa SECURITY DEFINER)
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Só o dono ou admin pode marcar como lida/deletar
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE USING (user_id = auth.uid() OR public.is_admin());

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Habilitar Realtime para a tabela
-- ──────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Trigger: cria notificação automática quando uma tarefa é delegada
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  assigner_name text;
BEGIN
  -- Dispara apenas quando assigned_to_id foi definido ou alterado
  IF (TG_OP = 'INSERT' AND NEW.assigned_to_id IS NOT NULL)
  OR (TG_OP = 'UPDATE'
      AND NEW.assigned_to_id IS DISTINCT FROM OLD.assigned_to_id
      AND NEW.assigned_to_id IS NOT NULL) THEN

    -- Busca o nome de quem delegou
    SELECT name INTO assigner_name
    FROM public.profiles
    WHERE id = NEW.broker_id;

    INSERT INTO public.notifications (user_id, type, title, body, resource_id, resource_type)
    VALUES (
      NEW.assigned_to_id,
      'task_assigned',
      'Tarefa delegada por ' || COALESCE(assigner_name, 'alguém'),
      NEW.title,
      NEW.id::text,
      'task'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_notify_assigned ON public.tasks;
CREATE TRIGGER tasks_notify_assigned
  AFTER INSERT OR UPDATE OF assigned_to_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();
