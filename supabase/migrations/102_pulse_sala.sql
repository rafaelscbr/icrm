-- 102 · Pulse vira a sala de comando (o Dashboard de leads sai)
--
-- O Dashboard de Leads e o Pulse se juntam numa tela só, a do Pulse, que vai
-- para a TV. O Dashboard calculava parte do que mostrava a partir da LISTA
-- INTEIRA de leads em memória — o Pulse não pode fazer isso (é a regra que
-- evita o estouro de consumo: uma leitura agregada por sessão, depois só
-- eventos INSERT do tempo real). Esta função entrega, já agregado, o que
-- faltava:
--
--   leadsPorDia  — leads que entraram em cada um dos últimos 30 dias (dia de
--                  São Paulo), contando descartados e ganhos: "quanto chegou".
--   esperando    — leads com prazo de 1º contato correndo agora (sla_due_at
--                  preenchido, sem 1º contato, nem descartado nem encerrado).
--   atribuicoes  — a trilha de distribuição desde o início de ONTEM (lead que
--                  chegou à noite e venceu de manhã é desfecho de hoje).
--   trilha       — 1º contato / descarte / encerramento dos leads dessa trilha,
--                  o mínimo para calcular "no prazo hoje".
--
-- SECURITY INVOKER + RLS, como pulse_snapshot: o admin vê a empresa toda.
-- Tamanho medido: poucos KB.
--
-- Tempo real: lead_assignments entra na publicação para o Pulse saber, na
-- hora, quando um lead muda de mão (rodízio por prazo, transferência). Só o
-- Pulse assina, e só INSERT.

create or replace function public.pulse_sala()
returns jsonb
language sql
stable
set search_path = public
as $$
with
  b as (
    select
      (now() at time zone 'America/Sao_Paulo')::date as hoje,
      (((now() at time zone 'America/Sao_Paulo')::date - 1)::timestamp at time zone 'America/Sao_Paulo') as ontem_ini
  ),
  dias as (
    select (b.hoje - g)::date as dia from b, generate_series(0, 29) g
  ),
  por_dia as (
    select (l.created_at at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as n
    from leads l, b
    where l.created_at >= ((b.hoje - 29)::timestamp at time zone 'America/Sao_Paulo')
    group by 1
  ),
  atr as (
    select a.id, a.lead_id, a.from_broker_id, a.to_broker_id, a.reason, a.sla_due_at, a.created_at
    from lead_assignments a, b
    where a.created_at >= b.ontem_ini
  )
select jsonb_build_object(
  'leadsPorDia', (
    select coalesce(jsonb_agg(jsonb_build_object('data', d.dia, 'n', coalesce(p.n, 0)) order by d.dia), '[]'::jsonb)
    from dias d left join por_dia p on p.dia = d.dia),
  'esperando', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'nome', l.name, 'brokerId', l.broker_id, 'slaDueAt', l.sla_due_at) order by l.sla_due_at), '[]'::jsonb)
    from leads l
    where l.sla_due_at is not null and l.first_contact_at is null
      and l.discarded_at is null and l.closed_at is null),
  'atribuicoes', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'leadId', a.lead_id, 'fromBrokerId', a.from_broker_id, 'toBrokerId', a.to_broker_id,
      'reason', a.reason, 'slaDueAt', a.sla_due_at, 'createdAt', a.created_at) order by a.created_at, a.id), '[]'::jsonb)
    from atr a),
  'trilha', (
    select coalesce(jsonb_object_agg(l.id, jsonb_build_object(
      'firstContactAt', l.first_contact_at, 'discardReason', l.discard_reason, 'closedAt', l.closed_at)), '{}'::jsonb)
    from leads l
    where l.id in (select lead_id from atr))
)
$$;

revoke all on function public.pulse_sala() from public, anon;
grant execute on function public.pulse_sala() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_assignments'
  ) then
    alter publication supabase_realtime add table public.lead_assignments;
  end if;
end $$;
