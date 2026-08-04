-- 069: o resumo de ontem vira um relatório do dia
--
-- A página "Ontem" mostrava quatro contadores. Passa a responder o que um
-- fechamento de dia precisa responder:
--
--   • quanto o funil ANDOU (avanços por etapa de destino), não só quanto entrou
--   • qual produto puxou mais lead
--   • em que hora o dia realmente aconteceu
--   • quem foi o campeão do dia, e como cada corretor se saiu
--   • o que a prospecção ativa produziu (ligações por desfecho)
--   • quantos WhatsApp saíram e quantos followups avançaram
--
-- Tudo agregado no banco, num payload de poucos KB, carregado uma vez por dia.
--
-- `ev` ganha `at`, `sub_tipo` e `lead_id` porque as novas leituras precisam de
-- hora (pico), tipo (whatsapp vs ligação) e do lead (produto).

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

  -- Eventos do dia. `broker_id is not null` nas interações descarta as notas
  -- automáticas do webhook do Meta — atendimento conta ação humana.
  ev as (
    select
      li.broker_id, 'interacao'::text as kind, li.interacted_at as at,
      li.type as sub_tipo, li.lead_id as lead_id
    from lead_interactions li, b, sc
    where li.interacted_at >= b.dia_inicio and li.interacted_at < b.dia_fim
      and li.type <> 'stage_change'
      and li.broker_id is not null
      and (sc.all_scope or li.broker_id = sc.broker)

    union all
    select l.broker_id, 'lead_novo', l.created_at, l.origin, l.id
    from leads l, b, sc
    where l.created_at >= b.dia_inicio and l.created_at < b.dia_fim
      and (sc.all_scope or l.broker_id = sc.broker)

    union all
    select t.assigned_to_id, 'visita', t.created_at, null::text, null::text
    from tasks t, b, sc
    where t.category = 'visita'
      and t.created_at >= b.dia_inicio and t.created_at < b.dia_fim
      and (sc.all_scope or coalesce(t.assigned_to_id, t.broker_id) = sc.broker)

    union all
    select s.broker_id, 'venda', s.created_at, null::text, null::text
    from sales s, b, sc
    where s.created_at >= b.dia_inicio and s.created_at < b.dia_fim
      and (sc.all_scope or s.broker_id = sc.broker)

    union all
    select cl.broker_id, 'ligacao', cl.called_at, cl.outcome, null::text
    from call_logs cl, b, sc
    where cl.called_at >= b.dia_inicio and cl.called_at < b.dia_fim
      and (sc.all_scope or cl.broker_id = sc.broker)

    -- Avanços de funil entram como evento próprio: medem o pipeline ANDANDO,
    -- que é diferente de volume de atendimento.
    union all
    select li.broker_id, 'avanco', li.interacted_at, li.to_stage, li.lead_id
    from lead_interactions li, b, sc
    where li.interacted_at >= b.dia_inicio and li.interacted_at < b.dia_fim
      and li.type = 'stage_change'
      and li.broker_id is not null
      and (sc.all_scope or li.broker_id = sc.broker)
  ),

  totais as (
    select
      count(*) filter (where kind = 'lead_novo')::int as leads_novos,
      count(*) filter (where kind = 'interacao')::int as interacoes,
      count(*) filter (where kind = 'visita')::int    as visitas,
      count(*) filter (where kind = 'ligacao')::int   as ligacoes,
      count(*) filter (where kind = 'avanco')::int    as avancos,
      count(*) filter (where kind = 'interacao' and sub_tipo = 'whatsapp')::int as whatsapp
    from ev
  ),

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

  -- ── Para onde o funil andou ─────────────────────────────────────────────────
  avancos_por_etapa as (
    select sub_tipo as etapa, count(*)::int as qtd
    from ev
    where kind = 'avanco' and sub_tipo is not null
    group by sub_tipo
  ),

  -- ── Produto que mais puxou lead ─────────────────────────────────────────────
  produto_top as (
    select coalesce(pr.name, l.property_name) as nome, count(*)::int as qtd
    from ev
    join leads l on l.id = ev.lead_id
    left join properties pr on pr.id = l.property_id
    where ev.kind = 'lead_novo'
      and coalesce(pr.name, l.property_name) is not null
    group by 1
    order by 2 desc, 1
    limit 1
  ),

  -- ── Hora em que o dia realmente aconteceu ───────────────────────────────────
  hora_pico as (
    select extract(hour from (at at time zone 'America/Sao_Paulo'))::int as hora,
           count(*)::int as qtd
    from ev
    group by 1
    order by 2 desc, 1
    limit 1
  ),

  -- ── Desfecho da prospecção ativa ────────────────────────────────────────────
  -- "Falou" é o que separa esforço de resultado: discar 200 vezes sem falar com
  -- ninguém não é um dia de prospecção.
  ligacoes_desfecho as (
    select
      count(*)::int                                                                as total,
      count(*) filter (where sub_tipo in ('discou','pediu_retorno','sem_interesse',
                                          'nao_perturbe','interessado'))::int      as falou,
      count(*) filter (where sub_tipo = 'interessado')::int                        as interessados,
      count(*) filter (where sub_tipo = 'pediu_retorno')::int                      as retornos,
      count(*) filter (where sub_tipo in ('nao_atendeu','caixa_postal'))::int      as sem_resposta
    from ev
    where kind = 'ligacao'
  ),

  por_broker as (
    select
      broker_id,
      count(*) filter (where kind = 'interacao')::int as interacoes,
      count(*) filter (where kind = 'lead_novo')::int as leads,
      count(*) filter (where kind = 'visita')::int    as visitas,
      count(*) filter (where kind = 'venda')::int     as vendas,
      count(*) filter (where kind = 'ligacao')::int   as ligacoes,
      count(*) filter (where kind = 'avanco')::int    as avancos,
      count(*)::int                                    as total
    from ev
    where broker_id is not null
    group by broker_id
  ),

  -- Campeão = maior volume de atividade. Venda desempata, porque um dia com
  -- venda vale mais que um dia com muitos cliques.
  campeao as (
    select broker_id from por_broker
    order by vendas desc, total desc
    limit 1
  )

