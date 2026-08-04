-- ─── 067: a ligação da prospecção não conta duas vezes ───────────────────────
--
-- transfer_call_lead_to_funnel() copia cada ligação para lead_interactions, com
-- a data original, para que a linha do tempo do lead novo nasça com o
-- histórico. No mesmo dia — que é o caso COMUM (ligou, gostou, transferiu) —
-- essas cópias entravam no snapshot como 'interacao' e o mesmo telefonema
-- aparecia duas vezes: uma como ligação, outra como atendimento.
--
-- O efeito no número: cada transferência inflava o KPI de Atendimentos e o
-- contador do corretor no radar. Um painel que conta a mesma ação duas vezes
-- deixa de servir para decidir qualquer coisa.
--
-- O feed já filtra pelo prefixo no cliente (isEventoRuido); aqui o mesmo corte
-- acontece na origem, onde os KPIs são somados.

create or replace function public.pulse_snapshot()
returns jsonb language sql stable set search_path = public as $fn$
with
  b as (
    select
      now() as agora,
      (now() at time zone 'America/Sao_Paulo')::date as today,
      ((now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo') as day_start,
      (((now() at time zone 'America/Sao_Paulo')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as day_end
  ),
  ev as (
    select
      li.id as id, li.lead_id as lead_id, li.interacted_at as at,
      (case when li.type = 'stage_change' then 'etapa' else 'interacao' end)::text as kind,
      li.broker_id as broker_id, l.name as lead_nome,
      li.from_stage as from_stage, li.to_stage as to_stage, li.type as sub_tipo,
      null::text as origem, null::numeric as valor, li.description as detalhe
    from lead_interactions li
    join leads l on l.id = li.lead_id
    cross join b
    where li.interacted_at >= b.day_start and li.interacted_at < b.day_end
      and li.broker_id is not null
      -- cópia da prospecção: o evento real já entra por call_logs
      and not (li.type = 'ligacao' and li.description like 'Prospecção ativa · %')
      and (is_admin() or li.broker_id = auth.uid())

    union all
    select l.id, l.id, l.created_at, 'lead_novo'::text, l.broker_id, l.name,
      null::text, null::text, null::text, l.origin, l.average_ticket, null::text
    from leads l cross join b
    where l.created_at >= b.day_start and l.created_at < b.day_end
      and (is_admin() or l.broker_id = auth.uid())

    union all
    select ('sale-' || s.id), null::text, s.created_at, 'venda'::text, s.broker_id, s.property_name,
      null::text, null::text, null::text, null::text, s.value, null::text
    from sales s cross join b
    where s.created_at >= b.day_start and s.created_at < b.day_end
      and (is_admin() or s.broker_id = auth.uid())

    union all
    select ('task-' || t.id), null::text, t.created_at, 'visita'::text,
      coalesce(t.assigned_to_id, t.broker_id), t.title,
      null::text, null::text, null::text, null::text, null::numeric, t.due_date
    from tasks t cross join b
    where t.category = 'visita'
      and t.created_at >= b.day_start and t.created_at < b.day_end
      and (is_admin() or coalesce(t.assigned_to_id, t.broker_id) = auth.uid())

    union all
    select cal.id, null::text, cal.created_at, 'campanha'::text, cal.broker_id, cal.lead_name,
      null::text, null::text, cal.action_type, null::text, null::numeric, null::text
    from campaign_activity_log cal cross join b
    where cal.created_at >= b.day_start and cal.created_at < b.day_end
      and (is_admin() or cal.broker_id = auth.uid())

    union all
    select ('call-' || cl.id), null::text, cl.called_at, 'ligacao'::text, cl.broker_id, cl.contact_name,
      null::text, null::text, cl.outcome, null::text, null::numeric, null::text
    from call_logs cl cross join b
    where cl.called_at >= b.day_start and cl.called_at < b.day_end
      and (is_admin() or cl.broker_id = auth.uid())
  ),
  hoje as (
    select
      count(*) filter (where kind = 'lead_novo')::int as leads_novos,
      count(*) filter (where kind = 'interacao')::int as interacoes,
      count(*) filter (where kind = 'visita')::int    as visitas,
      count(*) filter (where kind = 'etapa')::int     as mudancas_etapa,
      count(*) filter (where kind = 'ligacao')::int   as ligacoes
    from ev
  ),
  vendas_hoje as (
    select count(*)::int as qtd, coalesce(sum(s.value), 0) as valor,
      coalesce(sum(coalesce(s.commission_fixed, s.value * coalesce(s.commission_pct, 0) / 100)), 0) as comissao
    from sales s cross join b
    where s.date = b.today::text and (is_admin() or s.broker_id = auth.uid())
  ),
  funil as (
    select l.funnel_stage, count(*)::int as cnt from leads l
    where l.discard_reason is null and l.closed_at is null
      and (is_admin() or l.broker_id = auth.uid())
    group by l.funnel_stage
  ),
  negociacao as (
    select coalesce(sum(l.average_ticket), 0) as valor from leads l
    where l.funnel_stage in ('visita', 'proposta')
      and l.discard_reason is null and l.closed_at is null
      and (is_admin() or l.broker_id = auth.uid())
  ),
  sem_atendimento_hoje as (
    select count(*)::int as cnt from leads l cross join b
    where l.discard_reason is null and l.closed_at is null and l.funnel_stage <> 'venda'
      and (is_admin() or l.broker_id = auth.uid())
      and not exists (
        select 1 from lead_interactions li
        where li.lead_id = l.id
          and li.type in ('ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa')
          and li.interacted_at >= b.day_start)
  ),
  aguardando_48h as (
    select count(*)::int as cnt from leads l
    where l.discard_reason is null and l.closed_at is null and l.funnel_stage <> 'venda'
      and (is_admin() or l.broker_id = auth.uid())
      and not exists (
        select 1 from lead_interactions li
        where li.lead_id = l.id
          and li.type in ('ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa')
          and li.interacted_at >= now() - interval '48 hours')
  ),
  sla_estourado as (
    select count(*)::int as cnt from leads l
    where l.sla_due_at < now() and l.first_contact_at is null
      and l.discard_reason is null and l.closed_at is null
      and (is_admin() or l.broker_id = auth.uid())
  ),
  tarefas_atrasadas as (
    select count(*)::int as cnt from tasks t cross join b
    where t.status = 'pending' and t.due_date < b.today::text
      and (is_admin() or coalesce(t.assigned_to_id, t.broker_id) = auth.uid())
  ),
  por_broker as (
    select broker_id,
      count(*) filter (where kind = 'interacao')::int as interacoes,
      count(*) filter (where kind = 'lead_novo')::int as leads,
      count(*) filter (where kind = 'visita')::int    as visitas,
      count(*) filter (where kind = 'venda')::int     as vendas,
      count(*) filter (where kind = 'ligacao')::int   as ligacoes,
      max(at) as ultima
    from ev where broker_id is not null group by broker_id
  ),
  corretores as (
    select p.id, p.name,
      coalesce(pb.interacoes, 0) as interacoes, coalesce(pb.leads, 0) as leads,
      coalesce(pb.visitas, 0) as visitas, coalesce(pb.vendas, 0) as vendas,
      coalesce(pb.ligacoes, 0) as ligacoes, pb.ultima
    from profiles p
    left join por_broker pb on pb.broker_id = p.id
    where p.active and (is_admin() or p.id = auth.uid())
  ),
  t1 as (
    select business_minutes(l.created_at, l.first_contact_at) as m from leads l
    where l.first_contact_at is not null and l.created_at > now() - interval '30 days'
      and (is_admin() or l.broker_id = auth.uid())
  ),
  tempo_1o as (
    select count(*)::int as amostra, coalesce(round(avg(m)), 0)::int as media,
      coalesce(round(percentile_cont(0.5) within group (order by m)), 0)::int as mediana,
      coalesce(round(100.0 * count(*) filter (where m <= 5) / nullif(count(*), 0)), 0)::int as pct_sla
    from t1
  ),
  contatos as (
    select lead_id, interacted_at,
      row_number() over (partition by lead_id order by interacted_at) as n
    from lead_interactions
    where type in ('ligacao', 'whatsapp', 'email', 'visita', 'reuniao')
      and broker_id is not null and (is_admin() or broker_id = auth.uid())
  ),
  t2 as (
    select business_minutes(p.primeira, p.segunda) as m
    from (
      select lead_id,
        min(interacted_at) filter (where n = 1) as primeira,
        min(interacted_at) filter (where n = 2) as segunda
      from contatos where n <= 2 group by lead_id
    ) p
    where p.segunda is not null and p.segunda > now() - interval '30 days'
  ),
  tempo_2a as (
    select count(*)::int as amostra, coalesce(round(avg(m)), 0)::int as media,
      coalesce(round(percentile_cont(0.5) within group (order by m)), 0)::int as mediana
    from t2
  ),
  leads_info as (
    select l.id, l.name as nome, coalesce(pr.name, l.property_name) as produto
    from leads l left join properties pr on pr.id = l.property_id
    where l.discard_reason is null and l.closed_at is null
      and (is_admin() or l.broker_id = auth.uid())
  ),
  horas as (
    select extract(hour from (at at time zone 'America/Sao_Paulo'))::int as h, count(*)::int as c
    from ev group by 1
  ),
  por_hora as (
    select g.h, coalesce(hh.c, 0) as c
    from generate_series(0, 23) g(h) left join horas hh on hh.h = g.h
  )
select jsonb_build_object(
  'agora', (select agora from b),
  'hoje', jsonb_build_object(
    'leadsNovos',      (select leads_novos    from hoje),
    'interacoes',      (select interacoes     from hoje),
    'visitasMarcadas', (select visitas        from hoje),
    'mudancasEtapa',   (select mudancas_etapa from hoje),
    'ligacoes',        (select ligacoes       from hoje),
    'vendasQtd',       (select qtd            from vendas_hoje),
    'vendasValor',     (select valor          from vendas_hoje),
    'vendasComissao',  (select comissao       from vendas_hoje)
  ),
  'funil', coalesce((select jsonb_agg(jsonb_build_object('stage', funnel_stage, 'count', cnt) order by funnel_stage) from funil), '[]'::jsonb),
  'negociacao', jsonb_build_object('valor', (select valor from negociacao)),
  'gargalos', jsonb_build_object(
    'semAtendimentoHoje', (select cnt from sem_atendimento_hoje),
    'aguardando48h',      (select cnt from aguardando_48h),
    'slaEstourado',       (select cnt from sla_estourado),
    'tarefasAtrasadas',   (select cnt from tarefas_atrasadas)
  ),
  'corretores', coalesce((select jsonb_agg(jsonb_build_object(
       'brokerId', id, 'nome', name,
       'interacoesHoje', interacoes, 'leadsHoje', leads,
       'visitasHoje', visitas, 'vendasHoje', vendas,
       'ligacoesHoje', ligacoes, 'ultimaAtividadeAt', ultima
     ) order by name) from corretores), '[]'::jsonb),
  'timeline', coalesce((select jsonb_agg(jsonb_build_object(
       'id', id, 'leadId', lead_id, 'at', at, 'kind', kind, 'brokerId', broker_id,
       'leadNome', lead_nome, 'fromStage', from_stage, 'toStage', to_stage,
       'subTipo', sub_tipo, 'origem', origem, 'valor', valor, 'detalhe', detalhe
     ) order by at desc) from (select * from ev order by at desc limit 300) t), '[]'::jsonb),
  'tempos', jsonb_build_object(
    'primeiroContato', jsonb_build_object(
      'mediaMin', (select media from tempo_1o), 'medianaMin', (select mediana from tempo_1o),
      'amostra', (select amostra from tempo_1o), 'pctDentroSla', (select pct_sla from tempo_1o)),
    'segundaTentativa', jsonb_build_object(
      'mediaMin', (select media from tempo_2a), 'medianaMin', (select mediana from tempo_2a),
      'amostra', (select amostra from tempo_2a))
  ),
  'leadsInfo', coalesce((select jsonb_object_agg(id, jsonb_build_object('nome', nome, 'produto', produto)) from leads_info), '{}'::jsonb),
  'porHora', coalesce((select jsonb_agg(c order by h) from por_hora), '[]'::jsonb)
)
$fn$;

grant execute on function public.pulse_snapshot() to authenticated;

create or replace function public.pulse_resumo_dia(p_data date, p_broker_id uuid default null)
returns jsonb language sql stable set search_path = public as $fn$
with
  sc as (
    select (is_admin() and p_broker_id is null) as all_scope,
      case when is_admin() and p_broker_id is null then null::uuid
           when is_admin() then p_broker_id
           else auth.uid() end as broker
  ),
  b as (
    select (p_data::timestamp at time zone 'America/Sao_Paulo') as dia_inicio,
           ((p_data + 1)::timestamp at time zone 'America/Sao_Paulo') as dia_fim
  ),
  ev as (
    select li.broker_id, 'interacao'::text as kind
    from lead_interactions li, b, sc
    where li.interacted_at >= b.dia_inicio and li.interacted_at < b.dia_fim
      and li.type <> 'stage_change' and li.broker_id is not null
      and not (li.type = 'ligacao' and li.description like 'Prospecção ativa · %')
      and (sc.all_scope or li.broker_id = sc.broker)
    union all
    select l.broker_id, 'lead_novo' from leads l, b, sc
    where l.created_at >= b.dia_inicio and l.created_at < b.dia_fim
      and (sc.all_scope or l.broker_id = sc.broker)
    union all
    select t.assigned_to_id, 'visita' from tasks t, b, sc
    where t.category = 'visita'
      and t.created_at >= b.dia_inicio and t.created_at < b.dia_fim
      and (sc.all_scope or coalesce(t.assigned_to_id, t.broker_id) = sc.broker)
    union all
    select s.broker_id, 'venda' from sales s, b, sc
    where s.created_at >= b.dia_inicio and s.created_at < b.dia_fim
      and (sc.all_scope or s.broker_id = sc.broker)
    union all
    select cl.broker_id, 'ligacao' from call_logs cl, b, sc
    where cl.called_at >= b.dia_inicio and cl.called_at < b.dia_fim
      and (sc.all_scope or cl.broker_id = sc.broker)
  ),
  totais as (
    select count(*) filter (where kind = 'lead_novo')::int as leads_novos,
      count(*) filter (where kind = 'interacao')::int as interacoes,
      count(*) filter (where kind = 'visita')::int as visitas,
      count(*) filter (where kind = 'ligacao')::int as ligacoes
    from ev
  ),
  vendas as (
    select count(*)::int as qtd, coalesce(sum(s.value), 0) as valor,
      coalesce(sum(coalesce(s.commission_fixed, s.value * coalesce(s.commission_pct, 0) / 100)), 0) as comissao
    from sales s, sc
    where s.date = p_data::text and (sc.all_scope or s.broker_id = sc.broker)
  ),
  por_broker as (
    select broker_id,
      count(*) filter (where kind = 'interacao')::int as interacoes,
      count(*) filter (where kind = 'lead_novo')::int as leads,
      count(*) filter (where kind = 'visita')::int as visitas,
      count(*) filter (where kind = 'venda')::int as vendas,
      count(*) filter (where kind = 'ligacao')::int as ligacoes
    from ev where broker_id is not null group by broker_id
  )
select jsonb_build_object(
  'data', p_data,
  'hoje', jsonb_build_object(
    'leadsNovos', (select leads_novos from totais),
    'interacoes', (select interacoes from totais),
    'visitasMarcadas', (select visitas from totais),
    'mudancasEtapa', 0,
    'ligacoes', (select ligacoes from totais),
    'vendasQtd', (select qtd from vendas),
    'vendasValor', (select valor from vendas),
    'vendasComissao', (select comissao from vendas)
  ),
  'corretores', coalesce((select jsonb_agg(jsonb_build_object(
       'brokerId', p.id, 'nome', p.name,
       'interacoesHoje', coalesce(pb.interacoes, 0),
       'leadsHoje', coalesce(pb.leads, 0),
       'visitasHoje', coalesce(pb.visitas, 0),
       'vendasHoje', coalesce(pb.vendas, 0),
       'ligacoesHoje', coalesce(pb.ligacoes, 0),
       'ultimaAtividadeAt', null
     ) order by p.name)
     from profiles p left join por_broker pb on pb.broker_id = p.id
     where p.active and ((select all_scope from sc) or p.id = (select broker from sc))), '[]'::jsonb)
)
$fn$;

grant execute on function public.pulse_resumo_dia(date, uuid) to authenticated;
