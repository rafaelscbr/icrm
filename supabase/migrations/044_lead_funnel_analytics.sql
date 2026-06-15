-- 044: RPC lead_funnel_analytics — conversão real do funil principal
--
-- Baseada nos eventos estruturados (lead_interactions.stage_change com
-- from_stage/to_stage). "Alcançou a etapa X" = o lead esteve em X em algum
-- momento (qualquer evento com to_stage=X ou from_stage=X, ou a etapa atual),
-- então lida corretamente com leads que pulam ou voltam de etapa.
--
-- Respeita o modelo de visão (p_broker_id) e filtra a coorte por período de
-- criação do lead (p_start / p_end, opcionais).
--
-- Retorna: funil (alcançados + tempo médio por etapa), conversão por origem
-- e por corretor (contagem de alcançados por etapa → a UI calcula as taxas).

create or replace function public.lead_funnel_analytics(
  p_broker_id uuid  default null,
  p_start     date  default null,
  p_end       date  default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
with
  sc as (
    select
      (is_admin() and p_broker_id is null) as all_scope,
      case
        when is_admin() and p_broker_id is null then null::uuid
        when is_admin()                          then p_broker_id
        else auth.uid()
      end as broker
  ),
  base_leads as (
    select l.id, l.origin, l.broker_id, l.funnel_stage, l.created_at
    from leads l, sc
    where (sc.all_scope or l.broker_id = sc.broker)
      and (p_start is null or (l.created_at at time zone 'America/Sao_Paulo')::date >= p_start)
      and (p_end   is null or (l.created_at at time zone 'America/Sao_Paulo')::date <= p_end)
  ),
  stages(stage, ord) as (
    values ('lead',0),('followup',1),('atendimento',2),('visita',3),('proposta',4),('venda',5)
  ),

  -- Etapas que cada lead alcançou (união de from/to dos eventos + etapa atual)
  reached as (
    select distinct lead_id, stage from (
      select bl.id as lead_id, bl.funnel_stage as stage from base_leads bl
      union
      select li.lead_id, li.to_stage   from lead_interactions li
        join base_leads bl on bl.id = li.lead_id
        where li.type = 'stage_change' and li.to_stage is not null
      union
      select li.lead_id, li.from_stage from lead_interactions li
        join base_leads bl on bl.id = li.lead_id
        where li.type = 'stage_change' and li.from_stage is not null
    ) u
  ),
  reached_meta as (
    select r.lead_id, r.stage, bl.origin, bl.broker_id
    from reached r join base_leads bl on bl.id = r.lead_id
  ),

  -- Tempo em etapa: linha do tempo (criação + cada entrada de etapa)
  timeline as (
    select li.lead_id, li.to_stage as stage, li.interacted_at as entered_at
    from lead_interactions li join base_leads bl on bl.id = li.lead_id
    where li.type = 'stage_change' and li.to_stage is not null
    union all
    select bl.id,
      coalesce(
        (select li2.from_stage from lead_interactions li2
          where li2.lead_id = bl.id and li2.type = 'stage_change' and li2.from_stage is not null
          order by li2.interacted_at asc limit 1),
        bl.funnel_stage),
      bl.created_at
    from base_leads bl
  ),
  timeline2 as (
    select lead_id, stage, entered_at,
      lead(entered_at) over (partition by lead_id order by entered_at) as left_at
    from timeline
  ),
  avg_days as (
    select stage, round(avg(extract(epoch from (coalesce(left_at, now()) - entered_at)) / 86400.0)::numeric, 1) as d
    from timeline2 where stage is not null group by stage
  ),

  -- Agregações por origem / corretor
  origin_total as (select origin, count(*)::int as total from base_leads group by origin),
  origin_stage as (select origin, stage, count(distinct lead_id)::int as cnt from reached_meta group by origin, stage),
  broker_total as (select broker_id, count(*)::int as total from base_leads group by broker_id),
  broker_stage as (select broker_id, stage, count(distinct lead_id)::int as cnt from reached_meta group by broker_id, stage)

select jsonb_build_object(
  'totalLeads', (select count(*)::int from base_leads),
  'funnel', (
    select jsonb_agg(jsonb_build_object(
      'stage',   s.stage,
      'reached', (select count(*)::int from reached r where r.stage = s.stage),
      'avgDays', (select d from avg_days a where a.stage = s.stage)
    ) order by s.ord)
    from stages s
  ),
  'byOrigin', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'origin', ot.origin,
      'total',  ot.total,
      'stages', (select coalesce(jsonb_object_agg(os.stage, os.cnt), '{}'::jsonb)
                   from origin_stage os where os.origin = ot.origin)
    ) order by ot.total desc), '[]'::jsonb)
    from origin_total ot
  ),
  'byBroker', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'brokerId', bt.broker_id,
      'name',     coalesce(p.name, '—'),
      'total',    bt.total,
      'stages',   (select coalesce(jsonb_object_agg(bs.stage, bs.cnt), '{}'::jsonb)
                     from broker_stage bs where bs.broker_id is not distinct from bt.broker_id)
    ) order by bt.total desc), '[]'::jsonb)
    from broker_total bt left join profiles p on p.id = bt.broker_id
  )
)
$$;

grant execute on function public.lead_funnel_analytics(uuid, date, date) to authenticated;
