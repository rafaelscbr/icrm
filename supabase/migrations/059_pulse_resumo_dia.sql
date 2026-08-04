-- 059: RPC pulse_resumo_dia(data) — o balanço de um dia qualquer
--
-- O Pulse ganha uma segunda página, acessível deslizando o dedo: o resumo do
-- dia ANTERIOR. Serve para comparar "como está hoje" com "como foi ontem" sem
-- sair da tela.
--
-- Carregada SOB DEMANDA, no primeiro swipe do dia — quem nunca desliza não
-- paga a requisição. Depois fica em memória até a virada do dia.
--
-- Reaproveita o formato de `hoje` e `corretores` do pulse_snapshot para que o
-- mesmo componente (ClosingSummary) renderize as duas páginas.

create or replace function public.pulse_resumo_dia(p_data date, p_broker_id uuid default null)
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
  b as (
    select
      (p_data::timestamp at time zone 'America/Sao_Paulo')                as dia_inicio,
      ((p_data + 1)::timestamp at time zone 'America/Sao_Paulo')          as dia_fim
  ),

  -- Mesma união de eventos do pulse_snapshot, mas para o dia pedido.
  -- `broker_id is not null` nas interações filtra as notas automáticas do
  -- webhook do Meta — atendimento conta ação humana.
  ev as (
    select li.broker_id, 'interacao'::text as kind
    from lead_interactions li, b, sc
    where li.interacted_at >= b.dia_inicio and li.interacted_at < b.dia_fim
      and li.type <> 'stage_change'
      and li.broker_id is not null
      and (sc.all_scope or li.broker_id = sc.broker)

    union all
    select l.broker_id, 'lead_novo'
    from leads l, b, sc
    where l.created_at >= b.dia_inicio and l.created_at < b.dia_fim
      and (sc.all_scope or l.broker_id = sc.broker)

    union all
    select t.assigned_to_id, 'visita'
    from tasks t, b, sc
    where t.category = 'visita'
      and t.created_at >= b.dia_inicio and t.created_at < b.dia_fim
      and (sc.all_scope or coalesce(t.assigned_to_id, t.broker_id) = sc.broker)

    union all
    select s.broker_id, 'venda'
    from sales s, b, sc
    where s.created_at >= b.dia_inicio and s.created_at < b.dia_fim
      and (sc.all_scope or s.broker_id = sc.broker)
  ),

  totais as (
    select
      count(*) filter (where kind = 'lead_novo')::int as leads_novos,
      count(*) filter (where kind = 'interacao')::int as interacoes,
      count(*) filter (where kind = 'visita')::int    as visitas
    from ev
  ),

  -- VGL usa a data COMERCIAL da venda, igual ao KPI do dia no snapshot.
  vendas as (
    select
      count(*)::int                                                             as qtd,
      coalesce(sum(s.value), 0)                                                 as valor,
      coalesce(sum(coalesce(s.commission_fixed,
                            s.value * coalesce(s.commission_pct, 0) / 100)), 0) as comissao
    from sales s, sc
    where s.date = p_data::text
      and (sc.all_scope or s.broker_id = sc.broker)
  ),

  por_broker as (
    select
      broker_id,
      count(*) filter (where kind = 'interacao')::int as interacoes,
      count(*) filter (where kind = 'lead_novo')::int as leads,
      count(*) filter (where kind = 'visita')::int    as visitas,
      count(*) filter (where kind = 'venda')::int     as vendas
    from ev
    where broker_id is not null
    group by broker_id
  )

select jsonb_build_object(
  'data', p_data,
  'hoje', jsonb_build_object(
    'leadsNovos',      (select leads_novos from totais),
    'interacoes',      (select interacoes  from totais),
    'visitasMarcadas', (select visitas     from totais),
    'mudancasEtapa',   0,
    'vendasQtd',       (select qtd         from vendas),
    'vendasValor',     (select valor       from vendas),
    'vendasComissao',  (select comissao    from vendas)
  ),
  'corretores', coalesce(
    (select jsonb_agg(jsonb_build_object(
       'brokerId',          p.id,
       'nome',              p.name,
       'interacoesHoje',    coalesce(pb.interacoes, 0),
       'leadsHoje',         coalesce(pb.leads, 0),
       'visitasHoje',       coalesce(pb.visitas, 0),
       'vendasHoje',        coalesce(pb.vendas, 0),
       'ultimaAtividadeAt', null
     ) order by p.name)
     from profiles p
     left join por_broker pb on pb.broker_id = p.id
     where p.active
       and ((select all_scope from sc) or p.id = (select broker from sc))),
    '[]'::jsonb
  )
)
$$;

grant execute on function public.pulse_resumo_dia(date, uuid) to authenticated;
