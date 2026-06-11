-- 031: Dashboard de desempenho — meta x realizado
--
-- 1) Nova categoria de meta 'acionamento' (disparos de 1º contato; followup não conta)
-- 2) RPC dashboard_performance(): agregados de semana e mês corrente por corretor,
--    calculados no banco em uma única chamada. SECURITY INVOKER — a RLS garante
--    que corretor enxerga apenas os próprios números e admin enxerga todos.
--
-- Convenções espelhadas do front (useGoalsStore):
--   - Semana: segunda a domingo, fuso America/Sao_Paulo
--   - Visitas/propostas realizadas na semana: apenas due_date (data real agendada)
--   - No mês: due_date ou completed_at (nunca updated_at)
--   - Visitas agendadas: qualquer status exceto cancelado
--   - Acionamentos: disparo_logs com dispatch_type <> 'followup'

alter table public.goals drop constraint if exists goals_category_check;
alter table public.goals add constraint goals_category_check
  check (category = any (array['acionamento', 'visita', 'agenciamento', 'proposta', 'venda']));

create or replace function public.dashboard_performance()
returns jsonb
language sql
stable
set search_path = public
as $$
with b as (
  select
    date_trunc('week',  (now() at time zone 'America/Sao_Paulo')::date)::date                               as ws,
    (date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date) + interval '6 days')::date          as we,
    date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date                               as ms,
    (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) + interval '1 month - 1 day')::date as me
),
m as (
  select
    p.id, p.name, p.avatar_url,
    (select count(*) from disparo_logs d
      where d.broker_id = p.id and d.dispatch_type <> 'followup'
        and (d.fired_at at time zone 'America/Sao_Paulo')::date between b.ws and b.we) as acion_w,
    (select count(*) from disparo_logs d
      where d.broker_id = p.id and d.dispatch_type <> 'followup'
        and (d.fired_at at time zone 'America/Sao_Paulo')::date between b.ms and b.me) as acion_m,
    (select count(*) from tasks t
      where coalesce(t.assigned_to_id, t.broker_id) = p.id
        and t.category = 'visita' and t.status = 'done'
        and t.due_date between b.ws::text and b.we::text) as visita_w,
    (select count(*) from tasks t
      where coalesce(t.assigned_to_id, t.broker_id) = p.id
        and t.category = 'visita' and t.status = 'done'
        and coalesce(nullif(t.due_date, ''), to_char(t.completed_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
            between b.ms::text and b.me::text) as visita_m,
    (select count(*) from tasks t
      where coalesce(t.assigned_to_id, t.broker_id) = p.id
        and t.category = 'visita' and t.status <> 'cancelled'
        and t.due_date between b.ws::text and b.we::text) as visita_ag_w,
    (select count(*) from tasks t
      where coalesce(t.assigned_to_id, t.broker_id) = p.id
        and t.category = 'visita' and t.status <> 'cancelled'
        and t.due_date between b.ms::text and b.me::text) as visita_ag_m,
    (select count(*) from tasks t
      where coalesce(t.assigned_to_id, t.broker_id) = p.id
        and t.category = 'proposta' and t.status = 'done'
        and t.due_date between b.ws::text and b.we::text) as prop_w,
    (select count(*) from tasks t
      where coalesce(t.assigned_to_id, t.broker_id) = p.id
        and t.category = 'proposta' and t.status = 'done'
        and coalesce(nullif(t.due_date, ''), to_char(t.completed_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))
            between b.ms::text and b.me::text) as prop_m,
    (select count(*) from sales s
      where s.broker_id = p.id and s.date between b.ws::text and b.we::text) as venda_w,
    (select coalesce(sum(s.value), 0) from sales s
      where s.broker_id = p.id and s.date between b.ws::text and b.we::text) as vgv_w,
    (select count(*) from sales s
      where s.broker_id = p.id and s.date between b.ms::text and b.me::text) as venda_m,
    (select coalesce(sum(s.value), 0) from sales s
      where s.broker_id = p.id and s.date between b.ms::text and b.me::text) as vgv_m,
    (select coalesce(jsonb_object_agg(g.category || '_' || g.period, g.target), '{}'::jsonb)
      from goals g where g.broker_id = p.id and g.active) as metas
  from profiles p, b
  where p.active = true and (is_admin() or p.id = auth.uid())
)
select jsonb_build_object(
  'week',  jsonb_build_object('start', (select ws from b), 'end', (select we from b)),
  'month', jsonb_build_object('start', (select ms from b), 'end', (select me from b)),
  'brokers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'avatarUrl', m.avatar_url,
      'week', jsonb_build_object(
        'acionamentos', m.acion_w, 'visitas', m.visita_w, 'visitasAgendadas', m.visita_ag_w,
        'propostas', m.prop_w, 'vendas', m.venda_w, 'vgv', m.vgv_w),
      'month', jsonb_build_object(
        'acionamentos', m.acion_m, 'visitas', m.visita_m, 'visitasAgendadas', m.visita_ag_m,
        'propostas', m.prop_m, 'vendas', m.venda_m, 'vgv', m.vgv_m),
      'goals', m.metas
    ) order by m.name)
    from m), '[]'::jsonb)
)
$$;

grant execute on function public.dashboard_performance() to authenticated;
