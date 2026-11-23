-- 104 · Parte da comissão de cada corretor (Kanban redesenhado, 22/11/2026)
--
-- O Kanban passa a mostrar, no topo de cada coluna, o VGV e a comissão — e
-- cada corretor vê a SUA parte. A conta (Rafael, 22/11/2026):
--
--   bruta   = 5% do VGV
--   líquida = bruta − 3% de ISS, e do que sobra − 6% do Simples
--             (um depois do outro: bruta × 0,97 × 0,94)
--   parte   = líquida × a parte do corretor (Ryan 40%, Dionata 50%)
--
-- A parte fica no perfil, em % da comissão LÍQUIDA. Nulo = não divide (o
-- admin e quem não é corretor comissionado): a líquida inteira é da Souza.
-- Só o admin muda — entra na mesma trava de papel e acesso (091).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_share numeric(5,2)
  CHECK (commission_share IS NULL OR (commission_share >= 0 AND commission_share <= 100));

COMMENT ON COLUMN public.profiles.commission_share IS
  'Parte do corretor, em % da comissão líquida (5% do VGV − 3% ISS − 6% Simples). Nulo = não divide. Só o admin muda.';

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
    IF NEW.role <> 'broker' OR NEW.is_manager OR NEW.commission_share IS NOT NULL THEN
      RAISE EXCEPTION 'Só o admin pode criar um usuário com papel de admin ou gestor, ou com parte de comissão';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role             IS DISTINCT FROM OLD.role
     OR NEW.active           IS DISTINCT FROM OLD.active
     OR NEW.is_manager       IS DISTINCT FROM OLD.is_manager
     OR NEW.allowed_menus    IS DISTINCT FROM OLD.allowed_menus
     OR NEW.commission_share IS DISTINCT FROM OLD.commission_share THEN
    RAISE EXCEPTION 'Só o admin pode mudar papel, acesso, permissões ou parte de comissão de um usuário';
  END IF;

  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.profiles_guard_privileges() FROM PUBLIC, anon, authenticated;

-- As partes combinadas hoje
UPDATE public.profiles SET commission_share = 40, updated_at = now() WHERE name = 'Ryan Maciel'   AND role = 'broker';
UPDATE public.profiles SET commission_share = 50, updated_at = now() WHERE name = 'Dionata Alves' AND role = 'broker';
