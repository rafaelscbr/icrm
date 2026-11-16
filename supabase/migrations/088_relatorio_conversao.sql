-- 088 · Relatório de conversão do funil (Leads > Conversão refeita)
--
-- A lead_funnel_analytics (043/057) respondia outra pergunta: tirava os
-- descartados da conta, filtrava pela data de ENTRADA do lead e creditava o
-- dono atual. Esta função nova responde as duas perguntas que a tela precisa:
--
--   p_mode = 'atividade'  → o que ACONTECEU no período: quantos leads entraram
--                            em cada etapa entre p_start e p_end, creditados a
--                            QUEM fez o avanço. Mede o trabalho do corretor.
--   p_mode = 'safra'      → dos leads que CHEGARAM no período, até onde foram
--                            (até hoje), creditados ao dono atual. Mede a
--                            qualidade do lead / da campanha.
--
-- Regras, iguais nos dois modos:
--   • Lead descartado CONTA. Ele entrou, foi trabalhado e saiu — tirar da
--     conta infla a taxa.
--   • Entrar numa etapa = um avanço que cruza a etapa. Quem pula de
--     Atendimento para Proposta também entrou em Visita.
--   • Cada lead conta UMA vez por etapa (voltar e avançar de novo não dobra).
--   • Avanço desfeito em até 30 min não conta (arraste por engano) — a mesma
--     regra do envio ao Meta (087). Se o card foi a Venda e voltou para Visita
--     em seguida, vale até Visita.
--   • Venda concluída pelo formulário (closed_at + sale_id) conta como venda,
--     mesmo sem mudança de etapa gravada.
--   • Lead criado já numa etapa adiantada (ex.: prospecção por ligação entra
--     em Atendimento) entrou nessa etapa na data de criação.
--   • Datas no fuso de São Paulo. Semana = domingo → sábado.
--
-- Escopo: admin sem p_broker_id vê a imobiliária; admin com p_broker_id vê
-- aquele corretor (inclusive ele mesmo); corretor comum vê sempre o próprio.
-- SECURITY INVOKER: a RLS continua valendo.
--
-- Não altera nem remove a lead_funnel_analytics.

