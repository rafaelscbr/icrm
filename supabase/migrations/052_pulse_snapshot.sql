-- 052: RPC pulse_snapshot() — bootstrap único do iCRM Pulse
--
-- O Pulse é uma tela de quiosque (iPad ligado 12h/dia). Ele faz UMA chamada a
-- esta RPC ao abrir e depois vive só de eventos realtime — zero polling, zero
-- fetchAll. Esta função existe justamente para que a tela NÃO precise baixar
-- tabelas inteiras: toda a agregação acontece aqui e o retorno é um JSON de
-- poucos KB.
--
-- Regravada apenas em três momentos (ver usePulseStore):
--   1. carga da página
--   2. virada do dia (00:00) — zera os contadores de "hoje"
--   3. reconexão do socket, com cooldown de 10 min
--
-- SECURITY INVOKER + RLS: admin enxerga a empresa toda, corretor enxerga só o
-- que é dele. Mesma convenção de dashboard_overview() / dashboard_performance().

create or replace function public.pulse_snapshot()
returns jsonb
language sql
stable
set search_path = public
as $$
with
  b as (
    select
      now()                                                                                  as agora,
      (now() at time zone 'America/Sao_Paulo')::date                                          as today,
      ((now() at time zone 'America/Sao_Paulo')::date::timestamp
         at time zone 'America/Sao_Paulo')                                                    as day_start,
      (((now() at time zone 'America/Sao_Paulo')::date + 1)::timestamp
         at time zone 'America/Sao_Paulo')                                                    as day_end
  ),

  -- ── Eventos do dia ──────────────────────────────────────────────────────────
  -- União de tudo que "aconteceu hoje". Alimenta três saídas de uma vez:
  -- a timeline inicial do feed, o gráfico por hora e a última atividade de cada
  -- corretor. O cliente recebe estes eventos no MESMO formato em que recebe os
  -- eventos realtime, então existe um único renderizador para as duas fontes.
  --
  -- Vendas saem SÓ de `sales` (nunca de leads.closed_at nem da interação
  -- "Venda concluída") — concludeSale grava nas duas pontas e contar as duas
  -- duplicaria o número na tela.
  -- `li.broker_id is not null` filtra interações geradas pelo SISTEMA, não por
  -- gente: o webhook do Meta grava uma nota "Lead recebido via Meta Ads…" em
  -- todo lead que entra. Sem o filtro, cada lead novo aparecia duas vezes no
  -- feed ("Novo lead — Vanessa" + "Alguém anotou em Vanessa") e inflava o KPI
  -- de Atendimentos, que deve contar ação humana. Toda interação criada pelo
  -- app passa por requireBrokerId(), então broker_id nulo ⇒ origem automática.
  ev as (
    -- interações do funil (inclui stage_change e discard)
    select
      li.id                                          as id,
      li.interacted_at                               as at,
      (case when li.type = 'stage_change' then 'etapa' else 'interacao' end)::text as kind,
      li.broker_id                                   as broker_id,
      l.name                                         as lead_nome,
      li.from_stage                                  as from_stage,
      li.to_stage                                    as to_stage,
      li.type                                        as sub_tipo,
      null::text                                     as origem,
      null::numeric                                  as valor,
      li.description                                 as detalhe
    from lead_interactions li
    join leads l on l.id = li.lead_id
    cross join b
    where li.interacted_at >= b.day_start
      and li.interacted_at <  b.day_end
      and li.broker_id is not null
      and (is_admin() or li.broker_id = auth.uid())

    union all

    -- leads novos que entraram hoje
    select
      l.id, l.created_at, 'lead_novo'::text, l.broker_id, l.name,
      null::text, null::text, null::text, l.origin, l.average_ticket, null::text
    from leads l
    cross join b
    where l.created_at >= b.day_start
      and l.created_at <  b.day_end
      and (is_admin() or l.broker_id = auth.uid())

    union all

    -- vendas registradas hoje
    select
      ('sale-' || s.id), s.created_at, 'venda'::text, s.broker_id, s.property_name,
      null::text, null::text, null::text, null::text, s.value, null::text
    from sales s
    cross join b
    where s.created_at >= b.day_start
      and s.created_at <  b.day_end
      and (is_admin() or s.broker_id = auth.uid())

    union all

    -- visitas agendadas hoje
    select
      ('task-' || t.id), t.created_at, 'visita'::text,
      coalesce(t.assigned_to_id, t.broker_id), t.title,
      null::text, null::text, null::text, null::text, null::numeric, t.due_date
    from tasks t
    cross join b
    where t.category = 'visita'
      and t.created_at >= b.day_start
      and t.created_at <  b.day_end
      and (is_admin() or coalesce(t.assigned_to_id, t.broker_id) = auth.uid())

    union all

    -- atividade de campanha (disparo, parecer, transferência…)
    select
      cal.id, cal.created_at, 'campanha'::text, cal.broker_id, cal.lead_name,
      null::text, null::text, cal.action_type, null::text, null::numeric, null::text
    from campaign_activity_log cal
    cross join b
    where cal.created_at >= b.day_start
      and cal.created_at <  b.day_end
      and (is_admin() or cal.broker_id = auth.uid())
  ),

  -- ── KPIs do dia ─────────────────────────────────────────────────────────────
  hoje as (
    select
      count(*) filter (where kind = 'lead_novo')::int  as leads_novos,
      count(*) filter (where kind = 'interacao')::int  as interacoes,
      count(*) filter (where kind = 'visita')::int     as visitas,
      count(*) filter (where kind = 'etapa')::int      as mudancas_etapa
    from ev
  ),

  -- VGL do dia usa a data COMERCIAL da venda (sales.date), não o created_at —
  -- venda lançada hoje com data de ontem pertence a ontem no faturamento.
  vendas_hoje as (
    select
      count(*)::int                                                                    as qtd,
      coalesce(sum(s.value), 0)                                                        as valor,
      coalesce(sum(coalesce(s.commission_fixed,
                            s.value * coalesce(s.commission_pct, 0) / 100)), 0)        as comissao
    from sales s
    cross join b
    where s.date = b.today::text
      and (is_admin() or s.broker_id = auth.uid())
  ),

  -- ── Funil ativo ─────────────────────────────────────────────────────────────
  funil as (
    select l.funnel_stage, count(*)::int as cnt
    from leads l
    where l.discard_reason is null
      and l.closed_at is null
      and (is_admin() or l.broker_id = auth.uid())
    group by l.funnel_stage
  ),

  -- Pipeline quente: o que está em jogo agora (mesma base da previsão de VGL)
  negociacao as (
    select coalesce(sum(l.average_ticket), 0) as valor
    from leads l
    where l.funnel_stage in ('visita', 'proposta')
      and l.discard_reason is null
      and l.closed_at is null
      and (is_admin() or l.broker_id = auth.uid())
  ),

  -- ── Gargalos ────────────────────────────────────────────────────────────────
  sem_atendimento_hoje as (
    select count(*)::int as cnt
    from leads l
    cross join b
    where l.discard_reason is null
      and l.closed_at is null
      and l.funnel_stage <> 'venda'
      and (is_admin() or l.broker_id = auth.uid())
      and not exists (
        select 1 from lead_interactions li
        where li.lead_id = l.id
          and li.type in ('ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa')
          and li.interacted_at >= b.day_start
      )
  ),
  aguardando_48h as (
    select count(*)::int as cnt
    from leads l
    where l.discard_reason is null
      and l.closed_at is null
      and l.funnel_stage <> 'venda'
      and (is_admin() or l.broker_id = auth.uid())
      and not exists (
        select 1 from lead_interactions li
        where li.lead_id = l.id
          and li.type in ('ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa')
          and li.interacted_at >= now() - interval '48 hours'
      )
  ),
  sla_estourado as (
    select count(*)::int as cnt
    from leads l
    where l.sla_due_at < now()
      and l.first_contact_at is null
      and l.discard_reason is null
      and l.closed_at is null
      and (is_admin() or l.broker_id = auth.uid())
  ),
  tarefas_atrasadas as (
    select count(*)::int as cnt
    from tasks t
    cross join b
    where t.status = 'pending'
      and t.due_date < b.today::text
      and (is_admin() or coalesce(t.assigned_to_id, t.broker_id) = auth.uid())
  ),

  -- ── Radar de corretores ─────────────────────────────────────────────────────
  por_broker as (
    select
      broker_id,
      count(*) filter (where kind = 'interacao')::int as interacoes,
      count(*) filter (where kind = 'lead_novo')::int as leads,
      count(*) filter (where kind = 'visita')::int    as visitas,
      count(*) filter (where kind = 'venda')::int     as vendas,
      max(at)                                          as ultima
    from ev
    where broker_id is not null
    group by broker_id
  ),
  corretores as (
    select
      p.id, p.name,
      coalesce(pb.interacoes, 0) as interacoes,
      coalesce(pb.leads, 0)      as leads,
      coalesce(pb.visitas, 0)    as visitas,
      coalesce(pb.vendas, 0)     as vendas,
      pb.ultima
    from profiles p
    left join por_broker pb on pb.broker_id = p.id
    where p.active
      and (is_admin() or p.id = auth.uid())
  ),

  -- ── Gráfico por hora ────────────────────────────────────────────────────────
  horas as (
    select extract(hour from (at at time zone 'America/Sao_Paulo'))::int as h,
           count(*)::int as c
    from ev
    group by 1
  ),
  por_hora as (
    select g.h, coalesce(hh.c, 0) as c
    from generate_series(0, 23) g(h)
    left join horas hh on hh.h = g.h
  )

