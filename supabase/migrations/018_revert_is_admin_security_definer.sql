-- REVERTER: is_admin() DEVE ser SECURITY DEFINER
-- A migration 017 mudou para SECURITY INVOKER achando que resolveria
-- o realtime, mas criou recursão infinita nos RLS:
-- campaign_leads RLS → is_admin() → SELECT profiles → profiles RLS → is_admin() → loop
-- Resultado: admin via a query retornar vazia silenciosamente.
-- O SECURITY DEFINER é necessário para bypasser o RLS de profiles.

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;
