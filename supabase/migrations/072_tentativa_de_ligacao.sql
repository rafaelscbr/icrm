-- 072: Tentativa de ligação — o desfecho passa a ter grupo, e o grupo manda
--
-- Duas correções na mesma régua.
--
-- 1. NOME. O sistema não sabe que a ligação aconteceu. Não existe URL que
--    inicie chamada de WhatsApp: o que ele observa é o corretor CLICANDO.
--    Chamar isso de "ligação feita" faz o relatório afirmar mais do que se
--    observou. Passa a ser TENTATIVA em toda a régua — botão, KPI e histórico.
--
-- 2. GRUPO. Os desfechos viviam num balaio só, e por isso "não atendeu" e
--    "número inválido" caíam na mesma conta. São problemas opostos: um é
--    cadência (ligar de novo mais tarde), o outro é qualidade da base (não
--    adianta ligar nunca mais). Misturados, a taxa de atendimento vira média
--    de coisas que não se somam.
--
-- Os três grupos, e o que cada um significa para o número:
--
--   FALOU COM A PESSOA   interessado · pediu_retorno · sem_interesse · nao_perturbe
--                        houve conversa. É o numerador da taxa de contato.
--
--   NÃO CONVERSOU        nao_atendeu · caixa_postal · atendeu_desligou
--                        a tentativa foi legítima e o esforço conta. Sem
--                        conversa. `atendeu_desligou` é novo: alcançou a
--                        pessoa e ela recusou na hora — hoje isso virava
--                        "não atendeu" e escondia uma rejeição ativa, que é
--                        informação de ABORDAGEM, não de base ruim.
--
--   NÃO FOI POSSÍVEL     numero_invalido · sem_whatsapp · telefone_desligado
--                        a ligação não chegou a existir. NÃO conta para a meta
--                        de 10/dia e sai do denominador da taxa de contato.
--
-- Decisão do Rafael (06/08/2026): tentativa que não foi possível não conta para
-- a meta do dia. O motivo é simples — bater 10 em número morto não é trabalho
-- feito. O esforço não some: aparece no relatório como "base ruim", que é um
-- problema de quem monta a lista, não de quem liga.
--
-- `sem_whatsapp` e `telefone_desligado` NÃO queimam o contato no sistema todo;
-- só `numero_invalido` faz isso, e continua sendo o único. Telefone sem
-- WhatsApp pode ser um número perfeitamente certo — só não serve para ESTE
-- canal. Marcá-lo como inválido tiraria da base um contato bom.


-- ── 1. Os desfechos novos ───────────────────────────────────────────────────
alter table public.call_logs
  drop constraint if exists call_logs_outcome_check;

alter table public.call_logs
  add constraint call_logs_outcome_check
  check (outcome = any (array[
    'discou',                        -- tentativa registrada, desfecho ainda não dito
    'nao_atendeu', 'caixa_postal', 'atendeu_desligou',
    'numero_invalido', 'sem_whatsapp', 'telefone_desligado',
    'pediu_retorno', 'sem_interesse', 'nao_perturbe', 'interessado'
  ]));


-- ── 2. O que conta para a meta, decidido UMA vez ────────────────────────────
-- Coluna gerada em vez de regra repetida: a contagem acontece em cinco lugares
-- (discador, Metas, desempenho, Pulse do dia, resumo do Pulse) e regra copiada
-- cinco vezes diverge na primeira alteração. Sendo coluna, o front filtra por
-- ela direto no PostgREST, sem precisar reescrever a regra em TypeScript.
alter table public.call_logs
  add column if not exists conta_meta boolean
  generated always as (
    outcome is distinct from 'numero_invalido'
    and outcome is distinct from 'sem_whatsapp'
    and outcome is distinct from 'telefone_desligado'
  ) stored;

comment on column public.call_logs.conta_meta is
  'Tentativa que conta como esforço de prospecção. Falso quando a ligação não chegou a existir (número inválido, sem WhatsApp, telefone desligado) — ver migração 072.';

create index if not exists idx_call_logs_meta
  on public.call_logs(broker_id, called_at)
  where conta_meta;


