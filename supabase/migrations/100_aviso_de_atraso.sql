-- 100 · O admin é avisado de quem ainda não entrou no sistema
--
-- Completa a 099 (aviso de entrada). Nos dias de expediente, 30 minutos depois
-- do início, todo admin ativo recebe UM aviso com todos os corretores que ainda
-- não entraram no dia:
--
--   "Ryan Maciel ainda não entrou hoje"            (um atrasado)
--   "3 corretores ainda não entraram hoje"         (mais de um)
--   "Ryan, Dionata e Ana · o expediente começou às 9h"
--
-- ── De onde vem o expediente ────────────────────────────────────────────────
--   Da agenda que o admin já edita em Leads › Configurações (lead_sla_config.
--   schedule, índice = dia da semana, 0 = domingo). Hoje: segunda a sexta,
--   9h. Mudar a agenda ali muda também a hora deste aviso; dia desligado na
--   agenda não tem aviso. Isso vale mesmo com o rodízio por SLA desligado: a
--   agenda é o expediente da equipe.
--
-- ── Regras ──────────────────────────────────────────────────────────────────
--   • "Entrou" = tem registro em entradas_do_dia (099) no dia de São Paulo.
--   • Quem é cobrado: todo usuário ativo que não é admin, menos o "E2E Tester"
--     — os mesmos que geram o aviso de entrada.
--   • Uma vez por dia, no máximo. A tabela avisos_de_atraso guarda o dia já
--     conferido, tenha saído aviso ou não (todo mundo entrou = sem aviso).
--   • Janela de 10 minutos: se o agendador não rodar às 9h30 (banco fora do
--     ar), o aviso sai até 9h40; depois disso não sai mais, porque "ainda não
--     entrou" às 14h seria outra informação.
--   • Feriado não é conhecido pelo sistema: em feriado de dia útil o aviso
--     sai. Para evitar, desligar o dia na agenda.
--   • Sem destino na tela (resource_type 'corretor'): o push abre a inicial.

CREATE TABLE IF NOT EXISTS public.avisos_de_atraso (
  dia         date        PRIMARY KEY,
  conferido_em timestamptz NOT NULL DEFAULT now(),
  atrasados   uuid[]      NOT NULL DEFAULT '{}'
);

ALTER TABLE public.avisos_de_atraso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_de_atraso FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.avisar_atraso_de_entrada(p_agora timestamptz DEFAULT now())
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tz          constant text := 'America/Sao_Paulo';
  tolerancia  constant interval := interval '30 minutes';
  janela      constant interval := interval '10 minutes';
  v_local     timestamp := p_agora AT TIME ZONE tz;
  v_dia       date := v_local::date;
  v_agenda    jsonb;
  v_inicio    time;
  v_ids       uuid[];
  v_nomes     text[];
  v_titulo    text;
  v_lista     text;
  v_hora_txt  text;
  n           int;
BEGIN
  SELECT schedule -> EXTRACT(DOW FROM v_local)::int INTO v_agenda FROM lead_sla_config WHERE id = 1;
  IF v_agenda IS NULL OR NOT COALESCE((v_agenda ->> 'on')::boolean, false) THEN
    RETURN 0;  -- dia sem expediente
  END IF;

  v_inicio := (v_agenda ->> 'start')::time;
  IF v_local::time < v_inicio + tolerancia OR v_local::time >= v_inicio + tolerancia + janela THEN
    RETURN 0;  -- fora da janela do aviso
  END IF;

  -- Marca o dia antes de avisar: duas execuções juntas não avisam duas vezes.
  INSERT INTO avisos_de_atraso (dia, conferido_em) VALUES (v_dia, p_agora)
  ON CONFLICT (dia) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 0;  -- já conferido hoje
  END IF;

  SELECT array_agg(p.id ORDER BY p.name), array_agg(split_part(trim(p.name), ' ', 1) ORDER BY p.name)
  INTO v_ids, v_nomes
  FROM profiles p
  WHERE p.active AND p.role <> 'admin' AND p.name <> 'E2E Tester'
    AND NOT EXISTS (SELECT 1 FROM entradas_do_dia e WHERE e.user_id = p.id AND e.dia = v_dia);

  n := COALESCE(cardinality(v_ids), 0);
  UPDATE avisos_de_atraso SET atrasados = COALESCE(v_ids, '{}') WHERE dia = v_dia;
  IF n = 0 THEN
    RETURN 0;  -- todo mundo entrou
  END IF;

  -- "9h" e não "9h00"; "9h30" continua "9h30"
  v_hora_txt := EXTRACT(HOUR FROM v_inicio)::int || 'h'
    || CASE WHEN EXTRACT(MINUTE FROM v_inicio) = 0 THEN ''
            ELSE lpad(EXTRACT(MINUTE FROM v_inicio)::int::text, 2, '0') END;

  IF n = 1 THEN
    SELECT trim(name) || ' ainda não entrou hoje' INTO v_titulo FROM profiles WHERE id = v_ids[1];
    v_lista := 'O expediente começou às ' || v_hora_txt;
  ELSE
    v_titulo := n || ' corretores ainda não entraram hoje';
    v_lista := array_to_string(v_nomes[1:n-1], ', ') || ' e ' || v_nomes[n]
               || ' · o expediente começou às ' || v_hora_txt;
  END IF;

  INSERT INTO notifications (user_id, type, title, body, resource_id, resource_type, read)
  SELECT p.id, 'broker_late', v_titulo, v_lista, NULL, 'corretor', false
  FROM profiles p
  WHERE p.role = 'admin' AND p.active;

  RETURN n;
END $function$;

-- Só o agendador chama.
REVOKE ALL ON FUNCTION public.avisar_atraso_de_entrada(timestamptz) FROM PUBLIC, anon, authenticated;

-- Confere a cada minuto; fora da janela a função sai na primeira leitura.
SELECT cron.unschedule('avisar-atraso-de-entrada')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avisar-atraso-de-entrada');
SELECT cron.schedule('avisar-atraso-de-entrada', '* * * * *', 'SELECT public.avisar_atraso_de_entrada()');