select jsonb_build_object(
  'agora', (select agora from b),

  'hoje', jsonb_build_object(
    'leadsNovos',      (select leads_novos    from hoje),
    'interacoes',      (select interacoes     from hoje),
    'visitasMarcadas', (select visitas        from hoje),
    'mudancasEtapa',   (select mudancas_etapa from hoje),
    'vendasQtd',       (select qtd            from vendas_hoje),
    'vendasValor',     (select valor          from vendas_hoje),
    'vendasComissao',  (select comissao       from vendas_hoje)
  ),

  'funil', coalesce(
    (select jsonb_agg(jsonb_build_object('stage', funnel_stage, 'count', cnt) order by funnel_stage)
     from funil),
    '[]'::jsonb
  ),

  'negociacao', jsonb_build_object(
    'valor', (select valor from negociacao)
  ),

  'gargalos', jsonb_build_object(
    'semAtendimentoHoje', (select cnt from sem_atendimento_hoje),
    'aguardando48h',      (select cnt from aguardando_48h),
    'slaEstourado',       (select cnt from sla_estourado),
    'tarefasAtrasadas',   (select cnt from tarefas_atrasadas)
  ),

  'corretores', coalesce(
    (select jsonb_agg(jsonb_build_object(
       'brokerId',          id,
       'nome',              name,
       'interacoesHoje',    interacoes,
       'leadsHoje',         leads,
       'visitasHoje',       visitas,
       'vendasHoje',        vendas,
       'ultimaAtividadeAt', ultima
     ) order by name)
     from corretores),
    '[]'::jsonb
  ),

  -- Timeline inicial: sem ela a tela abriria vazia e só contaria a história do
  -- dia a partir do momento em que o iPad foi ligado.
  'timeline', coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id',            id,
       'at',            at,
       'kind',          kind,
       'brokerId',      broker_id,
       'leadNome',      lead_nome,
       'fromStage',     from_stage,
       'toStage',       to_stage,
       'subTipo',       sub_tipo,
       'origem',        origem,
       'valor',         valor,
       'detalhe',       detalhe
     ) order by at desc)
     from (select * from ev order by at desc limit 40) t),
    '[]'::jsonb
  ),

  'porHora', coalesce(
    (select jsonb_agg(c order by h) from por_hora),
    '[]'::jsonb
  )
)
$$;

grant execute on function public.pulse_snapshot() to authenticated;

-- Índices de apoio: as consultas do snapshot varrem "o dia de hoje" nestas
-- colunas. Sem eles a RPC faria seq scan em lead_interactions a cada bootstrap.
create index if not exists idx_li_interacted_at   on public.lead_interactions (interacted_at desc);
create index if not exists idx_leads_created_at   on public.leads (created_at desc);
create index if not exists idx_sales_created_at   on public.sales (created_at desc);
create index if not exists idx_tasks_category_created
  on public.tasks (created_at desc) where category = 'visita';
