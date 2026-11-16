-- 089 · Pausa no recebimento de leads
--
-- O corretor pode pausar o recebimento de leads pelo menu do perfil e escolhe
-- o tamanho do intervalo: 30 min, 1 h, 2 h, 3 h ou o dia todo. Enquanto a pausa
-- vale, nenhum rodízio entrega lead para ele:
--   • a roleta do formulário (Meta Ads) e a roleta geral (Meta sem formulário
--     roteado e leads do site) pulam a vez dele;
--   • o rodízio por tempo de resposta (SLA) não transfere lead para ele.
--
-- A volta é automática e não depende de cron: a pausa tem hora de fim
-- (until_at) e "está em pausa?" é só uma comparação com o relógio do banco. No
-- minuto em que o intervalo acaba, o corretor já está de volta na roleta, na
-- mesma posição de antes — quem pausa perde a vez só enquanto está fora.
--
-- O que NÃO muda:
--   • Lead que já está com o corretor continua com ele. Se o prazo de 1º
--     contato vencer durante a pausa, o SLA transfere como sempre faria.
--   • Cliente que já comprou e volta a se cadastrar continua indo para quem
--     vendeu, em pausa ou não — isso não é rodízio.
--   • Transferência manual feita pelo admin não olha a pausa.
--   • Sem ninguém em pausa, as três funções escolhem exatamente quem escolhiam.
--
-- Todo mundo em pausa: o lead não pode ficar sem dono. Vale a ordem normal da
-- roleta (ignorando a pausa), o histórico do lead registra e o admin é avisado.

-- ── Histórico de pausas ──────────────────────────────────────────────────────
-- Uma linha por pausa. Pausa em vigor = ended_at vazio e until_at no futuro.
-- ended_at só é preenchido quando alguém encerra antes da hora (o próprio
-- corretor, o admin, ou uma pausa nova por cima).
CREATE TABLE IF NOT EXISTS public.lead_intake_pauses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  preset      text        NOT NULL CHECK (preset IN ('30min', '1h', '2h', '3h', 'dia')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  until_at    timestamptz NOT NULL,
  ended_at    timestamptz,
  ended_by    uuid        REFERENCES public.profiles(id),
  CHECK (until_at > started_at)
);

