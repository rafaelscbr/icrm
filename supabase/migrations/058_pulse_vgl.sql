-- 058: RPC pulse_vgl() — meta do mês e seca de vendas
--
-- Dois números que o Pulse não mostrava e que são os mais duros da operação:
--
--   1. há quantos dias a imobiliária não vende
--   2. quanto falta para a meta do mês e qual o ritmo necessário por dia útil
--
-- Função SEPARADA de propósito: pulse_snapshot() já tem 400 linhas e é o
-- caminho crítico do painel. Um bloco a mais ali aumentaria o risco de mexer
-- em algo que funciona, para ganhar uma requisição — que aqui custa ~300 bytes
-- e roda uma vez por sessão.
--
-- Dia útil da Souza = Seg–Sáb (o time atende sábado até as 13h), igual à
-- janela usada em sla_deadline() e business_minutes().

create or replace function public.pulse_vgl(p_broker_id uuid default null)
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
      (now() at time zone 'America/Sao_Paulo')::date                                        as hoje,
      date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date              as ms,
      (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)
        + interval '1 month - 1 day')::date                                                 as me
  ),

  -- Meta: a global da imobiliária (broker_id null) ou a do corretor na visão
  -- individual. Espelha a convenção de dashboard_overview().
  meta as (
    select coalesce(
      (select g.target from goals g, sc
        where g.category = 'vgl'
          and (case when sc.all_scope then g.broker_id is null else g.broker_id = sc.broker end)
        limit 1),
      (select g.target from goals g where g.category = 'vgl' and g.broker_id is null limit 1),
      1000000
    ) as alvo
  ),

  realizado as (
    select coalesce(sum(s.value), 0) as valor, count(*)::int as qtd
    from sales s, b, sc
    where s.date between b.ms::text and b.me::text
      and (sc.all_scope or s.broker_id = sc.broker)
  ),

  ultima as (
    select max(s.date) as data
    from sales s, sc
    where sc.all_scope or s.broker_id = sc.broker
  ),

  -- Dias úteis que ainda restam no mês, contando HOJE. Se hoje for domingo o
  -- dia não conta, mas o mês pode ainda ter dias — daí o generate_series.
  dias_uteis as (
    select count(*)::int as restantes
    from b, generate_series(b.hoje, b.me, interval '1 day') d
    where extract(dow from d) <> 0
  )

select jsonb_build_object(
  'metaMes',       (select alvo   from meta),
  'realizadoMes',  (select valor  from realizado),
  'vendasMes',     (select qtd    from realizado),
  'ultimaVenda',   (select data   from ultima),
  -- null quando nunca houve venda — o cliente decide como exibir
  'diasSemVenda',  (select case when u.data is null then null
                                else ((select hoje from b) - u.data::date) end
                    from ultima u),
  'diasUteisRestantes', (select restantes from dias_uteis),
  'faltaParaMeta', greatest(0, (select alvo from meta) - (select valor from realizado))
)
$$;

grant execute on function public.pulse_vgl(uuid) to authenticated;
