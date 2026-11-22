-- 101 · Resumo do fim do dia para o admin
--
-- Às 20h dos dias de expediente, todo admin ativo recebe um aviso só (sino e
-- push) com uma linha por corretor:
--
--   "Resumo do dia · segunda, 23/11"
--   "Dionata · entrou 8h52 · 4 leads (1 herdado) · 12 atend. · 6 ligações · 2 avanços · 1 visita
--    Ryan · não entrou · 0 leads · 0 atend. · 0 ligações"
--
-- ── De onde vem cada número ─────────────────────────────────────────────────
--   As mesmas regras do fechamento do dia do Pulse (pulse_resumo_dia) e do
--   painel "Equipe agora" do Dashboard, para os números baterem entre as telas:
--   • entrou      — entradas_do_dia (099), hora de São Paulo
--   • leads       — lead_assignments do dia para o corretor; "herdado" =
--                   reason sla_recapture (prazo vencido com outro corretor)
--   • atend.      — lead_interactions do dia feitas por ele, menos mudança de
--                   etapa (a coluna "Atend." do painel)
--   • ligações    — call_logs com conta_meta (as que contam para a meta)
--   • avanços     — lead_interactions do tipo stage_change feitas por ele
--   • visitas     — tarefas de visita criadas no dia para ele
--   • vendas      — vendas lançadas no dia
--   Avanços, visitas e vendas só aparecem quando passam de zero.
--
-- ── Quando ──────────────────────────────────────────────────────────────────
--   20h fixas, nos dias ligados na agenda de Leads › Configurações (hoje,
--   segunda a sexta). Uma vez por dia (tabela resumos_do_dia). Janela de 10
--   minutos: se o agendador não rodar às 20h, sai até 20h10; depois, não.
--   Quem entra na lista: os mesmos do aviso de entrada (ativos, não admin,
--   sem o "E2E Tester").

