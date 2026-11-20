-- 098 · Aviso de acesso: o admin sabe quando cada corretor começa o dia
--
-- A sessão do Supabase fica aberta por dias, então "fez login" não diz nada.
-- O que conta é USAR o sistema. Daqui em diante o app grava um evento
-- `acesso` em activity_logs quando:
--   • o iCRM é aberto;
--   • a aba volta a ficar visível;
--   • o corretor clica ou digita depois de 30 min sem mexer (aba deixada
--     aberta de um dia para o outro no computador não gera "abertura").
-- O banco guarda no máximo 1 `acesso` a cada 15 min por usuário — a regra é
-- daqui, não do navegador.
--
-- Dois avisos para o admin (sino, som e push no celular — o mesmo caminho
-- dos avisos de lead: notifications → trigger → edge function send-push):
--
--   1. Entrada: o primeiro acesso do dia (horário de Brasília) de cada
--      corretor acompanhado avisa:
--        "Ryan Maciel entrou no iCRM às 9h02"
--      Os demais acessos do dia não avisam.
--
--   2. Atraso: nos dias marcados, a partir do horário de início e repetindo
--      a cada intervalo até o horário de fim, cada corretor acompanhado que
--      ainda não tem acesso no dia gera:
--        "Ryan ainda não entrou no iCRM (9h10)"
--      Padrão: 9h10, 10h10 … 18h10, segunda a sexta. O 9h10 é por causa do
--      pingue-pongue: os leads da noite são transferidos às 9h10.
--
-- Quem recebe: o admin que salvou a configuração (no começo, o admin ativo
-- mais antigo). Os acessos dele mesmo nunca avisam, nem os do "E2E Tester".
--
-- Segurança de operação: se o aviso falhar, o acesso é gravado do mesmo jeito.
-- E um alerta de atraso que o agendador perdeu (banco fora do ar) não sai
-- atrasado: só é enviado até 10 min depois do horário marcado.

-- ── 1. Consulta rápida dos acessos do dia ────────────────────────────────────
CREATE INDEX IF NOT EXISTS activity_logs_acesso_idx
  ON public.activity_logs (broker_id, created_at DESC)
  WHERE action = 'acesso';

-- ── 2. Configuração (uma linha só) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aviso_acesso_config (
  id                   int         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  entrada_ativa        boolean     NOT NULL DEFAULT true,
  atraso_ativo         boolean     NOT NULL DEFAULT true,
  atraso_inicio        time        NOT NULL DEFAULT '09:10',
  atraso_fim           time        NOT NULL DEFAULT '18:10',
  atraso_intervalo_min int         NOT NULL DEFAULT 60 CHECK (atraso_intervalo_min BETWEEN 15 AND 240),
  -- dias da semana ISO: 1 = segunda … 7 = domingo
  dias                 int[]       NOT NULL DEFAULT '{1,2,3,4,5}',
  corretores           uuid[]      NOT NULL DEFAULT '{}',
  destinatario         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (atraso_inicio <= atraso_fim),
  CHECK (dias <@ ARRAY[1,2,3,4,5,6,7])
);

ALTER TABLE public.aviso_acesso_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aviso_acesso_config_select" ON public.aviso_acesso_config;
CREATE POLICY "aviso_acesso_config_select" ON public.aviso_acesso_config
  FOR SELECT USING (public.is_admin());
-- Escrita só pela função set_aviso_acesso_config (valida e exige admin).

-- Começa ligada, acompanhando os corretores ativos, avisando o admin ativo
-- mais antigo.
INSERT INTO public.aviso_acesso_config (id, corretores, destinatario)
SELECT 1,
       COALESCE((SELECT array_agg(p.id ORDER BY p.name) FROM public.profiles p
                 WHERE p.role = 'broker' AND p.active AND p.name <> 'E2E Tester'), '{}'),
       (SELECT p.id FROM public.profiles p
        WHERE p.role = 'admin' AND p.active ORDER BY p.created_at LIMIT 1)
ON CONFLICT (id) DO NOTHING;

-- ── 3. O que já foi avisado (garante 1 aviso por corretor, dia e horário) ────
CREATE TABLE IF NOT EXISTS public.aviso_acesso_enviado (
  broker_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia        date        NOT NULL,
  tipo       text        NOT NULL CHECK (tipo IN ('entrada', 'atraso')),
  -- entrada: 00:00 · atraso: o horário do alerta (9h10, 10h10…)
  horario    time        NOT NULL DEFAULT '00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (broker_id, dia, tipo, horario)
);

ALTER TABLE public.aviso_acesso_enviado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aviso_acesso_enviado_select" ON public.aviso_acesso_enviado;
CREATE POLICY "aviso_acesso_enviado_select" ON public.aviso_acesso_enviado
  FOR SELECT USING (public.is_admin());

-- ── 4. Hora como se fala: 9h02, 10h10 ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hora_falada(p time)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT to_char(p, 'FMHH24') || 'h' || to_char(p, 'MI') $$;

