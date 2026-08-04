-- ─── 065: RPCs da fila de ligação ────────────────────────────────────────────
--
-- Fila única compartilhada só funciona se a decisão de "quem é o próximo"
-- acontecer NO BANCO, numa transação. Se o navegador escolhesse, dois
-- corretores clicando no mesmo segundo receberiam o mesmo lead e ligariam para
-- a mesma pessoa — exatamente o que este módulo existe para evitar.
--
-- Todas as funções são SECURITY DEFINER e checam participação por dentro:
-- a RLS de call_queue libera leitura para a equipe e reserva a escrita
-- operacional para estas funções.

-- ── Janela útil de ligação ───────────────────────────────────────────────────
-- Mesma convenção do SLA do Meta Ads: Seg–Sex 9h–18h, Sáb 9h–13h. Empurra um
-- horário para o próximo instante em que é aceitável ligar para alguém — sem
-- isto a fila devolveria lead às 3h da manhã de domingo.

CREATE OR REPLACE FUNCTION public.next_call_window(from_ts timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  tz      CONSTANT text := 'America/Sao_Paulo';
  v_ts    timestamptz   := from_ts;
  v_local timestamp;
  v_dow   int;
  v_time  time;
BEGIN
  FOR i IN 1..10 LOOP
    v_local := v_ts AT TIME ZONE tz;
    v_dow   := EXTRACT(DOW FROM v_local)::int;
    v_time  := v_local::time;

    IF v_dow BETWEEN 1 AND 5 AND v_time >= '09:00' AND v_time < '18:00' THEN
      RETURN v_ts;
    ELSIF v_dow = 6 AND v_time >= '09:00' AND v_time < '13:00' THEN
      RETURN v_ts;
    ELSIF v_dow BETWEEN 1 AND 6 AND v_time < '09:00' THEN
      RETURN (date_trunc('day', v_local) + interval '9 hours') AT TIME ZONE tz;
    ELSE
      -- fora da janela (fim de expediente ou domingo): tenta o dia seguinte
      v_ts := (date_trunc('day', v_local) + interval '1 day' + interval '9 hours') AT TIME ZONE tz;
    END IF;
  END LOOP;
  RETURN v_ts;
END $$;

-- ── Quem pode trabalhar a campanha ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_call_campaign_member(p_campaign_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
      OR EXISTS (SELECT 1 FROM public.call_campaigns c
                  WHERE c.id = p_campaign_id AND c.owner_broker_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.call_campaign_participants p
                  WHERE p.campaign_id = p_campaign_id AND p.broker_id = auth.uid());
$$;

-- ── Importar listas da Base de Leads para a fila ─────────────────────────────
-- Contato marcado como inválido nunca entra. Contato já na fila da campanha
-- também não (UNIQUE + ON CONFLICT), então reimportar a mesma lista é seguro.

CREATE OR REPLACE FUNCTION public.call_campaign_add_lists(
  p_campaign_id text,
  p_list_ids    text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_added    int := 0;
  v_ignorados int := 0;
  v_list     text;
BEGIN
  IF NOT public.can_manage_call_campaign(p_campaign_id) THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar esta campanha de ligação';
  END IF;

  FOREACH v_list IN ARRAY p_list_ids LOOP
    INSERT INTO public.call_campaign_lists (campaign_id, list_id)
    VALUES (p_campaign_id, v_list)
    ON CONFLICT (campaign_id, list_id) DO NOTHING;
  END LOOP;

  SELECT count(*) INTO v_ignorados
    FROM public.lead_list_members m
    JOIN public.contacts c ON c.id = m.contact_id
   WHERE m.list_id = ANY (p_list_ids)
     AND c.invalid_contact;

  WITH novos AS (
    INSERT INTO public.call_queue (campaign_id, contact_id, list_id)
    SELECT DISTINCT ON (m.contact_id) p_campaign_id, m.contact_id, m.list_id
      FROM public.lead_list_members m
      JOIN public.contacts c ON c.id = m.contact_id
     WHERE m.list_id = ANY (p_list_ids)
       AND NOT c.invalid_contact
    ON CONFLICT (campaign_id, contact_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_added FROM novos;

  RETURN jsonb_build_object('added', v_added, 'ignorados', v_ignorados);
END $$;

-- ── O próximo da fila ────────────────────────────────────────────────────────
--
-- A ordem, nesta sequência exata:
--   1. retorno agendado vencido  — compromisso assumido com o cliente
--   2. contacts.last_touch_at    — quem nunca foi tocado (por ligação OU
--                                  disparo) vem primeiro; quem foi tocado
--                                  recentemente vai para o fim
--   3. menos tentativas
--   4. seed embaralhado          — desempate estável
--
-- FOR UPDATE ... SKIP LOCKED é o que garante que dois corretores simultâneos
-- recebam leads DIFERENTES.

CREATE OR REPLACE FUNCTION public.next_call_lead(p_campaign_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_minutes  int;
  v_status   text;
  v_id       text;
  v_result   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente';
  END IF;
  IF NOT public.is_call_campaign_member(p_campaign_id) THEN
    RAISE EXCEPTION 'Você não participa desta campanha de ligação';
  END IF;

  SELECT status, claim_minutes INTO v_status, v_minutes
    FROM public.call_campaigns WHERE id = p_campaign_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Campanha de ligação não encontrada';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Campanha % — reative para continuar ligando',
      CASE v_status WHEN 'paused' THEN 'pausada' ELSE 'finalizada' END;
  END IF;

  SELECT q.id INTO v_id
    FROM public.call_queue q
    JOIN public.contacts c ON c.id = q.contact_id
   WHERE q.campaign_id = p_campaign_id
     AND q.status IN ('fila', 'tentativa', 'retorno_agendado')
     AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= now())
     AND (q.claimed_until IS NULL OR q.claimed_until < now() OR q.claimed_by = v_uid)
   ORDER BY
     (CASE WHEN q.status = 'retorno_agendado' THEN 0 ELSE 1 END),
     c.last_touch_at ASC NULLS FIRST,
     q.attempt_count ASC,
     q.queue_seed
   LIMIT 1
   FOR UPDATE OF q SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN NULL;   -- fila vazia por agora: nada elegível neste instante
  END IF;

  UPDATE public.call_queue
     SET claimed_by    = v_uid,
         claimed_until = now() + (v_minutes || ' minutes')::interval,
         updated_at    = now()
   WHERE id = v_id;

  SELECT jsonb_build_object(
    'id',             q.id,
    'campaignId',     q.campaign_id,
    'contactId',      q.contact_id,
    'listId',         q.list_id,
    'name',           c.name,
    'phone',          c.phone,
    'status',         q.status,
    'attemptCount',   q.attempt_count,
    'nextAttemptAt',  q.next_attempt_at,
    'lastCallAt',     q.last_call_at,
    'lastOutcome',    q.last_outcome,
    'notes',          q.notes,
    'claimedUntil',   q.claimed_until,
    'lastTouchAt',    c.last_touch_at,
    'perfil',         c.base_lead_profile,
    'historico', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id',        cl.id,
               'calledAt',  cl.called_at,
               'outcome',   cl.outcome,
               'attempt',   cl.attempt_number,
               'notes',     cl.notes,
               'brokerId',  cl.broker_id,
               'brokerName', pr.name
             ) ORDER BY cl.called_at DESC)
        FROM public.call_logs cl
        LEFT JOIN public.profiles pr ON pr.id = cl.broker_id
       WHERE cl.contact_id = q.contact_id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.call_queue q
  JOIN public.contacts c ON c.id = q.contact_id
  WHERE q.id = v_id;

  RETURN v_result;
END $$;

-- ── Clicou em "Ligar pelo WhatsApp" ──────────────────────────────────────────
--
-- Aqui a ligação JÁ CONTA. Não existe URL que inicie chamada de WhatsApp — o
-- wa.me abre a conversa e quem toca no telefone é o corretor. Registrar no
-- clique é a decisão de negócio: quem abriu e não ligou responde por isso.
-- O desfecho vem depois e refina ESTE MESMO registro.

CREATE OR REPLACE FUNCTION public.register_call_attempt(p_queue_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_q       public.call_queue%ROWTYPE;
  v_minutes int;
  v_name    text;
  v_log_id  text;
  v_attempt int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente';
  END IF;

  SELECT * INTO v_q FROM public.call_queue WHERE id = p_queue_id FOR UPDATE;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'Lead não encontrado na fila';
  END IF;
  IF NOT public.is_call_campaign_member(v_q.campaign_id) THEN
    RAISE EXCEPTION 'Você não participa desta campanha de ligação';
  END IF;
  IF v_q.claimed_by IS NOT NULL AND v_q.claimed_by <> v_uid AND v_q.claimed_until > now() THEN
    RAISE EXCEPTION 'Este lead está reservado para outro corretor agora';
  END IF;

  SELECT claim_minutes INTO v_minutes FROM public.call_campaigns WHERE id = v_q.campaign_id;
  SELECT name INTO v_name FROM public.contacts WHERE id = v_q.contact_id;

  v_attempt := v_q.attempt_count + 1;

  INSERT INTO public.call_logs (campaign_id, queue_id, contact_id, contact_name,
                                broker_id, attempt_number, outcome)
  VALUES (v_q.campaign_id, v_q.id, v_q.contact_id, v_name, v_uid, v_attempt, 'discou')
  RETURNING id INTO v_log_id;

  UPDATE public.call_queue
     SET status        = CASE WHEN status = 'fila' THEN 'tentativa' ELSE status END,
         attempt_count = v_attempt,
         last_call_at  = now(),
         last_outcome  = 'discou',
         claimed_by    = v_uid,
         claimed_until = now() + (coalesce(v_minutes, 15) || ' minutes')::interval,
         updated_at    = now()
   WHERE id = v_q.id;

  PERFORM public.touch_contact(v_q.contact_id, now());

  RETURN jsonb_build_object('logId', v_log_id, 'attempt', v_attempt);
END $$;

-- ── Registrar o desfecho ─────────────────────────────────────────────────────
-- Refina o log da tentativa e decide o destino do lead na fila.

CREATE OR REPLACE FUNCTION public.register_call_outcome(
  p_log_id      text,
  p_outcome     text,
  p_notes       text        DEFAULT NULL,
  p_callback_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_log       public.call_logs%ROWTYPE;
  v_q         public.call_queue%ROWTYPE;
  v_hours     int[];
  v_max       int;
  v_espera    int;
  v_status    text;
  v_proxima   timestamptz;
  v_close     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente';
  END IF;

  SELECT * INTO v_log FROM public.call_logs WHERE id = p_log_id;
  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'Registro de ligação não encontrado';
  END IF;
  IF NOT public.is_call_campaign_member(v_log.campaign_id) THEN
    RAISE EXCEPTION 'Você não participa desta campanha de ligação';
  END IF;

  UPDATE public.call_logs
     SET outcome     = p_outcome,
         notes       = coalesce(p_notes, notes),
         callback_at = p_callback_at
   WHERE id = p_log_id;

  IF v_log.queue_id IS NULL THEN
    RETURN jsonb_build_object('status', NULL);
  END IF;

  SELECT * INTO v_q FROM public.call_queue WHERE id = v_log.queue_id FOR UPDATE;
  SELECT retry_hours, max_attempts INTO v_hours, v_max
    FROM public.call_campaigns WHERE id = v_q.campaign_id;

  -- Espera da PRÓXIMA tentativa: usa a posição na cadência, repetindo o último
  -- degrau quando o corretor já passou do fim do array.
  v_espera := v_hours[least(greatest(v_q.attempt_count, 1), array_length(v_hours, 1))];

  IF p_outcome IN ('nao_atendeu', 'caixa_postal') THEN
    IF v_q.attempt_count >= v_max THEN
      v_status := 'encerrado';
      v_close  := 'nao_localizado';
    ELSE
      v_status  := 'tentativa';
      v_proxima := public.next_call_window(now() + (v_espera || ' hours')::interval);
    END IF;

  ELSIF p_outcome = 'pediu_retorno' THEN
    v_status  := 'retorno_agendado';
    -- Sem horário informado, volta no próximo degrau da cadência.
    v_proxima := public.next_call_window(
                   coalesce(p_callback_at, now() + (v_espera || ' hours')::interval));

  ELSIF p_outcome = 'interessado' THEN
    v_status := 'interessado';

  ELSIF p_outcome = 'sem_interesse' THEN
    v_status := 'encerrado'; v_close := 'sem_interesse';

  ELSIF p_outcome = 'nao_perturbe' THEN
    v_status := 'encerrado'; v_close := 'nao_perturbe';

  ELSIF p_outcome = 'numero_invalido' THEN
    v_status := 'encerrado'; v_close := 'numero_invalido';
    -- Número ruim é ruim em todo lugar: marca o contato para não voltar em
    -- nenhuma importação futura, de ligação ou de disparo.
    UPDATE public.contacts SET invalid_contact = true, updated_at = now()
     WHERE id = v_q.contact_id;

  ELSE
    v_status := v_q.status;
  END IF;

  UPDATE public.call_queue
     SET status          = v_status,
         next_attempt_at = v_proxima,
         last_outcome    = p_outcome,
         close_reason    = coalesce(v_close, close_reason),
         notes           = coalesce(p_notes, notes),
         claimed_by      = NULL,      -- desfecho registrado libera a reserva
         claimed_until   = NULL,
         updated_at      = now()
   WHERE id = v_q.id;

  RETURN jsonb_build_object('status', v_status, 'proximaTentativa', v_proxima);
END $$;

-- ── Pular / soltar a reserva ─────────────────────────────────────────────────
-- "Pular" não é desfecho: não gera log, não conta ligação, só devolve o lead
-- para a fila. Ele volta depois — a ordenação por último toque cuida disso.

CREATE OR REPLACE FUNCTION public.release_call_claim(p_queue_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.call_queue
     SET claimed_by = NULL, claimed_until = NULL, updated_at = now()
   WHERE id = p_queue_id
     AND (claimed_by = auth.uid() OR public.is_admin());
END $$;

-- ── Transferir para o funil principal ────────────────────────────────────────
--
-- Cria o lead em ATENDIMENTO com origem própria e leva o histórico junto: cada
-- ligação registrada vira uma interação do tipo 'ligacao' com a data original.
-- O LeadTimeline do lead novo já nasce contando as três tentativas.

CREATE OR REPLACE FUNCTION public.transfer_call_lead_to_funnel(
  p_queue_id      text,
  p_ticket        numeric DEFAULT NULL,
  p_notes         text    DEFAULT NULL,
  p_property_name text    DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_q       public.call_queue%ROWTYPE;
  v_c       public.contacts%ROWTYPE;
  v_camp    public.call_campaigns%ROWTYPE;
  v_lead_id text;
  v_now     timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente';
  END IF;

  SELECT * INTO v_q FROM public.call_queue WHERE id = p_queue_id FOR UPDATE;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'Lead não encontrado na fila';
  END IF;
  IF NOT public.is_call_campaign_member(v_q.campaign_id) THEN
    RAISE EXCEPTION 'Você não participa desta campanha de ligação';
  END IF;
  IF v_q.transferred_to_lead_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este lead já foi transferido para o funil';
  END IF;

  SELECT * INTO v_c    FROM public.contacts       WHERE id = v_q.contact_id;
  SELECT * INTO v_camp FROM public.call_campaigns WHERE id = v_q.campaign_id;

  v_lead_id := gen_random_uuid()::text;

  INSERT INTO public.leads (
    id, name, phone, origin, funnel_stage, followup_step,
    property_name, average_ticket, contact_id, notes,
    stage_changed_at, broker_id, created_at, updated_at
  ) VALUES (
    v_lead_id, v_c.name, v_c.phone, 'prospeccao_ligacao', 'atendimento', 0,
    coalesce(p_property_name, v_camp.product_name),
    coalesce(p_ticket, v_camp.average_ticket),
    v_c.id,
    nullif(concat_ws(E'\n',
      nullif(trim(coalesce(p_notes, v_q.notes, '')), ''),
      format('Origem: prospecção ativa · ligação — campanha "%s" (%s tentativa%s)',
             v_camp.name, v_q.attempt_count,
             CASE WHEN v_q.attempt_count = 1 THEN '' ELSE 's' END)
    ), ''),
    v_now, v_uid, v_now, v_now
  );

  -- O histórico viaja junto: sem isto o corretor do funil recebe um lead "novo"
  -- sem saber que já houve três ligações e o que foi dito em cada uma.
  INSERT INTO public.lead_interactions (
    id, lead_id, type, description, interacted_at, broker_id, created_at
  )
  SELECT
    gen_random_uuid()::text, v_lead_id, 'ligacao',
    format('Prospecção ativa · tentativa %s — %s%s',
           cl.attempt_number,
           CASE cl.outcome
             WHEN 'discou'          THEN 'ligação feita'
             WHEN 'nao_atendeu'     THEN 'não atendeu'
             WHEN 'caixa_postal'    THEN 'caixa postal'
             WHEN 'pediu_retorno'   THEN 'pediu retorno'
             WHEN 'interessado'     THEN 'demonstrou interesse'
             WHEN 'sem_interesse'   THEN 'sem interesse'
             WHEN 'nao_perturbe'    THEN 'pediu para não receber'
             WHEN 'numero_invalido' THEN 'número inválido'
             ELSE cl.outcome
           END,
           coalesce(': ' || nullif(trim(cl.notes), ''), '')),
    cl.called_at, cl.broker_id, cl.called_at
  FROM public.call_logs cl
  WHERE cl.queue_id = v_q.id
  ORDER BY cl.called_at;

  UPDATE public.call_queue
     SET status                 = 'transferido',
         transferred_at         = v_now,
         transferred_to_lead_id = v_lead_id,
         claimed_by             = NULL,
         claimed_until          = NULL,
         next_attempt_at        = NULL,
         updated_at             = v_now
   WHERE id = v_q.id;

  INSERT INTO public.contact_events (id, contact_id, event_type, title, metadata, broker_id, created_at)
  VALUES (gen_random_uuid()::text, v_c.id, 'entered_funnel',
          format('Entrou no funil pela ligação — campanha "%s"', v_camp.name),
          jsonb_build_object('leadId', v_lead_id, 'callCampaignId', v_camp.id),
          v_uid, v_now);

  RETURN jsonb_build_object('leadId', v_lead_id);
END $$;

-- ── Quadro da campanha (kanban) ──────────────────────────────────────────────
-- Contagem por coluna + os primeiros cartões de cada uma. Nunca devolve a fila
-- inteira: uma campanha com 20 mil contatos derrubaria o navegador e o egress.

CREATE OR REPLACE FUNCTION public.call_campaign_board(
  p_campaign_id text,
  p_limite      int DEFAULT 25
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT q.*, c.name, c.phone, c.last_touch_at
      FROM public.call_queue q
      JOIN public.contacts c ON c.id = q.contact_id
     WHERE q.campaign_id = p_campaign_id
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
$$;

-- ── Desempenho por corretor ──────────────────────────────────────────────────
--
-- Honestidade da métrica: 'ligacoes' conta cliques em "Ligar pelo WhatsApp".
-- 'falou' conta os desfechos que só existem se houve conversa. 'semDesfecho'
-- expõe quem liga e não registra — sem isso a taxa de atendimento mentiria.

CREATE OR REPLACE FUNCTION public.call_performance(
  p_campaign_id text DEFAULT NULL,
  p_desde       date DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT coalesce(p_desde, ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29)) AS desde,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date                            AS hoje
  ),
  logs AS (
    SELECT cl.*, (cl.called_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
      FROM public.call_logs cl CROSS JOIN b
     WHERE (p_campaign_id IS NULL OR cl.campaign_id = p_campaign_id)
       AND (cl.called_at AT TIME ZONE 'America/Sao_Paulo')::date >= b.desde
  ),
  por_broker AS (
    SELECT
      broker_id,
      count(*)::int                                                          AS ligacoes,
      count(DISTINCT contact_id)::int                                        AS contatos,
      count(*) FILTER (WHERE outcome IN ('pediu_retorno','interessado',
                                         'sem_interesse','nao_perturbe'))::int AS falou,
      count(*) FILTER (WHERE outcome = 'interessado')::int                   AS interessados,
      count(*) FILTER (WHERE outcome = 'discou')::int                        AS sem_desfecho,
      count(*) FILTER (WHERE dia = (SELECT hoje FROM b))::int                AS hoje
    FROM logs WHERE broker_id IS NOT NULL GROUP BY broker_id
  ),
  transferidos AS (
    SELECT cl.broker_id, count(DISTINCT q.id)::int AS qtd
      FROM public.call_queue q
      JOIN public.call_logs cl ON cl.queue_id = q.id
     WHERE q.transferred_to_lead_id IS NOT NULL
       AND (p_campaign_id IS NULL OR q.campaign_id = p_campaign_id)
     GROUP BY cl.broker_id
  ),
  vendas AS (
    SELECT cl.broker_id,
           count(DISTINCT l.id)::int                 AS qtd,
           coalesce(sum(l.won_value), 0)::numeric    AS valor
      FROM public.call_queue q
      JOIN public.leads l    ON l.id = q.transferred_to_lead_id
      JOIN public.call_logs cl ON cl.queue_id = q.id
     WHERE l.closed_at IS NOT NULL
       AND (p_campaign_id IS NULL OR q.campaign_id = p_campaign_id)
     GROUP BY cl.broker_id
  ),
  por_hora AS (
    SELECT extract(hour FROM (called_at AT TIME ZONE 'America/Sao_Paulo'))::int AS h,
           count(*)::int                                                        AS ligacoes,
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
$$;

-- ── Permissões ───────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.next_call_window(timestamptz)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_call_campaign_member(text)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_call_campaign(text)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_contact(text, timestamptz)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_campaign_add_lists(text, text[])                TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_call_lead(text)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_call_attempt(text)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_call_outcome(text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_call_claim(text)                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_call_lead_to_funnel(text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_campaign_board(text, int)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.call_performance(text, date)                         TO authenticated;