CREATE TABLE IF NOT EXISTS public.resumos_do_dia (
  dia          date        PRIMARY KEY,
  enviado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resumos_do_dia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resumos_do_dia FROM PUBLIC, anon, authenticated;

-- O texto do resumo de um dia (uma linha por corretor). Separado do envio para
-- poder ser conferido sem mandar aviso.
CREATE OR REPLACE FUNCTION public.resumo_do_dia_texto(p_dia date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH
  b AS (
    SELECT (p_dia::timestamp AT TIME ZONE 'America/Sao_Paulo')       AS ini,
           ((p_dia + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS fim
  ),
  cor AS (
    SELECT p.id, split_part(trim(p.name), ' ', 1) AS nome, p.name
    FROM profiles p
    WHERE p.active AND p.role <> 'admin' AND p.name <> 'E2E Tester'
  ),
  ent AS (
    SELECT user_id, entrou_em FROM entradas_do_dia WHERE dia = p_dia
  ),
  rec AS (
    SELECT a.to_broker_id AS id, count(*)::int AS leads,
           count(*) FILTER (WHERE a.reason = 'sla_recapture')::int AS herdados
    FROM lead_assignments a, b
    WHERE a.created_at >= b.ini AND a.created_at < b.fim AND a.to_broker_id IS NOT NULL
    GROUP BY 1
  ),
  inter AS (
    SELECT li.broker_id AS id,
           count(*) FILTER (WHERE li.type <> 'stage_change')::int AS atend,
           count(*) FILTER (WHERE li.type =  'stage_change')::int AS avancos
    FROM lead_interactions li, b
    WHERE li.interacted_at >= b.ini AND li.interacted_at < b.fim AND li.broker_id IS NOT NULL
    GROUP BY 1
  ),
  lig AS (
    SELECT cl.broker_id AS id, count(*)::int AS n
    FROM call_logs cl, b
    WHERE cl.called_at >= b.ini AND cl.called_at < b.fim AND cl.conta_meta
    GROUP BY 1
  ),
  vis AS (
    SELECT t.assigned_to_id AS id, count(*)::int AS n
    FROM tasks t, b
    WHERE t.category = 'visita' AND t.created_at >= b.ini AND t.created_at < b.fim
    GROUP BY 1
  ),
  ven AS (
    SELECT s.broker_id AS id, count(*)::int AS n
    FROM sales s, b
    WHERE s.created_at >= b.ini AND s.created_at < b.fim
    GROUP BY 1
  ),
  linhas AS (
    SELECT c.name,
      concat_ws(' · ',
        c.nome,
        CASE WHEN e.entrou_em IS NULL THEN 'não entrou'
             ELSE 'entrou ' || regexp_replace(
                    to_char(e.entrou_em AT TIME ZONE 'America/Sao_Paulo', 'FMHH24"h"MI'), 'h00$', 'h') END,
        COALESCE(r.leads, 0) || CASE WHEN COALESCE(r.leads, 0) = 1 THEN ' lead' ELSE ' leads' END
          || CASE WHEN COALESCE(r.herdados, 0) = 1 THEN ' (1 herdado)'
                  WHEN COALESCE(r.herdados, 0) > 1 THEN ' (' || r.herdados || ' herdados)'
                  ELSE '' END,
        COALESCE(i.atend, 0) || ' atend.',
        COALESCE(l.n, 0) || CASE WHEN COALESCE(l.n, 0) = 1 THEN ' ligação' ELSE ' ligações' END,
        CASE WHEN COALESCE(i.avancos, 0) = 1 THEN '1 avanço'
             WHEN COALESCE(i.avancos, 0) > 1 THEN i.avancos || ' avanços' END,
        CASE WHEN COALESCE(v.n, 0) = 1 THEN '1 visita'
             WHEN COALESCE(v.n, 0) > 1 THEN v.n || ' visitas' END,
        CASE WHEN COALESCE(s.n, 0) = 1 THEN '1 venda'
             WHEN COALESCE(s.n, 0) > 1 THEN s.n || ' vendas' END
      ) AS linha
    FROM cor c
    LEFT JOIN ent   e ON e.user_id = c.id
    LEFT JOIN rec   r ON r.id = c.id
    LEFT JOIN inter i ON i.id = c.id
    LEFT JOIN lig   l ON l.id = c.id
    LEFT JOIN vis   v ON v.id = c.id
    LEFT JOIN ven   s ON s.id = c.id
  )
SELECT string_agg(linha, E'\n' ORDER BY name) FROM linhas
$function$;

CREATE OR REPLACE FUNCTION public.avisar_resumo_do_dia(p_agora timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tz       constant text := 'America/Sao_Paulo';
  hora     constant time := '20:00';
  janela   constant interval := interval '10 minutes';
  v_local  timestamp := p_agora AT TIME ZONE tz;
  v_dia    date := v_local::date;
  v_dow    int := EXTRACT(DOW FROM v_local)::int;
  v_agenda jsonb;
  v_corpo  text;
  v_titulo text;
BEGIN
  IF v_local::time < hora OR v_local::time >= hora + janela THEN
    RETURN false;  -- fora da janela
  END IF;

  SELECT schedule -> v_dow INTO v_agenda FROM lead_sla_config WHERE id = 1;
  IF v_agenda IS NULL OR NOT COALESCE((v_agenda ->> 'on')::boolean, false) THEN
    RETURN false;  -- dia sem expediente
  END IF;

  -- Marca o dia antes de avisar: duas execuções juntas não avisam duas vezes.
  INSERT INTO resumos_do_dia (dia, enviado_em) VALUES (v_dia, p_agora)
  ON CONFLICT (dia) DO NOTHING;
  IF NOT FOUND THEN
    RETURN false;  -- já enviado hoje
  END IF;

  v_corpo := resumo_do_dia_texto(v_dia);
  IF v_corpo IS NULL THEN
    RETURN false;  -- nenhum corretor ativo
  END IF;

  v_titulo := 'Resumo do dia · '
    || (ARRAY['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[v_dow + 1]
    || ', ' || to_char(v_dia, 'DD/MM');

  INSERT INTO notifications (user_id, type, title, body, resource_id, resource_type, read)
  SELECT p.id, 'broker_summary', v_titulo, v_corpo, NULL, 'corretor', false
  FROM profiles p
  WHERE p.role = 'admin' AND p.active;

  RETURN true;
END $function$;

-- Só o agendador chama.
REVOKE ALL ON FUNCTION public.resumo_do_dia_texto(date)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.avisar_resumo_do_dia(timestamptz)        FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('avisar-resumo-do-dia')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'avisar-resumo-do-dia');
SELECT cron.schedule('avisar-resumo-do-dia', '* * * * *', 'SELECT public.avisar_resumo_do_dia()');
