-- 103 · Funil por safra — a base da aba Leads › Conversão refeita (22/11/2026)
--
-- A aba tinha duas leituras (por atividade e por safra) e o Rafael pediu uma só,
-- mais geral: SEMPRE por safra — dos leads que CHEGARAM no período, até onde
-- foram até hoje — com filtro de período, de corretor e de PRODUTO, e com o
-- funil de cada corretor por produto lado a lado.
--
-- Por isso esta função não devolve um funil pronto: devolve um CUBO pequeno
-- (corretor × produto × balde de chegada × etapa mais alta × descartado), e a
-- tela recorta na hora, sem ir ao banco de novo, por corretor, por produto ou
-- pelos dois. Só o período muda a consulta.
--
-- Regras, as mesmas do modo safra da 088 (os números batem com o Pulse):
--   • Lead descartado CONTA — entrou, foi trabalhado e saiu.
--   • Etapa alcançada = a mais alta entre a etapa atual, os avanços gravados
--     (pulando etapa conta as do meio), a etapa em que o lead nasceu e a venda
--     concluída pelo formulário (closed_at).
--   • Avanço desfeito em até 30 min não conta (arraste por engano).
--   • Crédito: o dono atual do lead.
--   • Datas no fuso de São Paulo. Semana = domingo → sábado.
--
-- Produto = o property_name que o formulário do Meta grava; sem ele, o nome do
-- imóvel vinculado (property_id). Agrupa sem diferenciar maiúscula ("DotZero"
-- e "Dotzero" são o mesmo) e mostra a grafia mais usada. Sem nenhum dos dois:
-- "Sem produto".
--
-- Escopo: admin vê a imobiliária inteira; corretor comum vê só os próprios
-- leads. SECURITY INVOKER: a RLS continua valendo por baixo.
--
-- Não altera a lead_conversion_report (088), que o Pulse continua usando.