-- Uma pausa aberta por corretor, garantido pelo banco.
CREATE UNIQUE INDEX IF NOT EXISTS lead_intake_pauses_aberta
  ON public.lead_intake_pauses (broker_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS lead_intake_pauses_historico
  ON public.lead_intake_pauses (broker_id, started_at DESC);

ALTER TABLE public.lead_intake_pauses ENABLE ROW LEVEL SECURITY;

-- Cada um vê as próprias pausas; o admin vê as de todos. Ninguém grava direto:
-- só pelas funções abaixo.
DROP POLICY IF EXISTS lead_intake_pauses_select ON public.lead_intake_pauses;
CREATE POLICY lead_intake_pauses_select ON public.lead_intake_pauses
  FOR SELECT TO authenticated
  USING (broker_id = auth.uid() OR public.is_admin());

REVOKE ALL ON public.lead_intake_pauses FROM anon, authenticated;
GRANT SELECT ON public.lead_intake_pauses TO authenticated;

-- ── Está em pausa agora? ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lead_broker_on_pause(p_broker uuid, p_now timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM lead_intake_pauses x
    WHERE x.broker_id = p_broker
      AND x.ended_at IS NULL
      AND x.until_at > p_now
  );
$function$;

-- ── O próximo da roleta ──────────────────────────────────────────────────────
-- Anda pela lista a partir de p_last_index + 1 e devolve o índice (base 0) do
-- primeiro corretor ativo que não esteja em pausa. NULL = ninguém disponível.
--   p_respect_pause = false → ignora a pausa (usado quando todos pausaram).
--   p_except                → corretor a pular (o dono atual, no rodízio do SLA).
-- Com todos ativos e ninguém em pausa devolve (p_last_index + 1) % tamanho —
-- a mesma conta que as funções faziam antes.
CREATE OR REPLACE FUNCTION public.next_lead_broker_index(
  p_ids           uuid[],
  p_last_index    int,
  p_now           timestamptz,
  p_respect_pause boolean DEFAULT true,
  p_except        uuid    DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n    int := COALESCE(array_length(p_ids, 1), 0);
  v_i  int;
  v_b  uuid;
BEGIN
  IF n = 0 THEN RETURN NULL; END IF;

  FOR k IN 1..n LOOP
    v_i := (((COALESCE(p_last_index, -1) + k) % n) + n) % n;
    v_b := p_ids[v_i + 1];

    CONTINUE WHEN v_b IS NULL;
    CONTINUE WHEN p_except IS NOT NULL AND v_b = p_except;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_b AND p.active);
    CONTINUE WHEN p_respect_pause AND lead_broker_on_pause(v_b, p_now);

    RETURN v_i;
  END LOOP;

  RETURN NULL;
END $function$;

-- Só as funções de roteamento usam estas duas.
REVOKE ALL ON FUNCTION public.lead_broker_on_pause(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_lead_broker_index(uuid[], int, timestamptz, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_broker_on_pause(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_lead_broker_index(uuid[], int, timestamptz, boolean, uuid) TO service_role;

-- ── Pausar (o próprio corretor) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pause_lead_intake(p_preset text)
RETURNS public.lead_intake_pauses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tz       constant text := 'America/Sao_Paulo';
  v_uid    uuid := auth.uid();
  v_now    timestamptz := now();
  v_until  timestamptz;
  v_row    lead_intake_pauses%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo para pausar o recebimento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND active) THEN
    RAISE EXCEPTION 'Usuário inativo não recebe leads';
  END IF;

  v_until := CASE p_preset
    WHEN '30min' THEN v_now + interval '30 minutes'
    WHEN '1h'    THEN v_now + interval '1 hour'
    WHEN '2h'    THEN v_now + interval '2 hours'
    WHEN '3h'    THEN v_now + interval '3 hours'
    -- dia todo = até a meia-noite de hoje, no horário de Brasília
    WHEN 'dia'   THEN (date_trunc('day', v_now AT TIME ZONE tz) + interval '1 day') AT TIME ZONE tz
  END;
  IF v_until IS NULL THEN
    RAISE EXCEPTION 'Intervalo inválido: escolha 30 min, 1 h, 2 h, 3 h ou dia todo';
  END IF;

  -- Pausa nova substitui a que estiver aberta (em vigor ou já vencida).
  UPDATE lead_intake_pauses
  SET ended_at = LEAST(v_now, until_at),
      ended_by = CASE WHEN until_at > v_now THEN v_uid END
  WHERE broker_id = v_uid AND ended_at IS NULL;

  INSERT INTO lead_intake_pauses (broker_id, preset, started_at, until_at)
  VALUES (v_uid, p_preset, v_now, v_until)
  RETURNING * INTO v_row;

  RETURN v_row;
END $function$;

-- ── Voltar a receber antes da hora ───────────────────────────────────────────
-- Sem parâmetro: o próprio corretor. Com parâmetro: o admin devolve outro
-- corretor à roleta. Devolve true se havia pausa em vigor.
CREATE OR REPLACE FUNCTION public.resume_lead_intake(p_broker_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_alvo  uuid;
  v_now   timestamptz := now();
  v_n     int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;

  v_alvo := COALESCE(p_broker_id, v_uid);
  IF v_alvo <> v_uid AND NOT is_admin() THEN
    RAISE EXCEPTION 'Só o admin pode devolver outro corretor à roleta';
  END IF;

  UPDATE lead_intake_pauses
  SET ended_at = v_now, ended_by = v_uid
  WHERE broker_id = v_alvo AND ended_at IS NULL AND until_at > v_now;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n > 0;
END $function$;

-- ── Pausas em vigor ──────────────────────────────────────────────────────────
-- Quem decide "em vigor" é o relógio do banco, não o do navegador. Roda com a
-- permissão de quem chama: o corretor recebe só a dele, o admin a de todos.
CREATE OR REPLACE FUNCTION public.active_lead_pauses()
RETURNS SETOF public.lead_intake_pauses
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT * FROM lead_intake_pauses
  WHERE ended_at IS NULL AND until_at > now()
  ORDER BY until_at;
$function$;

REVOKE ALL ON FUNCTION public.pause_lead_intake(text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_lead_intake(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.active_lead_pauses()     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_lead_intake(text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_lead_intake(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_lead_pauses()     TO authenticated;

-- ── Lead do Meta: roleta do formulário e roleta geral pulam quem está em pausa ─
CREATE OR REPLACE FUNCTION public.process_meta_lead(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event        meta_webhook_events%ROWTYPE;
  v_field_data   jsonb;
  v_name         text;
  v_phone        text;
  v_phone_norm   text;
  v_email        text;
  v_ad_name      text;
  v_form_id      text;
  v_form_name    text;
  v_campaign     text;
  v_origem_desc  text;
  v_extra        text;
  v_answers      jsonb;
  v_notes        text;
  v_existing     leads%ROWTYPE;
  v_won          leads%ROWTYPE;
  v_voltou       boolean := false;
  v_compra_desc  text;
  v_routing      meta_form_routing%ROWTYPE;
  v_pool         uuid[];
  v_dist         lead_distribution%ROWTYPE;
  v_next_index   int;
  v_broker_id    uuid;
  v_assign_reason text;
  v_contact_id   text;
  v_lead_id      text;
  v_sla          timestamptz;
  v_etapa        text;
  v_da_geral     boolean := false;   -- 089: saiu da roleta geral (não da do formulário)
  v_em_pausa     boolean := false;   -- 089: quem recebeu estava em pausa (ninguém disponível)
  v_now          timestamptz := now();
BEGIN
  SELECT * INTO v_event FROM meta_webhook_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado: %', p_event_id;
  END IF;

  v_field_data := COALESCE(v_event.lead_payload -> 'field_data', '[]'::jsonb);
  v_ad_name    := COALESCE(v_event.ad_name, '');
  v_form_id    := COALESCE(v_event.form_id, '');
  v_form_name  := COALESCE(v_event.lead_payload ->> 'form_name', '');
  v_campaign   := COALESCE(v_event.lead_payload ->> 'campaign_name', '');

  v_origem_desc := concat_ws(' · ',
    NULLIF('formulário: ' || NULLIF(v_form_name, ''), 'formulário: '),
    NULLIF('campanha: '   || NULLIF(v_campaign, ''),  'campanha: '),
    NULLIF('anúncio: '    || NULLIF(v_ad_name, ''),   'anúncio: ')
  );
  IF v_origem_desc IS NULL OR v_origem_desc = '' THEN
    v_origem_desc := 'formulário: ' || v_form_id;
  END IF;

  v_name := NULLIF(trim(
    COALESCE(
      (SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'full_name'),
      concat_ws(' ',
        NULLIF(trim(COALESCE((SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'first_name'), '')), ''),
        NULLIF(trim(COALESCE((SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'last_name'), '')), '')
      )
    )
  ), '');
  v_name := COALESCE(v_name, 'Lead Meta Ads');

  v_phone := COALESCE(
    NULLIF(trim(COALESCE((SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'whatsapp_number'), '')), ''),
    NULLIF(trim(COALESCE((SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'phone_number'), '')), ''),
    NULLIF(trim(COALESCE((SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'phone'), '')), ''),
    ''
  );

  v_email := NULLIF(trim(COALESCE(
    (SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'email'),
    ''
  )), '');

  -- Texto livre para `notes` — inalterado, a UI continua lendo daqui.
  SELECT string_agg(
    '• ' || replace(f->>'name', '_', ' ') || ': ' ||
    COALESCE((SELECT string_agg(replace(v, '_', ' '), ', ') FROM jsonb_array_elements_text(f->'values') v), ''),
    E'\n'
  )
  INTO v_extra
  FROM jsonb_array_elements(v_field_data) f
  WHERE f->>'name' NOT IN ('full_name', 'first_name', 'last_name', 'phone_number', 'phone', 'whatsapp_number', 'email');

  -- As mesmas respostas, estruturadas (ver 061). O `row_number() = 1` evita a
  -- exceção de chave repetida em `jsonb_object_agg`, que abortaria a transação
  -- inteira e faria o lead não entrar.
  SELECT jsonb_object_agg(x.chave, x.valores)
  INTO v_answers
  FROM (
    SELECT lower(replace(f->>'name', '_', ' ')) AS chave,
           (SELECT jsonb_agg(replace(v, '_', ' '))
              FROM jsonb_array_elements_text(f->'values') v) AS valores,
           row_number() OVER (
             PARTITION BY lower(replace(f->>'name', '_', ' ')) ORDER BY ord
           ) AS rn
    FROM jsonb_array_elements(v_field_data) WITH ORDINALITY AS t(f, ord)
    WHERE f->>'name' NOT IN
          ('full_name','first_name','last_name','phone_number','phone','whatsapp_number','email')
  ) x
  WHERE x.rn = 1;

  v_phone_norm := normalize_phone_br(v_phone);

  IF v_phone_norm <> '' THEN
    -- Lead ATIVO tem precedência: é o caminho comum, e reentrada em lead vivo
    -- não pode virar lead duplicado.
    SELECT * INTO v_existing
    FROM leads
    WHERE normalize_phone_br(phone) = v_phone_norm
      AND discard_reason IS NULL
      AND closed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    -- Nenhum ativo: essa pessoa já comprou? A venda mais recente responde.
    IF v_existing.id IS NULL THEN
      SELECT * INTO v_won
      FROM leads
      WHERE normalize_phone_br(phone) = v_phone_norm
        AND discard_reason IS NULL
        AND closed_at IS NOT NULL
      ORDER BY closed_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- ── Reentrada: mesma pessoa, lead ainda vivo no funil ────────────────────
  IF v_existing.id IS NOT NULL THEN
    INSERT INTO lead_interactions
      (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (
      gen_random_uuid()::text,
      v_existing.id,
      'nota',
      format('Preencheu novamente o formulário Meta Ads (%s)', v_origem_desc)
        || COALESCE(E'\n' || v_extra, ''),
      v_now, v_now, NULL
    );

    -- Não sobrescreve resposta anterior: as duas versões importam, e comparar
    -- uma com a outra é justamente o sinal de "melhorou de renda".
    IF v_answers IS NOT NULL THEN
      UPDATE leads
      SET form_answers = v_answers, updated_at = v_now
      WHERE id = v_existing.id AND form_answers IS NULL;
    END IF;

    UPDATE leads
    SET reentry_at      = v_now,
        reentry_count   = reentry_count + 1,
        reentry_seen_at = NULL,
        kanban_order    = EXTRACT(EPOCH FROM v_now) * 1000,
        updated_at      = v_now
    WHERE id = v_existing.id;

    -- Sem dono não há a quem avisar. E se a pessoa preencheu dois formulários
    -- no mesmo minuto — acontece, a Meta entrega em lote — o aviso sai uma vez
    -- só: dois pushes idênticos ensinam a ignorar.
    IF v_existing.broker_id IS NOT NULL
       AND (v_existing.reentry_at IS NULL OR v_existing.reentry_at < v_now - interval '10 minutes')
    THEN
      v_etapa := CASE v_existing.funnel_stage
        WHEN 'lead'        THEN 'Leads'
        WHEN 'followup'    THEN 'Follow-up'
        WHEN 'atendimento' THEN 'Atendimento'
        WHEN 'visita'      THEN 'Visita'
        WHEN 'proposta'    THEN 'Proposta'
        WHEN 'venda'       THEN 'Venda'
        ELSE v_existing.funnel_stage
      END;

      INSERT INTO notifications
        (user_id, type, title, body, resource_id, resource_type, read)
      VALUES (
        v_existing.broker_id, 'lead_reentry', 'Lead do seu funil se cadastrou de novo',
        concat_ws(' · ',
          COALESCE(NULLIF(v_existing.name, ''), v_name),
          NULLIF(v_form_name, ''),
          'está em ' || v_etapa),
        v_existing.id, 'lead', false
      );
    END IF;

    UPDATE meta_webhook_events
    SET status = 'reentry', lead_id = v_existing.id, processed_at = v_now
    WHERE id = p_event_id;

    IF v_form_id <> '' THEN
      UPDATE meta_form_routing SET lead_count = lead_count + 1, updated_at = v_now
      WHERE form_id = v_form_id;
    END IF;

    RETURN v_existing.id;
  END IF;

  -- ── Cliente que já comprou: lead novo, no funil de quem vendeu ───────────
  v_voltou := v_won.id IS NOT NULL
              AND v_won.broker_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_won.broker_id AND p.active);

  IF v_voltou THEN
    v_broker_id     := v_won.broker_id;
    v_assign_reason := 'returning_client';
    -- O formulário gerou lead e a contagem tem de refletir isso. Mas o rodízio
    -- NÃO avança: este lead não saiu da rotação, e consumir uma vez do outro
    -- corretor seria roubar a vez dele.
    IF v_form_id <> '' THEN
      INSERT INTO meta_form_routing (form_id, form_name, lead_count)
      VALUES (v_form_id, NULLIF(v_form_name, ''), 1)
      ON CONFLICT (form_id) DO UPDATE
        SET form_name   = COALESCE(NULLIF(EXCLUDED.form_name, ''), meta_form_routing.form_name),
            lead_count  = meta_form_routing.lead_count + 1,
            updated_at  = v_now;
      SELECT * INTO v_routing FROM meta_form_routing WHERE form_id = v_form_id;
    END IF;

  -- ── Roteamento normal ────────────────────────────────────────────────────
  ELSE
    IF v_form_id <> '' THEN
      INSERT INTO meta_form_routing (form_id, form_name, lead_count)
      VALUES (v_form_id, NULLIF(v_form_name, ''), 0)
      ON CONFLICT (form_id) DO UPDATE
        SET form_name = COALESCE(NULLIF(EXCLUDED.form_name, ''), meta_form_routing.form_name),
            updated_at = v_now;

      SELECT * INTO v_routing FROM meta_form_routing WHERE form_id = v_form_id FOR UPDATE;

      IF v_routing.active THEN
        SELECT array_agg(b ORDER BY ord)
        INTO v_pool
        FROM unnest(v_routing.broker_ids) WITH ORDINALITY AS t(b, ord)
        WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = b AND p.active);
      END IF;
    END IF;

    -- Quem recebe (089) — a mesma ordem de sempre, pulando quem está em pausa:
    --   1. roleta do formulário;
    --   2. roleta geral;
    --   3. todo mundo em pausa: lead não fica sem dono. Vale a roleta ignorando
    --      a pausa (formulário, depois geral) e o admin é avisado mais abaixo.
    -- Sem ninguém em pausa o resultado é idêntico ao de antes.
    v_next_index := next_lead_broker_index(v_pool, v_routing.last_index, v_now);

    IF v_next_index IS NULL THEN
      SELECT * INTO v_dist FROM lead_distribution WHERE id = 1 FOR UPDATE;
      v_next_index := next_lead_broker_index(v_dist.broker_ids, v_dist.last_index, v_now);
      v_da_geral   := v_next_index IS NOT NULL;

      IF v_next_index IS NULL THEN
        v_next_index := next_lead_broker_index(v_pool, v_routing.last_index, v_now, false);
        IF v_next_index IS NULL THEN
          v_da_geral   := true;
          v_next_index := COALESCE(
            next_lead_broker_index(v_dist.broker_ids, v_dist.last_index, v_now, false),
            (v_dist.last_index + 1) % array_length(v_dist.broker_ids, 1));
        END IF;
      END IF;
    END IF;

    IF NOT v_da_geral THEN
      v_broker_id     := v_pool[v_next_index + 1];
      v_assign_reason := 'campaign_routing';
      UPDATE meta_form_routing
      SET last_index = v_next_index, lead_count = lead_count + 1, updated_at = v_now
      WHERE form_id = v_form_id;
    ELSE
      v_broker_id     := v_dist.broker_ids[v_next_index + 1];
      v_assign_reason := 'round_robin';
      UPDATE lead_distribution SET last_index = v_next_index, updated_at = v_now WHERE id = 1;
      IF v_form_id <> '' THEN
        UPDATE meta_form_routing SET lead_count = lead_count + 1, updated_at = v_now
        WHERE form_id = v_form_id;
      END IF;
    END IF;

    v_em_pausa := lead_broker_on_pause(v_broker_id, v_now);
  END IF;

  -- ── Contato ──────────────────────────────────────────────────────────────
  IF v_phone_norm <> '' THEN
    SELECT id INTO v_contact_id FROM contacts
    WHERE normalize_phone_br(phone) = v_phone_norm LIMIT 1;
  END IF;

  IF v_contact_id IS NULL THEN
    v_contact_id := gen_random_uuid()::text;
    INSERT INTO contacts
      (id, name, phone, tags, has_children, is_married, permuta_items, broker_id, created_at, updated_at)
    VALUES (
      v_contact_id, v_name,
      CASE WHEN v_phone <> '' THEN v_phone ELSE 'sem-telefone-' || v_contact_id END,
      '{}', false, false, '[]'::jsonb, v_broker_id, v_now, v_now
    );
  ELSE
    UPDATE contacts SET broker_id = v_broker_id, updated_at = v_now WHERE id = v_contact_id;
  END IF;

  -- Sem relógio para quem já comprou: o dono é predeterminado, e o SLA existe
  -- para acelerar rodízio, não para tirar do vendedor o cliente dele.
  v_sla     := CASE WHEN v_voltou THEN NULL ELSE sla_deadline(v_now) END;
  v_lead_id := gen_random_uuid()::text;

  IF v_voltou THEN
    v_compra_desc := venda_anterior_desc(v_won);
  END IF;

  v_notes := format('Meta Ads — %s', v_origem_desc)
    || COALESCE(E'\n' || v_compra_desc, '')
    || COALESCE(E'\n\nRespostas do formulário:\n' || v_extra, '');

  INSERT INTO leads (
    id, name, phone, email, origin, meta_form_id,
    funnel_stage, followup_step,
    broker_id, contact_id, converted_at,
    property_name, average_ticket, notes, form_answers, sla_due_at,
    kanban_order, stage_changed_at,
    returning_from_lead_id, reentry_at, reentry_count, reentry_seen_at,
    created_at, updated_at
  ) VALUES (
    v_lead_id, v_name, v_phone, v_email, 'meta_ads', NULLIF(v_form_id, ''),
    'lead', 0,
    v_broker_id, v_contact_id, v_now,
    COALESCE(NULLIF(v_routing.product_name, ''), NULLIF(v_form_name, '')),
    v_routing.product_ticket,
    v_notes, v_answers, v_sla,
    EXTRACT(EPOCH FROM v_now) * 1000, v_now,
    CASE WHEN v_voltou THEN v_won.id  END,
    CASE WHEN v_voltou THEN v_now     END,
    CASE WHEN v_voltou THEN 1 ELSE 0  END,
    NULL,
    v_now, v_now
  );

  INSERT INTO lead_assignments (lead_id, from_broker_id, to_broker_id, reason, sla_due_at)
  VALUES (v_lead_id, NULL, v_broker_id, v_assign_reason, v_sla);

  INSERT INTO lead_interactions
    (id, lead_id, type, description, interacted_at, created_at, broker_id)
  VALUES (
    gen_random_uuid()::text, v_lead_id, 'nota',
    CASE WHEN v_voltou
      THEN format('Cliente que já comprou voltou a se cadastrar (%s). %s', v_origem_desc, v_compra_desc)
      ELSE format('Lead recebido via Meta Ads (%s)', v_origem_desc)
    END,
    v_now, v_now, NULL
  );

  -- O lead ganho antigo não é reaberto nem alterado — só fica sabendo. Sem
  -- isso, quem abrir a venda daqui a um ano não descobre que o cliente voltou.
  IF v_voltou THEN
    INSERT INTO lead_interactions
      (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (
      gen_random_uuid()::text, v_won.id, 'nota',
      format('Este cliente voltou a se cadastrar (%s) — novo lead aberto no funil.', v_origem_desc),
      v_now, v_now, NULL
    );
  END IF;

  INSERT INTO notifications
    (user_id, type, title, body, resource_id, resource_type, read)
  VALUES (
    v_broker_id,
    CASE WHEN v_voltou THEN 'lead_returning_client' ELSE 'lead_assigned' END,
    CASE WHEN v_voltou THEN 'Cliente seu voltou a se cadastrar' ELSE 'Novo lead Meta Ads' END,
    CASE WHEN v_voltou
      THEN concat_ws(' · ', v_name, NULLIF(v_form_name, ''), v_compra_desc)
      ELSE concat_ws(' · ', v_name, NULLIF(v_form_name, ''),
             CASE WHEN v_phone <> '' THEN v_phone ELSE 'sem telefone' END)
    END,
    v_lead_id, 'lead', false
  );

  -- 089: ninguém estava recebendo. O lead entrou mesmo assim (pela ordem da
  -- roleta); fica registrado no histórico e o admin é avisado.
  IF v_em_pausa THEN
    INSERT INTO lead_interactions
      (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (
      gen_random_uuid()::text, v_lead_id, 'nota',
      'Todos os corretores da roleta estavam com o recebimento de leads pausado — o lead foi entregue pela ordem normal.',
      v_now, v_now, NULL
    );

    INSERT INTO notifications
      (user_id, type, title, body, resource_id, resource_type, read)
    SELECT p.id, 'lead_all_paused', 'Lead chegou com todos em pausa',
           format('%s foi para %s, que está com o recebimento pausado.',
             v_name, COALESCE((SELECT name FROM profiles WHERE id = v_broker_id), 'o próximo da roleta')),
           v_lead_id, 'lead', false
    FROM profiles p
    WHERE p.role = 'admin' AND p.active AND p.id <> v_broker_id;
  END IF;

  UPDATE meta_webhook_events
  SET status = 'processed', lead_id = v_lead_id, processed_at = v_now
  WHERE id = p_event_id;

  RETURN v_lead_id;
END $function$;

-- ── Lead do site: roleta geral pula quem está em pausa ───────────────────────
CREATE OR REPLACE FUNCTION public.process_site_lead(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event        site_lead_events%ROWTYPE;
  v_p            jsonb;
  v_name         text;
  v_phone        text;
  v_phone_norm   text;
  v_email        text;
  v_produto      text;
  v_tipo         text;
  v_tipo_desc    text;
  v_pagina       text;
  v_origem_desc  text;
  v_answers      jsonb;
  v_extra        text;
  v_ctx          jsonb;
  v_jornada      text;
  v_notes        text;
  v_existing     leads%ROWTYPE;
  v_won          leads%ROWTYPE;
  v_voltou       boolean := false;
  v_compra_desc  text;
  v_dist         lead_distribution%ROWTYPE;
  v_next_index   int;
  v_broker_id    uuid;
  v_assign_reason text;
  v_contact_id   text;
  v_lead_id      text;
  v_sla          timestamptz;
  v_etapa        text;
  v_em_pausa     boolean := false;   -- 089: quem recebeu estava em pausa (ninguém disponível)
  v_now          timestamptz := now();
BEGIN
  SELECT * INTO v_event FROM site_lead_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento do site não encontrado: %', p_event_id;
  END IF;

  v_p       := v_event.payload;
  v_name    := COALESCE(NULLIF(trim(v_p ->> 'nome'), ''), 'Lead do site');
  v_phone   := COALESCE(NULLIF(trim(v_p ->> 'telefone'), ''), '');
  v_email   := NULLIF(trim(COALESCE(v_p ->> 'email', '')), '');
  v_produto := NULLIF(trim(COALESCE(v_p ->> 'empreendimento', '')), '');
  v_tipo    := COALESCE(NULLIF(v_p ->> 'tipo', ''), 'contato');
  v_pagina  := NULLIF(v_p ->> 'pagina', '');
  v_answers := CASE WHEN jsonb_typeof(v_p -> 'respostas') = 'object' THEN v_p -> 'respostas' END;

  v_tipo_desc := CASE v_tipo
    WHEN 'alerta' THEN 'pediu alerta de lançamento'
    WHEN 'tabela' THEN 'pediu tabela e plantas'
    WHEN 'quiz'   THEN 'fez o quiz do imóvel ideal'
    ELSE 'deixou contato'
  END;
  v_origem_desc := concat_ws(' · ', v_tipo_desc, 'empreendimento: ' || v_produto, 'página: ' || v_pagina);

  SELECT string_agg('• ' || k || ': ' || CASE WHEN jsonb_typeof(v) = 'array'
           THEN (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v) x)
           ELSE v #>> '{}' END, E'\n')
  INTO v_extra
  FROM jsonb_each(COALESCE(v_answers, '{}'::jsonb)) AS e(k, v);

  -- Jornada no site (o que a pessoa viu, salvou e comparou antes de pedir contato)
  v_ctx := CASE WHEN jsonb_typeof(v_p -> 'contexto') = 'object' THEN v_p -> 'contexto' END;
  IF v_ctx IS NOT NULL THEN
    v_jornada := concat_ws(E'\n',
      '• viu: '      || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_ctx -> 'vistos') = 'array' THEN v_ctx -> 'vistos' END) x),
      '• salvou: '   || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_ctx -> 'favoritos') = 'array' THEN v_ctx -> 'favoritos' END) x),
      '• comparou: ' || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_ctx -> 'comparados') = 'array' THEN v_ctx -> 'comparados' END) x),
      '• interesse: ' || (v_ctx ->> 'pontuacao') || '/100',
      '• aparelho: '  || (v_ctx ->> 'dispositivo'),
      '• origem: '    || NULLIF(concat_ws(' / ', v_p -> 'utm' ->> 'utm_source', v_p -> 'utm' ->> 'utm_campaign'), '')
    );
    v_jornada := NULLIF(v_jornada, '');
  END IF;

  v_phone_norm := normalize_phone_br(v_phone);

  IF v_phone_norm <> '' THEN
    SELECT * INTO v_existing
    FROM leads
    WHERE normalize_phone_br(phone) = v_phone_norm
      AND discard_reason IS NULL
      AND closed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing.id IS NULL THEN
      SELECT * INTO v_won
      FROM leads
      WHERE normalize_phone_br(phone) = v_phone_norm
        AND discard_reason IS NULL
        AND closed_at IS NOT NULL
      ORDER BY closed_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- ── Reentrada: mesma pessoa, lead ainda vivo no funil ───────────────────────
  IF v_existing.id IS NOT NULL THEN
    INSERT INTO lead_interactions (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (gen_random_uuid()::text, v_existing.id, 'nota',
            format('Voltou pelo site e %s', v_origem_desc) || COALESCE(E'\n' || v_extra, '')
              || COALESCE(E'\n\nJornada no site:\n' || v_jornada, ''),
            v_now, v_now, NULL);

    UPDATE leads
    SET reentry_at      = v_now,
        reentry_count   = reentry_count + 1,
        reentry_seen_at = NULL,
        kanban_order    = EXTRACT(EPOCH FROM v_now) * 1000,
        form_answers    = COALESCE(form_answers, v_answers),
        updated_at      = v_now
    WHERE id = v_existing.id;

    IF v_existing.broker_id IS NOT NULL
       AND (v_existing.reentry_at IS NULL OR v_existing.reentry_at < v_now - interval '10 minutes')
    THEN
      v_etapa := CASE v_existing.funnel_stage
        WHEN 'lead' THEN 'Leads' WHEN 'followup' THEN 'Follow-up' WHEN 'atendimento' THEN 'Atendimento'
        WHEN 'visita' THEN 'Visita' WHEN 'proposta' THEN 'Proposta' WHEN 'venda' THEN 'Venda'
        ELSE v_existing.funnel_stage END;
      INSERT INTO notifications (user_id, type, title, body, resource_id, resource_type, read)
      VALUES (v_existing.broker_id, 'lead_reentry', 'Lead do seu funil voltou pelo site',
              concat_ws(' · ', COALESCE(NULLIF(v_existing.name, ''), v_name), v_produto, 'está em ' || v_etapa),
              v_existing.id, 'lead', false);
    END IF;

    UPDATE site_lead_events SET status = 'reentry', lead_id = v_existing.id, processed_at = v_now WHERE id = p_event_id;
    RETURN v_existing.id;
  END IF;

  -- ── Quem já comprou volta para quem vendeu; o resto entra no rodízio ────────
  v_voltou := v_won.id IS NOT NULL
              AND v_won.broker_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_won.broker_id AND p.active);

  IF v_voltou THEN
    v_broker_id     := v_won.broker_id;
    v_assign_reason := 'returning_client';
  ELSE
    SELECT * INTO v_dist FROM lead_distribution WHERE id = 1 FOR UPDATE;
    -- 089: próximo da roleta que esteja recebendo; com todos em pausa, vale a
    -- ordem normal (lead não fica sem dono) e o admin é avisado mais abaixo.
    v_next_index    := COALESCE(
      next_lead_broker_index(v_dist.broker_ids, v_dist.last_index, v_now),
      next_lead_broker_index(v_dist.broker_ids, v_dist.last_index, v_now, false),
      (v_dist.last_index + 1) % array_length(v_dist.broker_ids, 1));
    v_broker_id     := v_dist.broker_ids[v_next_index + 1];
    v_assign_reason := 'round_robin';
    UPDATE lead_distribution SET last_index = v_next_index, updated_at = v_now WHERE id = 1;
    v_em_pausa      := lead_broker_on_pause(v_broker_id, v_now);
  END IF;

  -- ── Contato ──────────────────────────────────────────────────────────────────
  IF v_phone_norm <> '' THEN
    SELECT id INTO v_contact_id FROM contacts WHERE normalize_phone_br(phone) = v_phone_norm LIMIT 1;
  END IF;

  IF v_contact_id IS NULL THEN
    v_contact_id := gen_random_uuid()::text;
    INSERT INTO contacts (id, name, phone, tags, has_children, is_married, permuta_items, broker_id, created_at, updated_at)
    VALUES (v_contact_id, v_name,
            CASE WHEN v_phone <> '' THEN v_phone ELSE 'sem-telefone-' || v_contact_id END,
            '{}', false, false, '[]'::jsonb, v_broker_id, v_now, v_now);
  ELSE
    UPDATE contacts SET broker_id = v_broker_id, updated_at = v_now WHERE id = v_contact_id;
  END IF;

  v_sla     := CASE WHEN v_voltou THEN NULL ELSE sla_deadline(v_now) END;
  v_lead_id := gen_random_uuid()::text;
  IF v_voltou THEN v_compra_desc := venda_anterior_desc(v_won); END IF;

  v_notes := format('Site — %s', v_origem_desc)
    || COALESCE(E'\n' || v_compra_desc, '')
    || COALESCE(E'\n\nRespostas:\n' || v_extra, '')
    || COALESCE(E'\n\nJornada no site:\n' || v_jornada, '');

  INSERT INTO leads (
    id, name, phone, email, origin,
    funnel_stage, followup_step,
    broker_id, contact_id, converted_at,
    property_name, notes, form_answers, sla_due_at,
    kanban_order, stage_changed_at,
    returning_from_lead_id, reentry_at, reentry_count, reentry_seen_at,
    created_at, updated_at
  ) VALUES (
    v_lead_id, v_name, v_phone, v_email, 'site',
    'lead', 0,
    v_broker_id, v_contact_id, v_now,
    v_produto, v_notes, v_answers, v_sla,
    EXTRACT(EPOCH FROM v_now) * 1000, v_now,
    CASE WHEN v_voltou THEN v_won.id END,
    CASE WHEN v_voltou THEN v_now END,
    CASE WHEN v_voltou THEN 1 ELSE 0 END,
    NULL,
    v_now, v_now
  );

  INSERT INTO lead_assignments (lead_id, from_broker_id, to_broker_id, reason, sla_due_at)
  VALUES (v_lead_id, NULL, v_broker_id, v_assign_reason, v_sla);

  INSERT INTO lead_interactions (id, lead_id, type, description, interacted_at, created_at, broker_id)
  VALUES (gen_random_uuid()::text, v_lead_id, 'nota',
          CASE WHEN v_voltou
            THEN format('Cliente que já comprou voltou pelo site (%s). %s', v_origem_desc, v_compra_desc)
            ELSE format('Lead recebido pelo site (%s)', v_origem_desc) END,
          v_now, v_now, NULL);

  IF v_voltou THEN
    INSERT INTO lead_interactions (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (gen_random_uuid()::text, v_won.id, 'nota',
            format('Este cliente voltou pelo site (%s) — novo lead aberto no funil.', v_origem_desc),
            v_now, v_now, NULL);
  END IF;

  INSERT INTO notifications (user_id, type, title, body, resource_id, resource_type, read)
  VALUES (v_broker_id,
          CASE WHEN v_voltou THEN 'lead_returning_client' ELSE 'lead_assigned' END,
          CASE WHEN v_voltou THEN 'Cliente seu voltou pelo site' ELSE 'Novo lead do site' END,
          concat_ws(' · ', v_name, v_produto, v_tipo_desc, CASE WHEN v_phone <> '' THEN v_phone ELSE 'sem telefone' END),
          v_lead_id, 'lead', false);

  -- 089: ninguém estava recebendo. O lead entrou mesmo assim (pela ordem da
  -- roleta); fica registrado no histórico e o admin é avisado.
  IF v_em_pausa THEN
    INSERT INTO lead_interactions
      (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (
      gen_random_uuid()::text, v_lead_id, 'nota',
      'Todos os corretores da roleta estavam com o recebimento de leads pausado — o lead foi entregue pela ordem normal.',
      v_now, v_now, NULL
    );

    INSERT INTO notifications
      (user_id, type, title, body, resource_id, resource_type, read)
    SELECT p.id, 'lead_all_paused', 'Lead chegou com todos em pausa',
           format('%s foi para %s, que está com o recebimento pausado.',
             v_name, COALESCE((SELECT name FROM profiles WHERE id = v_broker_id), 'o próximo da roleta')),
           v_lead_id, 'lead', false
    FROM profiles p
    WHERE p.role = 'admin' AND p.active AND p.id <> v_broker_id;
  END IF;

  UPDATE site_lead_events SET status = 'processed', lead_id = v_lead_id, processed_at = v_now WHERE id = p_event_id;
  RETURN v_lead_id;
END $function$;

-- ── Rodízio por tempo de resposta: não transfere para quem está em pausa ─────
CREATE OR REPLACE FUNCTION public.recapture_overdue_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tz            constant text := 'America/Sao_Paulo';
  c_limite      constant int  := 20;
  v_cfg         lead_sla_config%ROWTYPE;
  v_local       timestamp;
  v_hoje        jsonb;
  v_lead        RECORD;
  v_pool        uuid[];
  v_dist        lead_distribution%ROWTYPE;
  v_idx         int;
  v_next_broker uuid;
  v_sla         timestamptz;
  v_now         timestamptz := now();
  v_from_name   text;
  v_to_name     text;
  v_giros       int;
  v_count       int := 0;
BEGIN
  SELECT * INTO v_cfg FROM lead_sla_config WHERE id = 1;
  IF NOT FOUND OR NOT v_cfg.enabled OR v_cfg.enabled_at IS NULL THEN
    RETURN 0;
  END IF;

  -- Fora da agenda ninguém perde lead: espera a próxima janela.
  v_local := v_now AT TIME ZONE tz;
  v_hoje  := v_cfg.schedule -> EXTRACT(DOW FROM v_local)::int;
  IF NOT COALESCE((v_hoje ->> 'on')::boolean, false)
     OR v_local::time <  (v_hoje ->> 'start')::time
     OR v_local::time >= (v_hoje ->> 'end')::time THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_dist FROM lead_distribution WHERE id = 1;

  FOR v_lead IN
    SELECT id, name, broker_id, contact_id, meta_form_id
    FROM leads
    WHERE sla_due_at IS NOT NULL
      AND sla_due_at <= v_now
      AND sla_due_at >  v_cfg.enabled_at
      AND first_contact_at IS NULL
      AND discard_reason IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_lead.broker_id IS NULL THEN CONTINUE; END IF;

    -- ── Limite do rodízio ──────────────────────────────────────────────────
    SELECT count(*) INTO v_giros
    FROM lead_assignments
    WHERE lead_id = v_lead.id AND reason = 'sla_recapture';

    IF v_giros >= c_limite THEN
      UPDATE leads
      SET sla_due_at = NULL, updated_at = v_now
      WHERE id = v_lead.id AND first_contact_at IS NULL;
      IF NOT FOUND THEN CONTINUE; END IF;

      SELECT name INTO v_from_name FROM profiles WHERE id = v_lead.broker_id;

      INSERT INTO lead_interactions
        (id, lead_id, type, description, interacted_at, created_at, broker_id)
      VALUES (
        gen_random_uuid()::text, v_lead.id, 'nota',
        format('Rodízio encerrado: %s transferências sem 1º contato. Fica com %s — admin avisado.',
          v_giros, COALESCE(v_from_name, 'o corretor atual')),
        v_now, v_now, NULL
      );

      INSERT INTO notifications
        (user_id, type, title, body, resource_id, resource_type, read)
      SELECT p.id, 'lead_sla_exhausted',
             format('%s ficou sem 1º contato', COALESCE(NULLIF(v_lead.name, ''), 'Lead')),
             format('%s transferências no rodízio e ninguém atendeu. Está com %s.',
               v_giros, COALESCE(v_from_name, 'o corretor atual')),
             v_lead.id, 'lead', false
      FROM profiles p
      WHERE p.role = 'admin' AND p.active;

      CONTINUE;
    END IF;

    -- ── Rodízio normal ─────────────────────────────────────────────────────
    v_pool := NULL;
    IF v_lead.meta_form_id IS NOT NULL THEN
      SELECT array_agg(b ORDER BY ord)
      INTO v_pool
      FROM meta_form_routing r,
           unnest(r.broker_ids) WITH ORDINALITY AS t(b, ord)
      WHERE r.form_id = v_lead.meta_form_id
        AND r.active
        AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = b AND p.active);
    END IF;

    IF v_pool IS NULL OR array_length(v_pool, 1) IS NULL THEN
      SELECT array_agg(b ORDER BY ord)
      INTO v_pool
      FROM unnest(v_dist.broker_ids) WITH ORDINALITY AS t(b, ord)
      WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = b AND p.active);
    END IF;

    IF v_pool IS NULL OR array_length(v_pool, 1) IS NULL OR array_length(v_pool, 1) < 2 THEN
      CONTINUE;
    END IF;

    -- 089: o próximo da roleta DEPOIS do corretor atual, pulando quem está em
    -- pausa. Sem ninguém disponível o lead espera onde está — esta função roda
    -- a cada minuto e transfere assim que alguém voltar a receber.
    v_idx := next_lead_broker_index(
      v_pool,
      COALESCE(array_position(v_pool, v_lead.broker_id), 0) - 1,
      v_now, true, v_lead.broker_id);
    IF v_idx IS NULL THEN CONTINUE; END IF;
    v_next_broker := v_pool[v_idx + 1];

    v_sla := sla_deadline(v_now);

    UPDATE leads
    SET broker_id = v_next_broker, sla_due_at = v_sla, updated_at = v_now
    WHERE id = v_lead.id AND first_contact_at IS NULL;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_lead.contact_id IS NOT NULL THEN
      UPDATE contacts SET broker_id = v_next_broker, updated_at = v_now
      WHERE id = v_lead.contact_id;
    END IF;

    SELECT name INTO v_from_name FROM profiles WHERE id = v_lead.broker_id;
    SELECT name INTO v_to_name   FROM profiles WHERE id = v_next_broker;

    INSERT INTO lead_assignments (lead_id, from_broker_id, to_broker_id, reason, sla_due_at)
    VALUES (v_lead.id, v_lead.broker_id, v_next_broker, 'sla_recapture', v_sla);

    INSERT INTO lead_interactions
      (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (
      gen_random_uuid()::text, v_lead.id, 'nota',
      format('Transferido automaticamente: %s não registrou o 1º contato em %s min → %s',
        COALESCE(v_from_name, 'Corretor anterior'), v_cfg.minutes, COALESCE(v_to_name, 'Novo responsável')),
      v_now, v_now, NULL
    );

    INSERT INTO notifications
      (user_id, type, title, body, resource_id, resource_type, read)
    VALUES (
      v_next_broker, 'lead_recaptured', 'Lead transferido para você',
      format('%s · %s não registrou o 1º contato em %s min',
        COALESCE(NULLIF(v_lead.name, ''), 'Lead'), COALESCE(v_from_name, 'O corretor anterior'), v_cfg.minutes),
      v_lead.id, 'lead', false
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;

-- CREATE OR REPLACE mantém os privilégios, mas o padrão da 030 fica explícito:
-- só a Edge Function (service_role) e o cron chamam estas três.
REVOKE ALL ON FUNCTION public.process_meta_lead(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_site_lead(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recapture_overdue_leads()      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_meta_lead(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.process_site_lead(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.recapture_overdue_leads()   TO service_role;
