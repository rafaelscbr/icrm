-- 113 · Produto de entrada × produto fechado — venda cruzada no funil (24/11/2026)
--
-- O Rafael abriu o funil do San Pellegrino e viu 6 vendas, mas só 2 eram de
-- San Pellegrino: os outros leads entraram pelo anúncio do San Pellegrino e
-- fecharam Porto Velas. O funil não tinha como dizer isso, porque:
--   • a venda guardava o produto como texto livre — e a conclusão pelo Kanban,
--     sem produto no lead, gravava o NOME DO CLIENTE no lugar do produto
--     em duas vendas de setembro e outubro;
--   • o lead tem um produto só, que o corretor pode trocar na negociação — e
--     aí o produto que trouxe o lead se perderia.
--
-- Combinado com o Rafael (atribuição, do jeito que se mede no mercado):
--   • O funil SEMPRE olha pelo produto de ENTRADA — o anúncio que trouxe o
--     lead. Toda camada do trapézio é a mesma gente, então quem entrou pelo
--     San Pellegrino fica no funil do San Pellegrino do começo ao fim.
--   • A camada de Vendas se divide: fechou no próprio produto × fechou outro.
--   • No funil do produto que recebeu a venda cruzada, ela aparece como
--     ENTRADA LATERAL ("+N vindas de outras campanhas"), fora do trapézio —
--     esses leads nunca passaram pelo topo dele.
--   • "Vendido" (dinheiro) é do produto VENDIDO.
--
-- Mudanças:
--   1. sales ganha development_id / development_unit_id (a carteira).
--   2. leads ganha entry_development_id / entry_property_name: o produto de
--      entrada, gravado na chegada e congelado.
--   3. funil_por_safra: produto = o de entrada; o cubo ganha uma 7ª coluna,
--      o produto fechado de quem chegou a Venda.
--   4. Venda no funil = venda de verdade: o lead fechou (closed_at) ou está
--      na coluna Venda agora. Lead que passou por Venda e VOLTOU não conta
--      mais como venda — conta até Proposta.
--   5. Correções que o Rafael confirmou (vendas de 11/09, 16/09 e 19/10 são
--      Porto Velas; um lead em Venda que não fechou volta para Proposta).

-- ── 1. A venda aponta para a carteira ─────────────────────────────────────────
alter table public.sales
  add column if not exists development_id      text references public.developments(id)      on delete set null,
  add column if not exists development_unit_id text references public.development_units(id) on delete set null;
create index if not exists idx_sales_development on public.sales (development_id) where development_id is not null;

-- ── 2. O produto de entrada do lead, congelado ────────────────────────────────
alter table public.leads
  add column if not exists entry_development_id text references public.developments(id) on delete set null,
  add column if not exists entry_property_name  text;

-- Os leads que já existem: ninguém trocou produto até hoje (conferido em
-- 24/11/2026: 0 leads com o lançamento diferente do formulário de origem),
-- então a entrada é o produto atual. Antes do gatilho novo existir, e com o
-- gatilho da carteira desligado só durante este UPDATE: ele recalcularia o
-- preço dos leads em aberto sem tocar updated_at. Também não tocamos
-- updated_at aqui: a tela não lê estas colunas, só a função do funil.
alter table public.leads disable trigger trg_lead_produto_da_carteira;
update public.leads l
   set entry_development_id = l.development_id,
       entry_property_name  = coalesce(nullif(btrim(l.property_name), ''),
                                       (select pr.name from public.properties pr where pr.id = l.property_id))
 where l.entry_development_id is null and l.entry_property_name is null;
alter table public.leads enable trigger trg_lead_produto_da_carteira;

-- Roda DEPOIS do trg_lead_produto_da_carteira (gatilhos BEFORE seguem a ordem
-- do nome: "da_carteira" < "entrada"), então já vê o produto que veio da
-- campanha. Na chegada grava; depois disso não muda mais. Exceção: lead que
-- chegou sem produto nenhum fica com o primeiro produto que receber.
create or replace function public.lead_produto_de_entrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.entry_development_id IS NOT NULL OR OLD.entry_property_name IS NOT NULL) THEN
    NEW.entry_development_id := OLD.entry_development_id;
    NEW.entry_property_name  := OLD.entry_property_name;
    RETURN NEW;
  END IF;

  NEW.entry_development_id := NEW.development_id;
  NEW.entry_property_name  := coalesce(
    nullif(btrim(NEW.property_name), ''),
    (SELECT p.name FROM properties p WHERE p.id = NEW.property_id)
  );
  RETURN NEW;
END;
$$;

drop trigger if exists trg_lead_produto_entrada on public.leads;
create trigger trg_lead_produto_entrada
  before insert or update on public.leads
  for each row execute function public.lead_produto_de_entrada();

revoke all on function public.lead_produto_de_entrada() from public, anon, authenticated;

-- ── 5. Correções confirmadas pelo Rafael (24/11/2026) ─────────────────────────
-- Vendas ligadas a lead cujo "produto" era o nome do cliente: Porto Velas.
update public.sales
   set development_id = 'dev-porto-velas', property_name = 'Porto Velas'
 where id in ('1789158639286-q6a24ve',   -- 11/09 · R$ 825.299
              '1792426397970-ro47isj');  -- 19/10 · R$ 908.291