CREATE OR REPLACE FUNCTION public.funil_por_safra(
  p_start  date DEFAULT NULL,
  p_end    date DEFAULT NULL,
  p_bucket text DEFAULT 'week'
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
with
  sc as (select is_admin() as admin, auth.uid() as eu),
  st(stage, ord) as (
    values ('lead',0),('followup',1),('atendimento',2),('visita',3),('proposta',4),('venda',5)
  ),

  -- Leads da safra
  rec as (
    select l.id, l.broker_id as owner, l.created_at, l.closed_at, l.discard_reason,
           (l.created_at at time zone 'America/Sao_Paulo')::date as cdate,
           cs.ord as cur_ord,
           nullif(btrim(coalesce(nullif(btrim(l.property_name), ''), pr.name)), '') as pnome
    from leads l
    join st cs on cs.stage = l.funnel_stage
    left join properties pr on pr.id = l.property_id
    cross join sc
    where (sc.admin or l.broker_id = sc.eu)
      and (p_start is null or (l.created_at at time zone 'America/Sao_Paulo')::date >= p_start)
      and (p_end   is null or (l.created_at at time zone 'America/Sao_Paulo')::date <= p_end)
  ),

  -- Mudanças de etapa só dos leads da safra
  ev as (
    select row_number() over () as k, li.lead_id, li.interacted_at as at, f.ord as from_ord, t.ord as to_ord
    from lead_interactions li
    join rec r on r.id = li.lead_id
    join st f on f.stage = li.from_stage
    join st t on t.stage = li.to_stage
    where li.type = 'stage_change'
  ),
  -- Avanço, descontado o que foi desfeito em até 30 min
  adv as (
    select e.lead_id, e.at, e.from_ord,
           least(e.to_ord, coalesce(min(u.to_ord), e.to_ord)) as to_ord
    from ev e
    left join ev u on u.lead_id = e.lead_id and u.at > e.at and u.at <= e.at + interval '30 minutes'
    where e.to_ord > e.from_ord
    group by e.k, e.lead_id, e.at, e.from_ord, e.to_ord
  ),
  cmax as (select lead_id, max(to_ord) as ord from adv group by lead_id),
  -- Etapa em que o lead nasceu: a origem da 1ª mudança gravada
  prim as (select distinct on (lead_id) lead_id, from_ord from ev order by lead_id, at),
  -- 1ª vez que cruzou Visita (para o tempo até a visita)
  vis as (select lead_id, min(at) as at from adv where from_ord < 3 and to_ord >= 3 group by lead_id),

  lead_final as (
    select r.*,
           greatest(r.cur_ord, coalesce(c.ord, 0), coalesce(p.from_ord, 0),
                    case when r.closed_at is not null then 5 else 0 end) as alc,
           case when coalesce(p.from_ord, r.cur_ord) >= 3 and v.at is null then r.created_at else v.at end as visita_at,
           lower(r.pnome) as pkey,
           case p_bucket when 'day'   then r.cdate
                         when 'month' then date_trunc('month', r.cdate)::date
                         else r.cdate - extract(dow from r.cdate)::int end as b
    from rec r
    left join cmax c on c.lead_id = r.id
    left join prim p on p.lead_id = r.id
    left join vis  v on v.lead_id = r.id
  ),

  -- Dicionários: índices curtos no cubo em vez de repetir uuid e nome
  cor as (
    select k.owner, (row_number() over (order by coalesce(pf.name, 'zzz'), k.owner) - 1)::int as i,
           coalesce(pf.name, 'Sem corretor') as nome
    from (select distinct owner from lead_final) k
    left join profiles pf on pf.id = k.owner
  ),
  pro as (
    select q.pkey, (row_number() over (order by (q.pkey is null), q.n desc, q.pkey) - 1)::int as i, q.nome
    from (select pkey, count(*) as n, coalesce(mode() within group (order by pnome), 'Sem produto') as nome
          from lead_final group by pkey) q
  ),
  lf as (
    select f.*, c.i as ci, p.i as pi
    from lead_final f
    join cor c on c.owner is not distinct from f.owner
    join pro p on p.pkey  is not distinct from f.pkey
  )

select jsonb_build_object(
  'start',  p_start,
  'end',    p_end,
  'bucket', p_bucket,
  'corretores', (select coalesce(jsonb_agg(jsonb_build_object('id', owner, 'nome', nome) order by i), '[]'::jsonb) from cor),
  'produtos',   (select coalesce(jsonb_agg(jsonb_build_object('chave', pkey, 'nome', nome) order by i), '[]'::jsonb) from pro),
  -- [corretor, produto, balde, etapa mais alta (0–5), descartado (0/1), leads]
  'cubo', (
    select coalesce(jsonb_agg(jsonb_build_array(ci, pi, b, alc, d, n)), '[]'::jsonb)
    from (select ci, pi, b, alc, (discard_reason is not null)::int as d, count(*)::int as n
          from lf group by 1, 2, 3, 4, 5) x
  ),
  -- [corretor, produto, motivo, leads]
  'motivos', (
    select coalesce(jsonb_agg(jsonb_build_array(ci, pi, discard_reason, n)), '[]'::jsonb)
    from (select ci, pi, discard_reason, count(*)::int as n
          from lf where discard_reason is not null group by 1, 2, 3) x
  ),
  -- [corretor, produto, dias entre a chegada e a 1ª visita] — só quem visitou
  'visitas', (
    select coalesce(jsonb_agg(jsonb_build_array(ci, pi,
             round((extract(epoch from (visita_at - created_at)) / 86400.0)::numeric, 1))), '[]'::jsonb)
    from lf where alc >= 3 and visita_at is not null and visita_at >= created_at
  ),
  'historySince', (select (min(interacted_at) at time zone 'America/Sao_Paulo')::date
                   from lead_interactions where type = 'stage_change')
)
$function$;

REVOKE ALL ON FUNCTION public.funil_por_safra(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funil_por_safra(date, date, text) TO authenticated;