select jsonb_build_object(
  'data', p_data,
  'hoje', jsonb_build_object(
    'leadsNovos',      (select leads_novos from totais),
    'interacoes',      (select interacoes  from totais),
    'visitasMarcadas', (select visitas     from totais),
    'mudancasEtapa',   (select avancos     from totais),
    'ligacoes',        (select ligacoes    from totais),
    'vendasQtd',       (select qtd         from vendas),
    'vendasValor',     (select valor       from vendas),
    'vendasComissao',  (select comissao    from vendas)
  ),

  'destaques', jsonb_build_object(
    'campeaoId',  (select broker_id from campeao),
    'whatsapp',   (select whatsapp  from totais),
    'avancos',    (select avancos   from totais),
    'horaPico',   (select hora      from hora_pico),
    'horaPicoQtd',(select qtd       from hora_pico),
    'produtoTop', (select jsonb_build_object('nome', nome, 'qtd', qtd) from produto_top),
    'avancosPorEtapa', coalesce(
      (select jsonb_agg(jsonb_build_object('etapa', etapa, 'qtd', qtd) order by qtd desc)
       from avancos_por_etapa),
      '[]'::jsonb
    ),
    'ligacoesDesfecho', (
      select jsonb_build_object(
        'total',        total,
        'falou',        falou,
        'interessados', interessados,
        'retornos',     retornos,
        'semResposta',  sem_resposta
      ) from ligacoes_desfecho
    )
  ),

  'corretores', coalesce(
    (select jsonb_agg(jsonb_build_object(
       'brokerId',          p.id,
       'nome',              p.name,
       'interacoesHoje',    coalesce(pb.interacoes, 0),
       'leadsHoje',         coalesce(pb.leads, 0),
       'visitasHoje',       coalesce(pb.visitas, 0),
       'vendasHoje',        coalesce(pb.vendas, 0),
       'ligacoesHoje',      coalesce(pb.ligacoes, 0),
       'avancosHoje',       coalesce(pb.avancos, 0),
       'ultimaAtividadeAt', null
     ) order by coalesce(pb.total, 0) desc, p.name)
     from profiles p
     left join por_broker pb on pb.broker_id = p.id
     where p.active
       and ((select all_scope from sc) or p.id = (select broker from sc))),
    '[]'::jsonb
  )
)
$$;

grant execute on function public.pulse_resumo_dia(date, uuid) to authenticated;
