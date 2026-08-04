-- 057: o feed do Pulse passa a mostrar NOME do lead e PRODUTO vinculado
--
-- O payload de INSERT de lead_interactions traz apenas lead_id, então o feed
-- exibia "Rafael falou no WhatsApp com lead". Buscar cada lead ao receber o
-- evento custaria uma consulta por interação — exatamente o que esta tela não
-- pode fazer. A solução é um mapa id -> {nome, produto} que viaja no snapshot
-- e se mantém sozinho: o INSERT em `leads` já carrega nome e produto.
--
-- Também expõe leadId em cada evento da timeline, para o cliente cruzar.

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
      li.lead_id                                     as lead_id,
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
      l.id, l.id, l.created_at, 'lead_novo'::text, l.broker_id, l.name,
      null::text, null::text, null::text, l.origin, l.average_ticket, null::text
    from leads l
    cross join b
    where l.created_at >= b.day_start
      and l.created_at <  b.day_end
      and (is_admin() or l.broker_id = auth.uid())

    union all

    -- vendas registradas hoje
    select
      ('sale-' || s.id), null::text, s.created_at, 'venda'::text, s.broker_id, s.property_name,
      null::text, null::text, null::text, null::text, s.value, null::text
    from sales s
    cross join b
    where s.created_at >= b.day_start
      and s.created_at <  b.day_end
      and (is_admin() or s.broker_id = auth.uid())

    union all

    -- visitas agendadas hoje
    select
      ('task-' || t.id), null::text, t.created_at, 'visita'::text,
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
      cal.id, null::text, cal.created_at, 'campanha'::text, cal.broker_id, cal.lead_name,
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

  -- ── Tempos de resposta (janela móvel de 30 dias) ────────────────────────────
  -- 30 dias, não "hoje", de propósito: com poucos leads por dia a média diária
  -- oscilaria demais para servir de diagnóstico. Tudo em MINUTOS ÚTEIS via
  -- business_minutes() — o lead do Meta que cai às 3h e é atendido às 9h07
  -- demorou 7 minutos, não 6 horas.
  --
  -- Média E mediana: nesta base a média é ~3x a mediana porque uns poucos leads
  -- esquecidos por um dia inteiro puxam tudo. Exibir só a média esconderia que
  -- a experiência típica é bem melhor que o número feio.
  t1 as (
    select business_minutes(l.created_at, l.first_contact_at) as m
    from leads l
    where l.first_contact_at is not null
      and l.created_at > now() - interval '30 days'
      and (is_admin() or l.broker_id = auth.uid())
  ),
  tempo_1o as (
    select
      count(*)::int                                                                            as amostra,
      coalesce(round(avg(m)), 0)::int                                                          as media,
      coalesce(round(percentile_cont(0.5) within group (order by m)), 0)::int                  as mediana,
      coalesce(round(100.0 * count(*) filter (where m <= 5) / nullif(count(*), 0)), 0)::int    as pct_sla
    from t1
  ),

  -- 2ª tentativa: intervalo entre o 1º e o 2º contato REAL do lead.
  -- 'nota', 'tarefa', 'stage_change' e 'discard' ficam de fora — não são
  -- conversa com o cliente.
  contatos as (
    select lead_id, interacted_at,
           row_number() over (partition by lead_id order by interacted_at) as n
    from lead_interactions
    where type in ('ligacao', 'whatsapp', 'email', 'visita', 'reuniao')
      and broker_id is not null
      and (is_admin() or broker_id = auth.uid())
  ),
  t2 as (
    select business_minutes(p.primeira, p.segunda) as m
    from (
      select lead_id,
             min(interacted_at) filter (where n = 1) as primeira,
             min(interacted_at) filter (where n = 2) as segunda
      from contatos
      where n <= 2
      group by lead_id
    ) p
    where p.segunda is not null
      and p.segunda > now() - interval '30 days'
  ),
  tempo_2a as (
    select
      count(*)::int                                                            as amostra,
      coalesce(round(avg(m)), 0)::int                                          as media,
      coalesce(round(percentile_cont(0.5) within group (order by m)), 0)::int  as mediana
    from t2
  ),

  -- ── Nome e produto de cada lead ────────────────────────────────────────────
  -- O INSERT de lead_interactions no realtime só carrega lead_id. Este mapa vai
  -- junto do snapshot (~100 linhas, poucos KB) e é mantido em memória: quando
  -- um lead novo entra, o próprio INSERT em `leads` traz nome e produto e
  -- alimenta o mapa. Resultado: o feed mostra "com Fulano · Garden Park" sem
  -- gastar uma consulta por evento.
  leads_info as (
    select
      l.id,
      l.name                                      as nome,
      coalesce(pr.name, l.property_name)          as produto
    from leads l
    left join properties pr on pr.id = l.property_id
    where l.discard_reason is null
      and l.closed_at is null
      and (is_admin() or l.broker_id = auth.uid())
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
       'leadId',        lead_id,
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

  'tempos', jsonb_build_object(
    'primeiroContato', jsonb_build_object(
      'mediaMin',     (select media   from tempo_1o),
      'medianaMin',   (select mediana from tempo_1o),
      'amostra',      (select amostra from tempo_1o),
      'pctDentroSla', (select pct_sla from tempo_1o)
    ),
    'segundaTentativa', jsonb_build_object(
      'mediaMin',   (select media   from tempo_2a),
      'medianaMin', (select mediana from tempo_2a),
      'amostra',    (select amostra from tempo_2a)
    )
  ),

  'leadsInfo', coalesce(
    (select jsonb_object_agg(id, jsonb_build_object('nome', nome, 'produto', produto))
     from leads_info),
    '{}'::jsonb
  ),

  'porHora', coalesce(
    (select jsonb_agg(c order by h) from por_hora),
    '[]'::jsonb
  )
)
$$;

grant execute on function public.pulse_snapshot() to authenticated;