-- ── 3. Destino de cada desfecho ─────────────────────────────────────────────
create or replace function public.register_call_outcome(
  p_log_id      text,
  p_outcome     text,
  p_notes       text DEFAULT NULL,
  p_callback_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_log     public.call_logs%ROWTYPE;
  v_q       public.call_queue%ROWTYPE;
  v_hours   int[];
  v_max     int;
  v_espera  int;
  v_status  text;
  v_proxima timestamptz;
  v_close   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente';
  END IF;

  SELECT * INTO v_log FROM public.call_logs WHERE id = p_log_id;
  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'Registro de ligação não encontrado';
  END IF;
  IF NOT public.is_call_campaign_member(v_log.campaign_id) THEN
    RAISE EXCEPTION 'Você não participa desta campanha de ligação';
  END IF;

  UPDATE public.call_logs
     SET outcome     = p_outcome,
         notes       = coalesce(p_notes, notes),
         callback_at = p_callback_at
   WHERE id = p_log_id;

  IF v_log.queue_id IS NULL THEN
    RETURN jsonb_build_object('status', NULL);
  END IF;

  SELECT * INTO v_q FROM public.call_queue WHERE id = v_log.queue_id FOR UPDATE;
  SELECT retry_hours, max_attempts INTO v_hours, v_max
    FROM public.call_campaigns WHERE id = v_q.campaign_id;

  v_espera := v_hours[least(greatest(v_q.attempt_count, 1), array_length(v_hours, 1))];

  -- Volta pela cadência: ninguém falou, mas ainda há o que tentar.
  -- `telefone_desligado` entra aqui porque é condição TEMPORÁRIA — o aparelho
  -- desligado agora pode estar ligado amanhã. Ele não conta para a meta (é
  -- ligação que não existiu), mas continua na roda.
  IF p_outcome IN ('nao_atendeu', 'caixa_postal', 'atendeu_desligou', 'telefone_desligado') THEN
    IF v_q.attempt_count >= v_max THEN
      v_status := 'encerrado';
      v_close  := 'nao_localizado';
    ELSE
      v_status  := 'tentativa';
      v_proxima := public.next_call_window(now() + (v_espera || ' hours')::interval);
    END IF;

  ELSIF p_outcome = 'pediu_retorno' THEN
    v_status  := 'retorno_agendado';
    v_proxima := public.next_call_window(
                   coalesce(p_callback_at, now() + (v_espera || ' hours')::interval));

  ELSIF p_outcome = 'interessado' THEN
    v_status := 'interessado';

  ELSIF p_outcome = 'sem_interesse' THEN
    v_status := 'encerrado'; v_close := 'sem_interesse';

  ELSIF p_outcome = 'nao_perturbe' THEN
    v_status := 'encerrado'; v_close := 'nao_perturbe';

  -- Encerra na campanha SEM queimar o contato: o número pode estar certo, só
  -- não serve para um canal que só existe dentro do WhatsApp.
  ELSIF p_outcome = 'sem_whatsapp' THEN
    v_status := 'encerrado'; v_close := 'sem_whatsapp';

  ELSIF p_outcome = 'numero_invalido' THEN
    v_status := 'encerrado'; v_close := 'numero_invalido';
    UPDATE public.contacts SET invalid_contact = true, updated_at = now()
     WHERE id = v_q.contact_id;

  ELSE
    v_status := v_q.status;
  END IF;

  UPDATE public.call_queue
     SET status          = v_status,
         next_attempt_at = v_proxima,
         last_outcome    = p_outcome,
         close_reason    = coalesce(v_close, close_reason),
         notes           = coalesce(p_notes, notes),
         claimed_by      = NULL,
         claimed_until   = NULL,
         updated_at      = now()
   WHERE id = v_q.id;

  RETURN jsonb_build_object('status', v_status, 'proximaTentativa', v_proxima);
END $function$;

revoke execute on function public.register_call_outcome(text, text, text, timestamptz) from public, anon;
grant  execute on function public.register_call_outcome(text, text, text, timestamptz) to authenticated;


-- ── 4. O desempenho passa a girar em torno dos grupos ───────────────────────
-- A régua que a tela conta, em ordem, e por que cada degrau existe:
--
--   tentativas  todo clique. É o esforço bruto.
--   validas     tentativas que chegaram a ser ligação. Denominador honesto.
--   alcancou    falou + atendeu_desligou. Chegou na pessoa.
--   falou       houve conversa. É daqui que sai interesse.
--   baseRuim    o que não foi possível. Não é culpa de quem liga.
--   semDesfecho quem clicou e não disse o que houve — sem isto, toda taxa
--               acima seria média sobre amostra encolhida em silêncio.
create or replace function public.call_performance(
  p_campaign_id text DEFAULT NULL,
  p_desde       date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH b AS (
    SELECT coalesce(p_desde, ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29)) AS desde,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date                            AS hoje
  ),
  logs AS (
    SELECT cl.*, (cl.called_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
      FROM public.call_logs cl CROSS JOIN b
     WHERE (p_campaign_id IS NULL OR cl.campaign_id = p_campaign_id)
       AND (cl.called_at AT TIME ZONE 'America/Sao_Paulo')::date >= b.desde
       AND auth.uid() IS NOT NULL
  ),
  por_broker AS (
    SELECT
      broker_id,
      count(*)::int                                                            AS tentativas,
      count(*) FILTER (WHERE conta_meta)::int                                  AS validas,
      count(DISTINCT contact_id)::int                                          AS contatos,
      count(*) FILTER (WHERE outcome IN ('pediu_retorno','interessado',
                                         'sem_interesse','nao_perturbe'))::int AS falou,
      count(*) FILTER (WHERE outcome IN ('pediu_retorno','interessado',
                                         'sem_interesse','nao_perturbe',
                                         'atendeu_desligou'))::int             AS alcancou,
      count(*) FILTER (WHERE outcome = 'interessado')::int                     AS interessados,
      count(*) FILTER (WHERE NOT conta_meta)::int                              AS base_ruim,
      count(*) FILTER (WHERE outcome = 'discou')::int                          AS sem_desfecho,
      count(*) FILTER (WHERE dia = (SELECT hoje FROM b) AND conta_meta)::int    AS hoje
    FROM logs WHERE broker_id IS NOT NULL GROUP BY broker_id
  ),
  transferidos AS (
    SELECT cl.broker_id, count(DISTINCT q.id)::int AS qtd
      FROM public.call_queue q
      JOIN public.call_logs cl ON cl.queue_id = q.id
     WHERE q.transferred_to_lead_id IS NOT NULL
       AND (p_campaign_id IS NULL OR q.campaign_id = p_campaign_id)
       AND auth.uid() IS NOT NULL
     GROUP BY cl.broker_id
  ),
  vendas AS (
    SELECT cl.broker_id,
           count(DISTINCT l.id)::int              AS qtd,
           coalesce(sum(l.won_value), 0)::numeric AS valor
      FROM public.call_queue q
      JOIN public.leads l      ON l.id = q.transferred_to_lead_id
      JOIN public.call_logs cl ON cl.queue_id = q.id
     WHERE l.closed_at IS NOT NULL
       AND (p_campaign_id IS NULL OR q.campaign_id = p_campaign_id)
       AND auth.uid() IS NOT NULL
     GROUP BY cl.broker_id
  ),
  -- "Produtiva" é a hora que gera conversa, não a que gera clique. Só tentativa
  -- válida entra: hora cheia de número morto não é hora ruim de ligar.
  por_hora AS (
    SELECT extract(hour FROM (called_at AT TIME ZONE 'America/Sao_Paulo'))::int    AS h,
           count(*) FILTER (WHERE conta_meta)::int                                 AS tentativas,
           count(*) FILTER (WHERE outcome IN ('pediu_retorno','interessado'))::int AS produtivas
      FROM logs GROUP BY 1
  ),
  por_dia AS (
    SELECT dia,
           count(*) FILTER (WHERE conta_meta)::int AS tentativas
      FROM logs GROUP BY dia
  ),
  -- O retrato do grupo, para a tela não ter de somar corretor a corretor.
  por_grupo AS (
    SELECT
      count(*) FILTER (WHERE outcome IN ('pediu_retorno','interessado',
                                         'sem_interesse','nao_perturbe'))::int AS falou,
      count(*) FILTER (WHERE outcome IN ('nao_atendeu','caixa_postal',
                                         'atendeu_desligou'))::int             AS nao_conversou,
      count(*) FILTER (WHERE NOT conta_meta)::int                              AS base_ruim,
      count(*) FILTER (WHERE outcome = 'discou')::int                          AS sem_desfecho
    FROM logs
  )
  SELECT jsonb_build_object(
    'desde', (SELECT desde FROM b),
    'corretores', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'brokerId',     pb.broker_id,
        'nome',         pr.name,
        'tentativas',   pb.tentativas,
        'validas',      pb.validas,
        'contatos',     pb.contatos,
        'alcancou',     pb.alcancou,
        'falou',        pb.falou,
        'interessados', pb.interessados,
        'baseRuim',     pb.base_ruim,
        'semDesfecho',  pb.sem_desfecho,
        'hoje',         pb.hoje,
        'transferidos', coalesce(t.qtd, 0),
        'vendas',       coalesce(v.qtd, 0),
        'vgl',          coalesce(v.valor, 0)
      ) ORDER BY pb.validas DESC)
      FROM por_broker pb
      LEFT JOIN public.profiles pr ON pr.id = pb.broker_id
      LEFT JOIN transferidos t     ON t.broker_id = pb.broker_id
      LEFT JOIN vendas v           ON v.broker_id = pb.broker_id
    ), '[]'::jsonb),
    'grupos', (SELECT jsonb_build_object(
                 'falou',        g.falou,
                 'naoConversou', g.nao_conversou,
                 'baseRuim',     g.base_ruim,
                 'semDesfecho',  g.sem_desfecho) FROM por_grupo g),
    'porHora', coalesce((
      SELECT jsonb_agg(jsonb_build_object('hora', h, 'tentativas', tentativas, 'produtivas', produtivas)
             ORDER BY h) FROM por_hora
    ), '[]'::jsonb),
    'porDia', coalesce((
      SELECT jsonb_agg(jsonb_build_object('dia', dia, 'tentativas', tentativas) ORDER BY dia) FROM por_dia
    ), '[]'::jsonb)
  );
