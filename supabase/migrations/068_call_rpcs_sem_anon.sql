-- ─── 068: as RPCs de ligação deixam de ser executáveis por `anon` ────────────
--
-- Toda função nova nasce com EXECUTE para PUBLIC (default do Postgres), e no
-- Supabase `anon` herda de PUBLIC. Como as funções são SECURITY DEFINER, isso
-- significava que uma requisição SEM SESSÃO podia chamar
-- /rest/v1/rpc/<função> e rodar com os privilégios do dono.
--
-- A maioria já se defendia sozinha (`auth.uid() is null` → exceção), mas três
-- não:
--   • call_campaign_board  — devolvia nome e telefone da fila inteira
--   • call_performance     — devolvia o desempenho de todos os corretores
--   • touch_contact        — permitia escrever em qualquer contato
--
-- Duas camadas, porque uma só não basta: REVOKE tira a porta, e a checagem de
-- sessão dentro das funções de leitura garante que uma concessão distraída no
-- futuro não reabra o vazamento.

-- ── 1. Fecha a porta ─────────────────────────────────────────────────────────

DO $do$
DECLARE assinatura text;
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'public.touch_contact(text, timestamptz)',
    'public.can_manage_call_campaign(text)',
    'public.is_call_campaign_member(text)',
    'public.next_call_window(timestamptz)',
    'public.call_campaign_add_lists(text, text[])',
    'public.next_call_lead(text)',
    'public.register_call_attempt(text)',
    'public.register_call_outcome(text, text, text, timestamptz)',
    'public.release_call_claim(text)',
    'public.transfer_call_lead_to_funnel(text, numeric, text, text)',
    'public.call_campaign_board(text, int)',
    'public.call_performance(text, date)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', assinatura);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated',  assinatura);
  END LOOP;
END $do$;

-- ── 2. Checagem de sessão nas duas funções de leitura ────────────────────────
-- São SQL puro (não plpgsql), então a guarda vira uma condição no WHERE: sem
-- sessão, o conjunto sai vazio em vez de devolver a base.

CREATE OR REPLACE FUNCTION public.call_campaign_board(
  p_campaign_id text,
  p_limite      int DEFAULT 25
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH base AS (
    SELECT q.*, c.name, c.phone, c.last_touch_at
      FROM public.call_queue q
      JOIN public.contacts c ON c.id = q.contact_id
     WHERE q.campaign_id = p_campaign_id
       AND auth.uid() IS NOT NULL
  ),
  contagem AS (
    SELECT status, count(*)::int AS total FROM base GROUP BY status
  ),
  ranqueado AS (
    SELECT b.*, row_number() OVER (
             PARTITION BY b.status
             ORDER BY b.next_attempt_at NULLS FIRST, b.last_call_at DESC NULLS LAST, b.queue_seed
           ) AS rn
      FROM base b
  )
  SELECT jsonb_build_object(
    'contagem', coalesce((SELECT jsonb_object_agg(status, total) FROM contagem), '{}'::jsonb),
    'total',    (SELECT count(*)::int FROM base),
    'cartoes',  coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',             id,
        'contactId',      contact_id,
        'name',           name,
        'phone',          phone,
        'status',         status,
        'attemptCount',   attempt_count,
        'nextAttemptAt',  next_attempt_at,
        'lastCallAt',     last_call_at,
        'lastOutcome',    last_outcome,
        'closeReason',    close_reason,
        'notes',          notes,
        'claimedBy',      claimed_by,
        'claimedUntil',   claimed_until,
        'transferredToLeadId', transferred_to_lead_id
      ) ORDER BY status, rn)
      FROM ranqueado WHERE rn <= p_limite
    ), '[]'::jsonb)
  );
$fn$;

