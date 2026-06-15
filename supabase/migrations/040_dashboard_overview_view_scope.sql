-- 040: dashboard_overview passa a respeitar o modelo de visão do admin
--
-- Assinatura nova: dashboard_overview(p_broker_id uuid default null)
--   • admin + p_broker_id NULL  → visão global (todos os corretores)
--   • admin + p_broker_id = X    → vê os dados do corretor X (inclui "Meu Desempenho")
--   • corretor (não-admin)       → sempre os próprios dados (auth.uid()),
--                                  p_broker_id é ignorado e a RLS reforça o limite
--
-- A meta de VGL permanece a da imobiliária (broker_id NULL, valor compartilhado);
-- apenas o REALIZADO e a contagem de vendas são escopados pela visão.
--
-- Remove a versão sem argumentos para evitar ambiguidade de overload.

drop function if exists public.dashboard_overview();

create or replace function public.dashboard_overview(p_broker_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
with
  -- Escopo efetivo da visão ---------------------------------------------------
  sc as (
    select
      (is_admin() and p_broker_id is null) as all_scope,
      case
        when is_admin() and p_broker_id is null then null::uuid
        when is_admin()                          then p_broker_id
        else auth.uid()
      end as broker
  ),

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
    from sales s, bounds b, sc
    where s.date between b.ms::text and b.me::text
      and (sc.all_scope or s.broker_id = sc.broker)
  ),

  -- ── Funil geral de leads ─────────────────────────────────────────────────────
  lead_funnel as (
    select l.funnel_stage, count(*)::int as cnt
    from leads l, sc
    where l.discard_reason is null
      and (sc.all_scope or l.broker_id = sc.broker)
    group by l.funnel_stage
  ),
  leads_ativos as (
    select count(*)::int as cnt
    from leads l, sc
    where l.discard_reason is null
      and l.funnel_stage <> 'venda'
      and (sc.all_scope or l.broker_id = sc.broker)
  ),

  -- ── Leads sem contato real nas últimas 48h ───────────────────────────────────
  leads_sem_interacao as (
    select count(*)::int as cnt
    from leads l, sc
    where l.discard_reason is null
      and l.funnel_stage <> 'venda'
      and (sc.all_scope or l.broker_id = sc.broker)
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
    cross join sc
    where c.status = 'active'
      and cl.situation is null
      and (
        sc.all_scope
        or c.broker_id = sc.broker
        or exists (
          select 1 from campaign_participants cp
          where cp.campaign_id = c.id and cp.broker_id = sc.broker
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
    cross join sc
    where c.status = 'active'
      and (
        sc.all_scope
        or c.broker_id = sc.broker
        or exists (
          select 1 from campaign_participants cp
          where cp.campaign_id = c.id and cp.broker_id = sc.broker
        )
      )
  ),

  -- ── Alertas ──────────────────────────────────────────────────────────────────
  tarefas_em_atraso as (
    select count(*)::int as cnt
    from tasks t, bounds b, sc
    where t.status = 'pending'
      and t.due_date < b.today::text
      and (sc.all_scope or coalesce(t.assigned_to_id, t.broker_id) = sc.broker)
  ),
  leads_congelados as (
    select count(*)::int as cnt
    from campaign_leads cl
    join campaigns c on c.id = cl.campaign_id
    cross join sc
    where c.status = 'active'
      and cl.funnel_stage in ('attended', 'scheduled', 'presentation', 'proposal')
      and cl.situation is null
      and coalesce(cl.stage_updated_at, cl.updated_at, cl.created_at) < now() - interval '2 days'
      and (
        sc.all_scope
        or c.broker_id = sc.broker
        or exists (
          select 1 from campaign_participants cp
          where cp.campaign_id = c.id and cp.broker_id = sc.broker
        )
      )
  ),
  sla_estourado as (
    select count(*)::int as cnt
    from leads l, sc
    where l.sla_due_at < now()
      and l.first_contact_at is null
      and l.discard_reason is null
      and (sc.all_scope or l.broker_id = sc.broker)
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

grant execute on function public.dashboard_overview(uuid) to authenticated;