CREATE OR REPLACE FUNCTION public.lead_conversion_report(
  p_broker_id uuid DEFAULT NULL,
  p_start     date DEFAULT NULL,
  p_end       date DEFAULT NULL,
  p_mode      text DEFAULT 'atividade',
  p_bucket    text DEFAULT 'week'
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
with
  sc as (
    select (is_admin() and p_broker_id is null) as all_scope,
           case when is_admin() then p_broker_id else auth.uid() end as broker
  ),
  st(stage, ord) as (
    values ('lead',0),('followup',1),('atendimento',2),('visita',3),('proposta',4),('venda',5)
  ),

  -- Toda mudança de etapa, com a posição de origem e de destino
  ev0 as (
    select li.lead_id, li.broker_id as actor, li.interacted_at as at, f.ord as from_ord, t.ord as to_ord
    from lead_interactions li
    join st f on f.stage = li.from_stage
    join st t on t.stage = li.to_stage
    where li.type = 'stage_change'
    union all
    -- venda concluída pelo formulário não grava mudança de etapa
    select l.id, l.broker_id, l.closed_at, s.ord, 5
    from leads l join st s on s.stage = l.funnel_stage
    where l.closed_at is not null and l.sale_id is not null and l.funnel_stage <> 'venda'
  ),
  ev as (select row_number() over () as k, e.* from ev0 e),

  -- Avanço, já descontado o que foi desfeito em até 30 min
  adv as (
    -- junção em vez de subconsulta por linha: a versão por linha levava ~3 s
    select e.lead_id, e.actor, e.at, e.from_ord,
           least(e.to_ord, coalesce(min(u.to_ord), e.to_ord)) as to_ord
    from ev e
    left join ev u on u.lead_id = e.lead_id and u.at > e.at and u.at <= e.at + interval '30 minutes'
    where e.to_ord > e.from_ord
    group by e.k, e.lead_id, e.actor, e.at, e.from_ord, e.to_ord
  ),

  -- Etapa em que cada lead nasceu: a origem da 1ª mudança, ou a etapa atual
  prim as (select distinct on (lead_id) lead_id, from_ord from ev order by lead_id, at),
  ini as (
    select l.id as lead_id, l.broker_id as owner, l.created_at, coalesce(p.from_ord, cs.ord) as ord
    from leads l
    join st cs on cs.stage = l.funnel_stage
    left join prim p on p.lead_id = l.id
  ),

  -- Uma linha por etapa cruzada: pelos avanços e pela criação
  cruz as (
    select a.lead_id, a.actor, a.at, s.stage, s.ord
    from adv a join st s on s.ord > a.from_ord and s.ord <= a.to_ord
    union all
    select i.lead_id, i.owner, i.created_at, s.stage, s.ord
    from ini i join st s on s.ord >= 1 and s.ord <= i.ord
  ),

  -- Etapa mais alta que cada lead já cruzou
  cmax as (select lead_id, max(ord) as ord from cruz group by lead_id),

  -- Leads no escopo (dono atual)
  lds as (
    select l.id, l.origin, l.broker_id as owner, l.created_at, l.funnel_stage, l.closed_at,
           l.discard_reason, l.discarded_at,
           (l.created_at   at time zone 'America/Sao_Paulo')::date as cdate,
           (l.discarded_at at time zone 'America/Sao_Paulo')::date as ddate
    from leads l, sc
    where sc.all_scope or l.broker_id = sc.broker
  ),
  -- Recebidos no período
  rec as (
    select * from lds
    where (p_start is null or cdate >= p_start) and (p_end is null or cdate <= p_end)
  ),
  -- Descartados: no modo atividade, os descartados NO período; na safra, os da safra
  dsc as (
    select id, owner, origin, discard_reason from lds
    where p_mode = 'atividade' and discard_reason is not null
      and (p_start is null or ddate >= p_start) and (p_end is null or ddate <= p_end)
    union all
    select id, owner, origin, discard_reason from rec
    where p_mode = 'safra' and discard_reason is not null
  ),

  -- Entradas em etapa que valem para o relatório
  ent as (
    (
      -- atividade: 1ª entrada do lead em cada etapa dentro do período, de quem avançou
      select distinct on (c.lead_id, c.stage) c.lead_id, c.stage, c.ord, c.at, c.actor as who
      from cruz c, sc
      where p_mode = 'atividade'
        and (sc.all_scope or c.actor = sc.broker)
        and (p_start is null or (c.at at time zone 'America/Sao_Paulo')::date >= p_start)
        and (p_end   is null or (c.at at time zone 'America/Sao_Paulo')::date <= p_end)
      order by c.lead_id, c.stage, c.at
    )
    union all
    (
      -- safra: toda etapa que o lead da safra já alcançou; data = a de chegada
      select r.id, s.stage, s.ord, r.created_at, r.owner
      from rec r
      join st cs on cs.stage = r.funnel_stage
      left join cmax cm on cm.lead_id = r.id
      join st s on s.ord >= 1
               and s.ord <= greatest(
                     cs.ord,   -- etapa atual: cobre histórico que não foi gravado
                     coalesce(cm.ord, 0),
                     case when r.closed_at is not null then 5 else 0 end)
      where p_mode = 'safra'
    )
  ),

  -- Balde do gráfico. Semana começa no domingo (não usar date_trunc('week')).
  rec_b as (
    select case p_bucket when 'day' then cdate
                         when 'month' then date_trunc('month', cdate)::date
                         else cdate - extract(dow from cdate)::int end as b,
           count(*)::int as n
    from rec group by 1
  ),
  ent_b as (
    select case p_bucket when 'day' then d
                         when 'month' then date_trunc('month', d)::date
                         else d - extract(dow from d)::int end as b,
           stage, count(*)::int as n
    from (select (at at time zone 'America/Sao_Paulo')::date as d, stage from ent) x
    group by 1, 2
  ),
  baldes as (select b from rec_b union select b from ent_b),

  -- Por origem
  org as (
    select o.origin,
      (select count(*)::int from rec r where r.origin = o.origin) as received,
      (select count(*)::int from dsc d where d.origin = o.origin) as discarded,
      (select coalesce(jsonb_object_agg(q.stage, q.n), '{}'::jsonb)
         from (select e.stage, count(*)::int as n
               from ent e join leads l on l.id = e.lead_id
               where l.origin = o.origin group by e.stage) q) as stages
    from (select origin from rec union select l.origin from ent e join leads l on l.id = e.lead_id) o
  ),

  -- Por corretor: recebidos e descartados pelo dono; etapas por quem avançou
  brk as (
    select k.broker_id,
      (select count(*)::int from rec r where r.owner is not distinct from k.broker_id) as received,
      (select count(*)::int from dsc d where d.owner is not distinct from k.broker_id) as discarded,
      (select coalesce(jsonb_object_agg(q.stage, q.n), '{}'::jsonb)
         from (select e.stage, count(*)::int as n from ent e
               where e.who is not distinct from k.broker_id group by e.stage) q) as stages
    from (select owner as broker_id from rec union select who from ent union select owner from dsc) k
  )

select jsonb_build_object(
  'mode',      p_mode,
  'start',     p_start,
  'end',       p_end,
  'bucket',    p_bucket,
  'received',  (select count(*)::int from rec),
  'discarded', (select count(*)::int from dsc),
  'funnel', (
    select jsonb_agg(jsonb_build_object(
      'stage', s.stage,
      'count', (select count(*)::int from ent e where e.stage = s.stage)
    ) order by s.ord)
    from st s where s.ord >= 1
  ),
  'series', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'bucket',      b.b,
      'received',    coalesce((select n from rec_b r where r.b = b.b), 0),
      'atendimento', coalesce((select n from ent_b e where e.b = b.b and e.stage = 'atendimento'), 0),
      'visita',      coalesce((select n from ent_b e where e.b = b.b and e.stage = 'visita'), 0),
      'proposta',    coalesce((select n from ent_b e where e.b = b.b and e.stage = 'proposta'), 0),
      'venda',       coalesce((select n from ent_b e where e.b = b.b and e.stage = 'venda'), 0)
    ) order by b.b), '[]'::jsonb)
    from baldes b
  ),
  'byOrigin', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'origin', o.origin, 'received', o.received, 'discarded', o.discarded, 'stages', o.stages
    ) order by o.received desc, o.origin), '[]'::jsonb)
    from org o
  ),
  'byBroker', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'brokerId', k.broker_id, 'name', coalesce(p.name, 'Sem corretor'),
      'received', k.received, 'discarded', k.discarded, 'stages', k.stages
    ) order by k.received desc, p.name), '[]'::jsonb)
    from brk k left join profiles p on p.id = k.broker_id
  ),
  'discardReasons', (
    select coalesce(jsonb_agg(jsonb_build_object('reason', q.discard_reason, 'count', q.n) order by q.n desc), '[]'::jsonb)
    from (select discard_reason, count(*)::int as n from dsc group by 1 order by 2 desc limit 6) q
  ),
  -- Dias entre a chegada do lead e a 1ª entrada em Visita (mediana)
  'medianDaysToVisit', (
    select round((percentile_cont(0.5) within group (order by extract(epoch from (v.at - l.created_at)) / 86400.0))::numeric, 1)
    from (select e.lead_id, (select min(c.at) from cruz c where c.lead_id = e.lead_id and c.stage = 'visita') as at
          from ent e where e.stage = 'visita') v
    join leads l on l.id = v.lead_id
  ),
  -- Desde quando existe histórico de mudança de etapa
  'historySince', (select (min(interacted_at) at time zone 'America/Sao_Paulo')::date
                   from lead_interactions where type = 'stage_change')
)
$function$;

REVOKE ALL ON FUNCTION public.lead_conversion_report(uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_conversion_report(uuid, date, date, text, text) TO authenticated;