CREATE OR REPLACE FUNCTION public.call_performance(
  p_campaign_id text DEFAULT NULL,
  p_desde       date DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH b AS (
    SELECT coalesce(p_desde, ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29)) AS desde,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date                            AS hoje
  ),
  logs AS (
    SELECT cl.*, (cl.called_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
      FROM public.call_logs cl CROSS JOIN b
     WHERE (p_campaign_id IS NULL OR cl.campaign_id = p_campaign_id)
       AND (cl.called_at AT TIME ZONE 'America/Sao_Paulo')::date >= b.desde
       AND auth.uid() IS NOT NULL
  ),
  por_broker AS (
    SELECT
      broker_id,
      count(*)::int                                                            AS ligacoes,
      count(DISTINCT contact_id)::int                                          AS contatos,
      count(*) FILTER (WHERE outcome IN ('pediu_retorno','interessado',
                                         'sem_interesse','nao_perturbe'))::int AS falou,
      count(*) FILTER (WHERE outcome = 'interessado')::int                     AS interessados,
      count(*) FILTER (WHERE outcome = 'discou')::int                          AS sem_desfecho,
      count(*) FILTER (WHERE dia = (SELECT hoje FROM b))::int                  AS hoje
    FROM logs WHERE broker_id IS NOT NULL GROUP BY broker_id
  ),
  transferidos AS (
    SELECT cl.broker_id, count(DISTINCT q.id)::int AS qtd
      FROM public.call_queue q
      JOIN public.call_logs cl ON cl.queue_id = q.id
     WHERE q.transferred_to_lead_id IS NOT NULL
       AND (p_campaign_id IS NULL OR q.campaign_id = p_campaign_id)
       AND auth.uid() IS NOT NULL
     GROUP BY cl.broker_id
  ),
  vendas AS (
    SELECT cl.broker_id,
           count(DISTINCT l.id)::int              AS qtd,
           coalesce(sum(l.won_value), 0)::numeric AS valor
      FROM public.call_queue q
      JOIN public.leads l      ON l.id = q.transferred_to_lead_id
      JOIN public.call_logs cl ON cl.queue_id = q.id
     WHERE l.closed_at IS NOT NULL
       AND (p_campaign_id IS NULL OR q.campaign_id = p_campaign_id)
       AND auth.uid() IS NOT NULL
     GROUP BY cl.broker_id
  ),
  por_hora AS (
    SELECT extract(hour FROM (called_at AT TIME ZONE 'America/Sao_Paulo'))::int    AS h,
           count(*)::int                                                           AS ligacoes,
           count(*) FILTER (WHERE outcome IN ('pediu_retorno','interessado'))::int AS produtivas
      FROM logs GROUP BY 1
  ),
  por_dia AS (
    SELECT dia, count(*)::int AS ligacoes FROM logs GROUP BY dia
  )
  SELECT jsonb_build_object(
    'desde', (SELECT desde FROM b),
    'corretores', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'brokerId',     pb.broker_id,
        'nome',         pr.name,
        'ligacoes',     pb.ligacoes,
        'contatos',     pb.contatos,
        'falou',        pb.falou,
        'interessados', pb.interessados,
        'semDesfecho',  pb.sem_desfecho,
        'hoje',         pb.hoje,
        'transferidos', coalesce(t.qtd, 0),
        'vendas',       coalesce(v.qtd, 0),
        'vgl',          coalesce(v.valor, 0)
      ) ORDER BY pb.ligacoes DESC)
      FROM por_broker pb
      LEFT JOIN public.profiles pr ON pr.id = pb.broker_id
      LEFT JOIN transferidos t     ON t.broker_id = pb.broker_id
      LEFT JOIN vendas v           ON v.broker_id = pb.broker_id
    ), '[]'::jsonb),
    'porHora', coalesce((
      SELECT jsonb_agg(jsonb_build_object('hora', h, 'ligacoes', ligacoes, 'produtivas', produtivas)
             ORDER BY h) FROM por_hora
    ), '[]'::jsonb),
    'porDia', coalesce((
      SELECT jsonb_agg(jsonb_build_object('dia', dia, 'ligacoes', ligacoes) ORDER BY dia) FROM por_dia
    ), '[]'::jsonb)
  );
$fn$;

-- touch_contact é escrita: sem sessão, não toca em nada.
CREATE OR REPLACE FUNCTION public.touch_contact(p_contact_id text, p_at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE public.contacts
     SET last_touch_at = greatest(coalesce(last_touch_at, '-infinity'::timestamptz), p_at)
   WHERE id = p_contact_id
     AND auth.uid() IS NOT NULL;
$fn$;

-- CREATE OR REPLACE restaura o EXECUTE default; revoga de novo no fim.
DO $do$
DECLARE assinatura text;
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'public.call_campaign_board(text, int)',
    'public.call_performance(text, date)',
    'public.touch_contact(text, timestamptz)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', assinatura);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated',  assinatura);
  END LOOP;
END $do$;
