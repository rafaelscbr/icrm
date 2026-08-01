-- 055: RPC dashboard_extras() — tira contacts e lead_interactions da abertura
--
-- O Dashboard é a rota "/", então tudo que ele carrega acontece em TODA
-- abertura do app. Ele baixava:
--
--   contacts           7,7 MB (12.543 linhas)  para usar ~40
--   lead_interactions  1,5 MB (4.517 linhas)   para extrair uma data por lead
--
-- Os três widgets que justificavam isso pedem agregação, não a tabela:
--
--   • aniversariantes do mês        → hoje, 0 de 12.543 contatos
--   • potencial de recompra         → 17 candidatos
--   • leads sem contato há +2 dias  → precisa só de (lead_id, dias)
--
-- Os nomes de contato exibidos em tarefas e vendas continuam vindo da tabela,
-- mas por id (db.contacts.fetchByIds) — dezenas de linhas em vez de 12.543.
--
-- SECURITY INVOKER + RLS, mesma convenção de dashboard_overview().

create or replace function public.dashboard_extras(p_broker_id uuid default null)
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

  -- ── Aniversariantes do mês ──────────────────────────────────────────────────
  aniv as (
    select c.id, c.name, c.phone, c.birthdate, c.photo_url
    from contacts c, sc
    where c.birthdate is not null
      and extract(month from c.birthdate::date) = extract(month from (now() at time zone 'America/Sao_Paulo'))
      and (sc.all_scope or c.broker_id = sc.broker)
    order by extract(day from c.birthdate::date)
  ),

  -- ── Potencial de recompra ───────────────────────────────────────────────────
  -- Clientes marcados como 'buyer' cuja ÚLTIMA compra passou de 180 dias.
  -- O escopo segue o corretor da última venda, como o widget fazia no cliente.
  vendas_por_cliente as (
    select
      s.client_id,
      count(*)::int             as total_vendas,
      max(s.date)               as ultima_data,
      (array_agg(s.broker_id order by s.date desc))[1] as ultimo_broker
    from sales s
    group by s.client_id
  ),
  recompra as (
    select
      c.id, c.name, c.phone, c.photo_url,
      v.total_vendas,
      v.ultima_data,
      ((now() at time zone 'America/Sao_Paulo')::date - v.ultima_data::date)::int as dias_desde
    from contacts c
    join vendas_por_cliente v on v.client_id = c.id, sc
    where c.tags @> array['buyer']::text[]
      and ((now() at time zone 'America/Sao_Paulo')::date - v.ultima_data::date) >= 180
      and (sc.all_scope or v.ultimo_broker = sc.broker)
    order by dias_desde desc
    limit 30
  ),

  -- ── Leads sem contato real ──────────────────────────────────────────────────
  -- Devolve só (lead_id, dias): o widget cruza com o store de leads, que já
  -- está carregado e é onde estão nome, telefone e etapa.
  -- Sem interação real = conta a partir da criação do lead, igual ao cliente.
  ultimo_contato as (
    select li.lead_id, max(li.interacted_at) as ultima
    from lead_interactions li
    where li.type in ('ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa')
    group by li.lead_id
  ),
  sem_contato as (
    select
      l.id,
      floor(extract(epoch from (now() - coalesce(uc.ultima, l.created_at))) / 86400)::int as dias
    from leads l
    left join ultimo_contato uc on uc.lead_id = l.id, sc
    where l.discard_reason is null
      and l.closed_at is null
      and l.funnel_stage <> 'venda'
      and (sc.all_scope or l.broker_id = sc.broker)
      and floor(extract(epoch from (now() - coalesce(uc.ultima, l.created_at))) / 86400) > 2
  )

select jsonb_build_object(
  'aniversariantes', coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id', id, 'nome', name, 'telefone', phone,
       'birthdate', birthdate, 'photoUrl', photo_url))
     from aniv),
    '[]'::jsonb
  ),
  'recompra', coalesce(
    (select jsonb_agg(jsonb_build_object(
       'id', id, 'nome', name, 'telefone', phone, 'photoUrl', photo_url,
       'totalVendas', total_vendas, 'ultimaVenda', ultima_data, 'diasDesde', dias_desde)
     order by dias_desde desc)
     from recompra),
    '[]'::jsonb
  ),
  'recompraTotal', (select count(*)::int from recompra),
  'leadsSemContato', coalesce(
    (select jsonb_agg(jsonb_build_object('leadId', id, 'dias', dias) order by dias desc)
     from sem_contato),
    '[]'::jsonb
  )
)
$$;

grant execute on function public.dashboard_extras(uuid) to authenticated;

-- Índice de apoio para o "último contato real" por lead
create index if not exists idx_li_lead_tipo_data
  on public.lead_interactions (lead_id, interacted_at desc);
