-- 038: RPC dashboard_overview() — agregação central para a nova dashboard
--
-- Retorna em uma única chamada:
--   vgl           → meta central da imobiliária vs realizado do mês
--   leadFunnel    → contagem de leads ativos por etapa
--   leadsAtivos   → total de leads sem descarte e fora de 'venda'
--   leadsSemInteracao → leads sem contato real nas últimas 48h
--   campaignFunnel → funil consolidado das campanhas ativas
--   alertas       → contadores de tarefas em atraso, leads congelados, SLA estourado
--
-- SECURITY INVOKER: a RLS garante que corretor enxerga apenas seus dados;
-- admin enxerga tudo. Mesma convenção de dashboard_performance().

create or replace function public.dashboard_overview()
returns jsonb
language sql
stable
set search_path = public
as $$
with
  bounds as (
    select
      date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date                                as ms,
      (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) + interval '1 month - 1 day')::date as me,
      (now() at time zone 'America/Sao_Paulo')::date                                                           as today
  ),

  -- ── VGL ──────────────────────────────────────────────────────────────────────
  vgl_target as (
    select coalesce(
      (select target from goals where category = 'vgl' and broker_id is null limit 1),
      500000
    ) as target
  ),
  vgl_realizado as (
    select
      coalesce(sum(s.value), 0)  as realizado,
      count(*)::int               as vendas_mes
    from sales s, bounds b
    where s.date between b.ms::text and b.me::text
      and (is_admin() or s.broker_id = auth.uid())
  ),

  -- ── Funil geral de leads ─────────────────────────────────────────────────────
  lead_funnel as (
    select funnel_stage, count(*)::int as cnt
    from leads
    where discard_reason is null
      and (is_admin() or broker_id = auth.uid())
    group by funnel_stage
  ),
  leads_ativos as (
    select count(*)::int as cnt
    from leads
    where discard_reason is null
      and funnel_stage <> 'venda'
      and (is_admin() or broker_id = auth.uid())
  ),

  -- ── Leads sem contato real nas últimas 48h ───────────────────────────────────
  -- "contato real" = interação dos tipos que contam no SLA/pipeline
  leads_sem_interacao as (
    select count(*)::int as cnt
    from leads l
    where l.discard_reason is null
      and l.funnel_stage <> 'venda'
      and (is_admin() or l.broker_id = auth.uid())
      and not exists (
        select 1
        from lead_interactions li
        where li.lead_id = l.id
          and li.type in ('ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa')
          and li.interacted_at >= now() - interval '48 hours'
      )
  ),

  -- ── Funil de campanhas ativas ────────────────────────────────────────────────
  camp_funnel as (
    select cl.funnel_stage, count(*)::int as cnt
    from campaign_leads cl
    join campaigns c on c.id = cl.campaign_id
    where c.status = 'active'
      and cl.situation is null
      and (
        is_admin()
        or c.broker_id = auth.uid()
        or exists (
          select 1 from campaign_participants cp
          where cp.campaign_id = c.id and cp.broker_id = auth.uid()
        )
      )
    group by cl.funnel_stage
  ),
  camp_stats as (
    select
      count(distinct c.id)::int                                         as total_campaigns,
      count(cl.id)::int                                                  as total_leads,
      count(case when cl.funnel_stage = 'sale' then 1 end)::int         as total_sales
    from campaigns c
    join campaign_leads cl on cl.campaign_id = c.id
    where c.status = 'active'
      and (
        is_admin()
        or c.broker_id = auth.uid()
        or exists (
          select 1 from campaign_participants cp
          where cp.campaign_id = c.id and cp.broker_id = auth.uid()
        )
      )
  ),

  -- ── Alertas ──────────────────────────────────────────────────────────────────
  tarefas_em_atraso as (
    select count(*)::int as cnt
    from tasks t, bounds b
    where t.status = 'pending'
      and t.due_date < b.today::text
      and (is_admin() or coalesce(t.assigned_to_id, t.broker_id) = auth.uid())
  ),
  leads_congelados as (
    select count(*)::int as cnt
    from campaign_leads cl
    join campaigns c on c.id = cl.campaign_id
    where c.status = 'active'
      and cl.funnel_stage in ('attended', 'scheduled', 'presentation', 'proposal')
      and cl.situation is null
      and coalesce(cl.stage_updated_at, cl.updated_at, cl.created_at) < now() - interval '2 days'
      and (
        is_admin()
        or c.broker_id = auth.uid()
        or exists (
          select 1 from campaign_participants cp
          where cp.campaign_id = c.id and cp.broker_id = auth.uid()
        )
      )
  ),
  sla_estourado as (
    select count(*)::int as cnt
    from leads l
    where l.sla_due_at < now()
      and l.first_contact_at is null
      and l.discard_reason is null
      and (is_admin() or l.broker_id = auth.uid())
  )

select jsonb_build_object(
  'vgl', jsonb_build_object(
    'target',       (select target     from vgl_target),
    'realizadoMes', (select realizado  from vgl_realizado),
    'vendasMes',    (select vendas_mes from vgl_realizado)
  ),
  'leadFunnel', coalesce(
    (select jsonb_agg(jsonb_build_object('stage', funnel_stage, 'count', cnt) order by funnel_stage)
     from lead_funnel),
    '[]'::jsonb
  ),
  'leadsAtivos',          (select cnt from leads_ativos),
  'leadsSemInteracao',    (select cnt from leads_sem_interacao),
  'campaignFunnel', jsonb_build_object(
    'totalCampaigns', (select total_campaigns from camp_stats),
    'totalLeads',     (select total_leads     from camp_stats),
    'totalSales',     (select total_sales     from camp_stats),
    'stages', coalesce(
      (select jsonb_agg(jsonb_build_object('stage', funnel_stage, 'count', cnt) order by funnel_stage)
       from camp_funnel),
      '[]'::jsonb
    )
  ),
  'alertas', jsonb_build_object(
    'tarefasEmAtraso',  (select cnt from tarefas_em_atraso),
    'leadsCongelados',  (select cnt from leads_congelados),
    'slaEstourado',     (select cnt from sla_estourado)
  )
)
$$;

grant execute on function public.dashboard_overview() to authenticated;
