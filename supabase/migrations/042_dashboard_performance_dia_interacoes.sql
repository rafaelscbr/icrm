-- 042: dashboard_performance ganha visão "Hoje" e a métrica "Interações"
--
-- Disparos (acionamentos) = só campanhas, 1º disparo: disparo_logs com
--   dispatch_type <> 'followup' (new + legacy).
-- Interações = TUDO em lead_interactions (qualquer type, inclui descarte/nota/
--   stage_change/whatsapp/etc.) + os follow-ups de campanha (disparo_logs
--   dispatch_type = 'followup'). As mensagens do funil principal já são
--   lead_interactions, então entram aqui.
-- Métricas calculadas para dia (hoje), semana (Dom→Sáb) e mês.

create or replace function public.dashboard_performance()
returns jsonb
language sql
stable
set search_path = public
as $function$
with b as (
  select
    d.today                                                          as ds,
    d.today                                                          as de,
    (d.today - extract(dow from d.today)::int)::date                  as ws,
    (d.today - extract(dow from d.today)::int + 6)::date              as we,
    date_trunc('month', d.today)::date                               as ms,
    (date_trunc('month', d.today) + interval '1 month - 1 day')::date as me
  from (select (now() at time zone 'America/Sao_Paulo')::date as today) d
),
m as (
  select
    p.id, p.name, p.avatar_url,

    -- ── Disparos (acionamentos): campanha, 1º disparo ──────────────────────────
    (select count(*) from disparo_logs d where d.broker_id = p.id and d.dispatch_type <> 'followup'
       and (d.fired_at at time zone 'America/Sao_Paulo')::date between b.ds and b.de) as acion_d,
    (select count(*) from disparo_logs d where d.broker_id = p.id and d.dispatch_type <> 'followup'
       and (d.fired_at at time zone 'America/Sao_Paulo')::date between b.ws and b.we) as acion_w,
    (select count(*) from disparo_logs d where d.broker_id = p.id and d.dispatch_type <> 'followup'
       and (d.fired_at at time zone 'America/Sao_Paulo')::date between b.ms and b.me) as acion_m,

    -- ── Interações: lead_interactions (tudo) + follow-ups de campanha ──────────
    (select count(*) from lead_interactions li where li.broker_id = p.id
       and (li.interacted_at at time zone 'America/Sao_Paulo')::date between b.ds and b.de)
     + (select count(*) from disparo_logs d where d.broker_id = p.id and d.dispatch_type = 'followup'
       and (d.fired_at at time zone 'America/Sao_Paulo')::date between b.ds and b.de) as inter_d,
    (select count(*) from lead_interactions li where li.broker_id = p.id
       and (li.interacted_at at time zone 'America/Sao_Paulo')::date between b.ws and b.we)
     + (select count(*) from disparo_logs d where d.broker_id = p.id and d.dispatch_type = 'followup'
       and (d.fired_at at time zone 'America/Sao_Paulo')::date between b.ws and b.we) as inter_w,
    (select count(*) from lead_interactions li where li.broker_id = p.id
       and (li.interacted_at at time zone 'America/Sao_Paulo')::date between b.ms and b.me)
     + (select count(*) from disparo_logs d where d.broker_id = p.id and d.dispatch_type = 'followup'
       and (d.fired_at at time zone 'America/Sao_Paulo')::date between b.ms and b.me) as inter_m,

    -- ── Atendimentos (tasks category=visita, done) ─────────────────────────────
    (select count(*) from tasks t where coalesce(t.assigned_to_id, t.broker_id) = p.id
       and t.category = 'visita' and t.status = 'done' and t.due_date between b.ds::text and b.de::text) as visita_d,
    (select count(*) from tasks t where coalesce(t.assigned_to_id, t.broker_id) = p.id
       and t.category = 'visita' and t.status = 'done' and t.due_date between b.ws::text and b.we::text) as visita_w,
    (select count(*) from tasks t where coalesce(t.assigned_to_id, t.broker_id) = p.id
       and t.category = 'visita' and t.status = 'done'
       and coalesce(nullif(t.due_date, ''), to_char(t.completed_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
           between b.ms::text and b.me::text) as visita_m,

    -- ── Atendimentos agendados (não cancelados) ────────────────────────────────
    (select count(*) from tasks t where coalesce(t.assigned_to_id, t.broker_id) = p.id
       and t.category = 'visita' and t.status <> 'cancelled' and t.due_date between b.ds::text and b.de::text) as visita_ag_d,
    (select count(*) from tasks t where coalesce(t.assigned_to_id, t.broker_id) = p.id
       and t.category = 'visita' and t.status <> 'cancelled' and t.due_date between b.ws::text and b.we::text) as visita_ag_w,
    (select count(*) from tasks t where coalesce(t.assigned_to_id, t.broker_id) = p.id
       and t.category = 'visita' and t.status <> 'cancelled' and t.due_date between b.ms::text and b.me::text) as visita_ag_m,

    -- ── Propostas (tasks category=proposta, done) ──────────────────────────────
    (select count(*) from tasks t where coalesce(t.assigned_to_id, t.broker_id) = p.id
       and t.category = 'proposta' and t.status = 'done' and t.due_date between b.ds::text and b.de::text) as prop_d,
    (select count(*) from tasks t where coalesce(t.assigned_to_id, t.broker_id) = p.id
       and t.category = 'proposta' and t.status = 'done' and t.due_date between b.ws::text and b.we::text) as prop_w,
    (select count(*) from tasks t where coalesce(t.assigned_to_id, t.broker_id) = p.id
       and t.category = 'proposta' and t.status = 'done'
       and coalesce(nullif(t.due_date, ''), to_char(t.completed_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
           between b.ms::text and b.me::text) as prop_m,

    -- ── Vendas + VGV ───────────────────────────────────────────────────────────
    (select count(*) from sales s where s.broker_id = p.id and s.date between b.ds::text and b.de::text) as venda_d,
    (select coalesce(sum(s.value),0) from sales s where s.broker_id = p.id and s.date between b.ds::text and b.de::text) as vgv_d,
    (select count(*) from sales s where s.broker_id = p.id and s.date between b.ws::text and b.we::text) as venda_w,
    (select coalesce(sum(s.value),0) from sales s where s.broker_id = p.id and s.date between b.ws::text and b.we::text) as vgv_w,
    (select count(*) from sales s where s.broker_id = p.id and s.date between b.ms::text and b.me::text) as venda_m,
    (select coalesce(sum(s.value),0) from sales s where s.broker_id = p.id and s.date between b.ms::text and b.me::text) as vgv_m,

    (select coalesce(jsonb_object_agg(g.category || '_' || g.period, g.target), '{}'::jsonb)
      from goals g where g.broker_id = p.id and g.active) as metas
  from profiles p, b
  where p.active = true and (is_admin() or p.id = auth.uid())
)
select jsonb_build_object(
  'day',   jsonb_build_object('start', (select ds from b), 'end', (select de from b)),
  'week',  jsonb_build_object('start', (select ws from b), 'end', (select we from b)),
  'month', jsonb_build_object('start', (select ms from b), 'end', (select me from b)),
  'brokers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'avatarUrl', m.avatar_url,
      'day', jsonb_build_object(
        'acionamentos', m.acion_d, 'interacoes', m.inter_d, 'visitas', m.visita_d, 'visitasAgendadas', m.visita_ag_d,
        'propostas', m.prop_d, 'vendas', m.venda_d, 'vgv', m.vgv_d),
      'week', jsonb_build_object(
        'acionamentos', m.acion_w, 'interacoes', m.inter_w, 'visitas', m.visita_w, 'visitasAgendadas', m.visita_ag_w,
        'propostas', m.prop_w, 'vendas', m.venda_w, 'vgv', m.vgv_w),
      'month', jsonb_build_object(
        'acionamentos', m.acion_m, 'interacoes', m.inter_m, 'visitas', m.visita_m, 'visitasAgendadas', m.visita_ag_m,
        'propostas', m.prop_m, 'vendas', m.venda_m, 'vgv', m.vgv_m),
      'goals', m.metas
    ) order by m.name)
    from m), '[]'::jsonb)
)
$function$;