-- ── 5. Quem é acompanhado ───────────────────────────────────────────────────
-- Corretor ativo, marcado na configuração, que não é o destinatário nem o
-- usuário de teste automatizado.
CREATE OR REPLACE FUNCTION public.acesso_acompanhado(p_uid uuid, p_cfg public.aviso_acesso_config)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = p_uid
      AND p.active
      AND p.name IS DISTINCT FROM 'E2E Tester'
      AND p.id = ANY (p_cfg.corretores)
      AND p.id IS DISTINCT FROM p_cfg.destinatario
  )
$$;

-- ── 6. registrar_acesso — chamado pelo app ──────────────────────────────────
-- Devolve true quando gravou um acesso novo; false quando já havia um nos
-- últimos 15 min (ou sem sessão).
CREATE OR REPLACE FUNCTION public.registrar_acesso(p_origem text DEFAULT 'abertura', p_page text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tz       CONSTANT text := 'America/Sao_Paulo';
  v_uid    uuid := auth.uid();
  v_agora  timestamptz := now();
  v_origem text := CASE WHEN p_origem IN ('abertura', 'foco', 'clique') THEN p_origem ELSE 'abertura' END;
  v_cfg    aviso_acesso_config%ROWTYPE;
  v_nome   text;
  v_novo   int;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  -- Duas abas abrindo juntas não gravam dois acessos.
  PERFORM pg_advisory_xact_lock(hashtext('registrar_acesso:' || v_uid::text));

  IF EXISTS (
    SELECT 1 FROM activity_logs
    WHERE broker_id = v_uid AND action = 'acesso'
      AND created_at > v_agora - interval '15 minutes'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO activity_logs (broker_id, action, page, details)
  VALUES (v_uid, 'acesso', left(p_page, 200), jsonb_build_object('origem', v_origem));

  -- Aviso de entrada: falhar aqui nunca desfaz o acesso.
  BEGIN
    SELECT * INTO v_cfg FROM aviso_acesso_config WHERE id = 1;
    IF FOUND AND v_cfg.entrada_ativa AND v_cfg.destinatario IS NOT NULL
       AND acesso_acompanhado(v_uid, v_cfg)
       AND EXISTS (SELECT 1 FROM profiles WHERE id = v_cfg.destinatario AND role = 'admin' AND active)
    THEN
      INSERT INTO aviso_acesso_enviado (broker_id, dia, tipo, horario)
      VALUES (v_uid, (v_agora AT TIME ZONE tz)::date, 'entrada', '00:00')
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_novo = ROW_COUNT;

      IF v_novo = 1 THEN
        SELECT name INTO v_nome FROM profiles WHERE id = v_uid;
        INSERT INTO notifications (user_id, type, title, body, resource_id, resource_type, read)
        VALUES (
          v_cfg.destinatario, 'acesso_entrada',
          format('%s entrou no iCRM às %s',
                 COALESCE(NULLIF(trim(v_nome), ''), 'Um corretor'),
                 hora_falada((v_agora AT TIME ZONE tz)::time)),
          NULL, v_uid::text, 'acesso', false
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'registrar_acesso: aviso de entrada não gerado para % (%)', v_uid, SQLERRM;
  END;

  RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.registrar_acesso(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_acesso(text, text) TO authenticated;

-- ── 7. avisar_atraso_acesso — rodado pelo agendador a cada minuto ───────────
-- Devolve quantos avisos criou. p_agora existe para teste; o agendador não passa.
CREATE OR REPLACE FUNCTION public.avisar_atraso_acesso(p_agora timestamptz DEFAULT now())
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tz       CONSTANT text := 'America/Sao_Paulo';
  v_local  timestamp := p_agora AT TIME ZONE tz;
  v_dia    date := v_local::date;
  v_hora   time := v_local::time;
  v_cfg    aviso_acesso_config%ROWTYPE;
  v_passo  int;
  v_slot   time;
  v_ini_dia timestamptz := v_dia::timestamp AT TIME ZONE tz;
  v_qtd    int;
BEGIN
  SELECT * INTO v_cfg FROM aviso_acesso_config WHERE id = 1;
  IF NOT FOUND OR NOT v_cfg.atraso_ativo OR v_cfg.destinatario IS NULL THEN RETURN 0; END IF;
  IF NOT (extract(isodow FROM v_dia)::int = ANY (v_cfg.dias)) THEN RETURN 0; END IF;
  IF v_hora < v_cfg.atraso_inicio THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_cfg.destinatario AND role = 'admin' AND active) THEN
    RETURN 0;
  END IF;

  -- O horário de alerta mais recente: início + n × intervalo.
  v_passo := floor(extract(epoch FROM (v_hora - v_cfg.atraso_inicio)) / 60 / v_cfg.atraso_intervalo_min)::int;
  v_slot  := v_cfg.atraso_inicio + make_interval(mins => v_passo * v_cfg.atraso_intervalo_min);
  IF v_slot > v_cfg.atraso_fim THEN RETURN 0; END IF;
  -- Alerta perdido (banco fora do ar) não sai fora de hora.
  IF v_hora - v_slot > interval '10 minutes' THEN RETURN 0; END IF;

  WITH alvo AS (
    SELECT p.id, p.name
    FROM profiles p
    WHERE acesso_acompanhado(p.id, v_cfg)
      AND NOT EXISTS (
        SELECT 1 FROM activity_logs a
        WHERE a.broker_id = p.id AND a.action = 'acesso'
          AND a.created_at >= v_ini_dia AND a.created_at <= p_agora
      )
  ), marcado AS (
    INSERT INTO aviso_acesso_enviado (broker_id, dia, tipo, horario)
    SELECT id, v_dia, 'atraso', v_slot FROM alvo
    ON CONFLICT DO NOTHING
    RETURNING broker_id
  )
  INSERT INTO notifications (user_id, type, title, body, resource_id, resource_type, read)
  SELECT v_cfg.destinatario, 'acesso_atraso',
         format('%s ainda não entrou no iCRM (%s)',
                COALESCE(NULLIF(split_part(trim(a.name), ' ', 1), ''), 'Um corretor'),
                hora_falada(v_slot)),
         NULL, a.id::text, 'acesso', false
  FROM marcado m JOIN alvo a ON a.id = m.broker_id;

  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END $function$;

REVOKE ALL ON FUNCTION public.avisar_atraso_acesso(timestamptz) FROM PUBLIC, anon, authenticated;

-- ── 8. set_aviso_acesso_config — a tela do admin salva por aqui ─────────────
-- Quem salva passa a ser o destinatário dos avisos.
CREATE OR REPLACE FUNCTION public.set_aviso_acesso_config(
  p_entrada_ativa        boolean,
  p_atraso_ativo         boolean,
  p_atraso_inicio        time,
  p_atraso_fim           time,
  p_atraso_intervalo_min int,
  p_dias                 int[],
  p_corretores           uuid[]
)
RETURNS public.aviso_acesso_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row aviso_acesso_config%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Só o admin pode mudar os avisos de acesso';
  END IF;
  IF p_atraso_inicio IS NULL OR p_atraso_fim IS NULL OR p_atraso_inicio > p_atraso_fim THEN
    RAISE EXCEPTION 'O primeiro alerta precisa ser antes (ou igual) ao último';
  END IF;
  IF p_atraso_intervalo_min IS NULL OR p_atraso_intervalo_min < 15 OR p_atraso_intervalo_min > 240 THEN
    RAISE EXCEPTION 'O intervalo entre alertas precisa ficar entre 15 e 240 minutos';
  END IF;
  IF p_dias IS NULL OR NOT (p_dias <@ ARRAY[1,2,3,4,5,6,7]) THEN
    RAISE EXCEPTION 'Dias da semana inválidos';
  END IF;
  IF p_atraso_ativo AND cardinality(p_dias) = 0 THEN
    RAISE EXCEPTION 'Marque pelo menos um dia — para parar os alertas, desligue o alerta de atraso';
  END IF;

  INSERT INTO aviso_acesso_config AS c
    (id, entrada_ativa, atraso_ativo, atraso_inicio, atraso_fim, atraso_intervalo_min,
     dias, corretores, destinatario, updated_at, updated_by)
  VALUES
    (1, p_entrada_ativa, p_atraso_ativo, p_atraso_inicio, p_atraso_fim, p_atraso_intervalo_min,
     (SELECT COALESCE(array_agg(DISTINCT d ORDER BY d), '{}') FROM unnest(p_dias) d),
     (SELECT COALESCE(array_agg(DISTINCT u), '{}') FROM unnest(COALESCE(p_corretores, '{}')) u),
     auth.uid(), now(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET
    entrada_ativa        = EXCLUDED.entrada_ativa,
    atraso_ativo         = EXCLUDED.atraso_ativo,
    atraso_inicio        = EXCLUDED.atraso_inicio,
    atraso_fim           = EXCLUDED.atraso_fim,
    atraso_intervalo_min = EXCLUDED.atraso_intervalo_min,
    dias                 = EXCLUDED.dias,
    corretores           = EXCLUDED.corretores,
    destinatario         = EXCLUDED.destinatario,
    updated_at           = EXCLUDED.updated_at,
    updated_by           = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN v_row;
END $function$;

REVOKE ALL ON FUNCTION public.set_aviso_acesso_config(boolean, boolean, time, time, int, int[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_aviso_acesso_config(boolean, boolean, time, time, int, int[], uuid[]) TO authenticated;

-- ── 9. Agendador: confere os atrasos a cada minuto ──────────────────────────
-- Barato: fora dos horários de alerta a função sai na terceira linha.
SELECT cron.schedule('avisar-atraso-acesso', '* * * * *', 'SELECT public.avisar_atraso_acesso()');