-- Venda de 16/09 (R$ 964.495) lançada como "San Pelegrino" e sem lead: é a do
-- lead que fechou em 23/09 — e foi Porto Velas.
update public.sales
   set development_id = 'dev-porto-velas', property_name = 'Porto Velas'
 where id = '1789599486830-tf61x4r';
update public.leads
   set sale_id = '1789599486830-tf61x4r', updated_at = now()
 where id = 'd5b4fc83-56ca-41c5-8e04-1652ac694f9d' and sale_id is null;

-- O lead em Venda que não fechou sai de Venda e volta para Proposta, com o registro no
-- histórico como o Kanban faria.
insert into public.lead_interactions (id, lead_id, type, description, interacted_at, broker_id, from_stage, to_stage)
select gen_random_uuid()::text, l.id, 'stage_change', 'Voltou para Proposta: a venda não foi fechada (correção de 24/11/2026)',
       now(), l.broker_id, 'venda', 'proposta'
  from public.leads l
 where l.id = '1b9c1278-e4c7-4839-b032-ea2884ece899' and l.funnel_stage = 'venda' and l.closed_at is null;
update public.leads
   set funnel_stage = 'proposta', updated_at = now()
 where id = '1b9c1278-e4c7-4839-b032-ea2884ece899' and funnel_stage = 'venda' and closed_at is null;

-- O resto das vendas: pelo nome. Os imóveis prontos de terceiros (Jasmim,
-- Garden Plaza…) não são da carteira e ficam sem lançamento.
update public.sales set development_id = 'dev-porto-velas'
 where development_id is null and property_name ilike 'porto velas%';
update public.sales set development_id = 'dev-san-pelegrino'
 where development_id is null and (property_name ilike 'san pel%' or property_name ilike 'lago di san pel%');
update public.sales set development_id = 'dev-rogga'
 where development_id is null and (property_name ilike 'rogga%' or property_name ilike 'itaja% urban%');

-- ── 3 e 4. Funil por safra ────────────────────────────────────────────────────
-- Mesmas regras da 103, com três mudanças:
--   • produto = o de ENTRADA (o lançamento de entrada pelo nome atual dele;
--     sem lançamento, o nome gravado na chegada; sem nada, o produto atual);
--   • Venda só com venda de verdade — fechado (closed_at) ou na coluna Venda
--     agora. Os avanços gravados e a etapa de nascimento sobem no máximo até
--     Proposta;
--   • 7ª coluna do cubo: o produto FECHADO de quem chegou a Venda (índice em
--     `produtos`; -1 para quem não chegou). Produto fechado = o lançamento da
--     venda; sem ele, o imóvel da venda; sem ele, o produto atual do lead.
--     A lista `produtos` inclui os produtos que só aparecem como fechados.

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
           nullif(btrim(coalesce(de.name, nullif(btrim(l.entry_property_name), ''),
                                 nullif(btrim(l.property_name), ''), pr.name)), '') as pnome,
           nullif(btrim(coalesce(ds.name, sp.name, nullif(btrim(l.property_name), ''), pr.name)), '') as fnome
    from leads l
    join st cs on cs.stage = l.funnel_stage
    left join properties   pr on pr.id = l.property_id
    left join developments de on de.id = l.entry_development_id
    left join sales        s  on s.id  = l.sale_id
    left join developments ds on ds.id = s.development_id
    left join properties   sp on sp.id = s.property_id
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

  lead_final0 as (
    select r.*,
           greatest(r.cur_ord, least(coalesce(c.ord, 0), 4), least(coalesce(p.from_ord, 0), 4),
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
  -- Produto fechado só para quem chegou a Venda
  lead_final as (
    select f.*, case when f.alc >= 5 then lower(coalesce(f.fnome, f.pnome)) end as fkey,
                case when f.alc >= 5 then coalesce(f.fnome, f.pnome) end as fnome_ok
    from lead_final0 f
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
    from (select pkey, sum(e)::int as n, coalesce(mode() within group (order by pnome), 'Sem produto') as nome
          from (select pkey, pnome, 1 as e from lead_final
                union all
                select fkey, fnome_ok, 0 from lead_final where alc >= 5) u
          group by pkey) q
  ),
  lf as (
    select f.*, c.i as ci, p.i as pi, coalesce(pf.i, -1) as fi
    from lead_final f
    join cor c on c.owner is not distinct from f.owner
    join pro p on p.pkey  is not distinct from f.pkey
    left join pro pf on f.alc >= 5 and pf.pkey is not distinct from f.fkey
  )

select jsonb_build_object(
  'start',  p_start,
  'end',    p_end,
  'bucket', p_bucket,
  'corretores', (select coalesce(jsonb_agg(jsonb_build_object('id', owner, 'nome', nome) order by i), '[]'::jsonb) from cor),
  'produtos',   (select coalesce(jsonb_agg(jsonb_build_object('chave', pkey, 'nome', nome) order by i), '[]'::jsonb) from pro),
  -- [corretor, produto de entrada, balde, etapa mais alta (0–5), descartado (0/1), leads, produto fechado (-1 = sem venda)]
  'cubo', (
    select coalesce(jsonb_agg(jsonb_build_array(ci, pi, b, alc, d, n, fi)), '[]'::jsonb)
    from (select ci, pi, b, alc, (discard_reason is not null)::int as d, count(*)::int as n, fi
          from lf group by 1, 2, 3, 4, 5, 7) x
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
