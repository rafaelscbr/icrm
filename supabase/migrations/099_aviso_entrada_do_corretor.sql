-- 099 · O admin é avisado quando um corretor entra no sistema
--
-- Na primeira vez do dia em que um corretor abre o sistema (ou volta a uma aba
-- que ficou aberta desde ontem), cada admin ativo recebe um aviso no sino e no
-- push do celular:
--
--   "Dionata Alves entrou no sistema"
--   "Primeira entrada de hoje · 08:12"
--
-- ── Por que "primeira entrada do dia" e não "cada login" ────────────────────
--   A sessão do Supabase dura semanas: o corretor quase nunca digita a senha,
--   ele só abre o app. "Login" de verdade seria raro e enganaria. E avisar a
--   cada abertura de app seria o mesmo erro dos 100 avisos iguais (revisão de
--   design set/2026). Uma vez por corretor por dia de São Paulo responde à
--   pergunta que importa: "fulano já começou hoje? a que horas?".
--
-- ── Regras ──────────────────────────────────────────────────────────────────
--   • Quem avisa: todo usuário ativo que não é admin (corretor e gestor).
--     O "E2E Tester" nunca avisa.
--   • Quem recebe: todo admin ativo.
--   • Uma vez por pessoa por dia: a tabela entradas_do_dia tem chave
--     (usuario, dia). Duas abas abrindo juntas, ou o app chamando de novo,
--     caem no ON CONFLICT e não geram segundo aviso. Quem garante é o banco;
--     a tela só evita gastar chamada à toa.
--   • O aviso não tem destino na tela (resource_type 'corretor'): o push abre
--     o sistema na página inicial.
--   • Sem som nem toast no app: não é lead, não pede ação imediata.
--
-- Não lê nem grava activity_logs: independe do relatório de Performance.

CREATE TABLE IF NOT EXISTS public.entradas_do_dia (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia        date        NOT NULL,
  entrou_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dia)
);

-- Só a função abaixo escreve; ninguém lê direto pela API.
ALTER TABLE public.entradas_do_dia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.entradas_do_dia FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_entrada_do_dia()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tz      constant text := 'America/Sao_Paulo';
  v_uid   uuid := auth.uid();
  v_now   timestamptz := now();
  v_nome  text;
  v_papel text;
  v_dia   date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;

  SELECT name, role INTO v_nome, v_papel FROM profiles WHERE id = v_uid AND active;
  -- Inativo, admin ou usuário de teste: não há o que avisar.
  IF NOT FOUND OR v_papel = 'admin' OR v_nome = 'E2E Tester' THEN
    RETURN false;
  END IF;

  v_dia := (v_now AT TIME ZONE tz)::date;

  INSERT INTO entradas_do_dia (user_id, dia, entrou_em)
  VALUES (v_uid, v_dia, v_now)
  ON CONFLICT (user_id, dia) DO NOTHING;
  IF NOT FOUND THEN
    RETURN false;  -- já entrou hoje
  END IF;

  INSERT INTO notifications (user_id, type, title, body, resource_id, resource_type, read)
  SELECT p.id, 'broker_login',
         COALESCE(NULLIF(trim(v_nome), ''), 'Um corretor') || ' entrou no sistema',
         'Primeira entrada de hoje · ' || to_char(v_now AT TIME ZONE tz, 'HH24:MI'),
         v_uid, 'corretor', false
  FROM profiles p
  WHERE p.role = 'admin' AND p.active;

  RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.registrar_entrada_do_dia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrada_do_dia() TO authenticated;