$function$;

revoke execute on function public.call_performance(text, date) from public, anon;
grant  execute on function public.call_performance(text, date) to authenticated;


-- ── 5. O Pulse conta a mesma coisa que o discador ───────────────────────────
-- Sem isto o quiosque mostraria 12 ligações no dia enquanto o corretor vê 9 na
-- meta dele — e painel que discorda do próprio sistema deixa de ser consultado.
-- Só a leitura do dia é filtrada; o feed ao vivo continua mostrando a tentativa
-- no instante do clique, porque naquele momento o desfecho ainda não foi dito.
--
-- Troca verificada sobre a definição vigente: as duas funções são grandes e
-- pertencem ao Pulse, não a este módulo. Reescrevê-las inteiras aqui criaria
-- duas cópias para divergir. Se o texto alvo não existir exatamente, levanta
-- erro em vez de não fazer nada em silêncio.
do $do$
declare
  v_def text;
  v_alvos text[] := array[
    'from call_logs cl, b, sc
    where cl.called_at >= b.dia_inicio and cl.called_at < b.dia_fim
      and (sc.all_scope or cl.broker_id = sc.broker)',
    'from call_logs cl cross join b
    where cl.called_at >= b.day_start and cl.called_at < b.day_end
      and (is_admin() or cl.broker_id = auth.uid())'
  ];
  v_novos text[] := array[
    'from call_logs cl, b, sc
    where cl.called_at >= b.dia_inicio and cl.called_at < b.dia_fim
      and cl.conta_meta
      and (sc.all_scope or cl.broker_id = sc.broker)',
    'from call_logs cl cross join b
    where cl.called_at >= b.day_start and cl.called_at < b.day_end
      and cl.conta_meta
      and (is_admin() or cl.broker_id = auth.uid())'
  ];
  v_nomes text[] := array['pulse_resumo_dia','pulse_snapshot'];
  i int;
begin
  for i in 1..array_length(v_nomes, 1) loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_nomes[i];

    if position(v_alvos[i] in v_def) = 0 then
      raise exception 'Bloco alvo não encontrado em % — nada foi alterado', v_nomes[i];
    end if;

    execute replace(v_def, v_alvos[i], v_novos[i]);
  end loop;
end $do$;
