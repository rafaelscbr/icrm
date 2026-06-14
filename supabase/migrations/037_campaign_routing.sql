-- ─── Migration 037: roteamento de leads por campanha (formulário Meta) ─────────
-- Define quais corretores recebem os leads de cada formulário. Auto-descoberta:
-- todo formulário que manda lead aparece sozinho na tabela (Fonte A). Sem regra
-- ou regra vazia → cai no round-robin global (lead_distribution) como fallback.
-- Round-robin independente por formulário (ponteiro próprio).

-- 1. Origem do lead guardada no próprio lead (a recaptura precisa saber a campanha)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_form_id text;

-- 2. Novo motivo de atribuição para auditoria clara
ALTER TABLE public.lead_assignments DROP CONSTRAINT IF EXISTS lead_assignments_reason_check;
ALTER TABLE public.lead_assignments ADD CONSTRAINT lead_assignments_reason_check
  CHECK (reason IN ('round_robin','campaign_routing','sla_recapture','manual'));

-- 3. Tabela de regras formulário → corretores
CREATE TABLE IF NOT EXISTS public.meta_form_routing (
  form_id    text        PRIMARY KEY,
  form_name  text,
  broker_ids uuid[]      NOT NULL DEFAULT '{}',  -- vazio = usa fallback global
  last_index integer     NOT NULL DEFAULT -1,    -- ponteiro do round-robin do form
  active     boolean     NOT NULL DEFAULT true,
  lead_count integer     NOT NULL DEFAULT 0,     -- nº de leads recebidos (exibição)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_form_routing ENABLE ROW LEVEL SECURITY;

-- Admin gerencia; as escritas internas passam por SECURITY DEFINER (ignora RLS)
DROP POLICY IF EXISTS "meta_form_routing_select" ON public.meta_form_routing;
DROP POLICY IF EXISTS "meta_form_routing_update" ON public.meta_form_routing;
CREATE POLICY "meta_form_routing_select" ON public.meta_form_routing
  FOR SELECT USING (public.is_admin());
CREATE POLICY "meta_form_routing_update" ON public.meta_form_routing
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. Backfill — formulários já vistos viram regras (sem corretores → fallback)
INSERT INTO public.meta_form_routing (form_id, form_name, lead_count)
SELECT form_id,
       (array_agg(lead_payload->>'form_name' ORDER BY received_at DESC)
         FILTER (WHERE lead_payload->>'form_name' IS NOT NULL))[1],
       count(*) FILTER (WHERE status IN ('processed','reentry'))
FROM public.meta_webhook_events
WHERE form_id IS NOT NULL
GROUP BY form_id
ON CONFLICT (form_id) DO NOTHING;

-- Backfill — origem nos leads Meta existentes (para a recaptura por campanha)
UPDATE public.leads l
SET meta_form_id = e.form_id
FROM public.meta_webhook_events e
WHERE e.lead_id = l.id
  AND e.form_id IS NOT NULL
  AND l.meta_form_id IS NULL;

-- 5. process_meta_lead — agora roteia por campanha antes do fallback global
CREATE OR REPLACE FUNCTION public.process_meta_lead(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
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
  v_notes        text;
  v_existing_id  text;
  v_routing      meta_form_routing%ROWTYPE;
  v_pool         uuid[];
  v_dist         lead_distribution%ROWTYPE;
  v_next_index   int;
  v_broker_id    uuid;
  v_assign_reason text;
  v_contact_id   text;
  v_lead_id      text;
  v_sla          timestamptz;
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

  -- Nome: full_name > first_name + last_name > fallback
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

  -- Telefone: whatsapp_number > phone_number > phone
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

  SELECT string_agg(
    '• ' || replace(f->>'name', '_', ' ') || ': ' ||
    COALESCE((SELECT string_agg(replace(v, '_', ' '), ', ') FROM jsonb_array_elements_text(f->'values') v), ''),
    E'\n'
  )
  INTO v_extra
  FROM jsonb_array_elements(v_field_data) f
  WHERE f->>'name' NOT IN ('full_name', 'first_name', 'last_name', 'phone_number', 'phone', 'whatsapp_number', 'email');

  v_phone_norm := normalize_phone_br(v_phone);

  -- ── Deduplicação por telefone normalizado ────────────────────────────────
  IF v_phone_norm <> '' THEN
    SELECT id INTO v_existing_id
    FROM leads
    WHERE normalize_phone_br(phone) = v_phone_norm
      AND discard_reason IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    INSERT INTO lead_interactions
      (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (
      gen_random_uuid()::text,
      v_existing_id,
      'nota',
      format('Preencheu novamente o formulário Meta Ads (%s)', v_origem_desc)
        || COALESCE(E'\n' || v_extra, ''),
      v_now, v_now, NULL
    );

    UPDATE meta_webhook_events
    SET status = 'reentry', lead_id = v_existing_id, processed_at = v_now
    WHERE id = p_event_id;

    -- Mantém a contagem da campanha em dia mesmo em reentrada
    IF v_form_id <> '' THEN
      UPDATE meta_form_routing SET lead_count = lead_count + 1, updated_at = v_now
      WHERE form_id = v_form_id;
    END IF;

    RETURN v_existing_id;
  END IF;

  -- ── Roteamento por campanha (auto-descoberta + round-robin do formulário) ─
  IF v_form_id <> '' THEN
    -- Descobre/atualiza a regra do formulário (nasce sem corretores = fallback)
    INSERT INTO meta_form_routing (form_id, form_name, lead_count)
    VALUES (v_form_id, NULLIF(v_form_name, ''), 0)
    ON CONFLICT (form_id) DO UPDATE
      SET form_name = COALESCE(NULLIF(EXCLUDED.form_name, ''), meta_form_routing.form_name),
          updated_at = v_now;

    SELECT * INTO v_routing FROM meta_form_routing WHERE form_id = v_form_id FOR UPDATE;

    -- Pool = corretores ATIVOS da regra, na ordem definida
    IF v_routing.active THEN
      SELECT array_agg(b ORDER BY ord)
      INTO v_pool
      FROM unnest(v_routing.broker_ids) WITH ORDINALITY AS t(b, ord)
      WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = b AND p.active);
    END IF;
  END IF;

  IF v_pool IS NOT NULL AND array_length(v_pool, 1) >= 1 THEN
    -- Round-robin do próprio formulário
    v_next_index    := (v_routing.last_index + 1) % array_length(v_pool, 1);
    v_broker_id     := v_pool[v_next_index + 1];
    v_assign_reason := 'campaign_routing';
    UPDATE meta_form_routing
    SET last_index = v_next_index, lead_count = lead_count + 1, updated_at = v_now
    WHERE form_id = v_form_id;
  ELSE
    -- Fallback: round-robin global (serializado com FOR UPDATE)
    SELECT * INTO v_dist FROM lead_distribution WHERE id = 1 FOR UPDATE;
    v_next_index    := (v_dist.last_index + 1) % array_length(v_dist.broker_ids, 1);
    v_broker_id     := v_dist.broker_ids[v_next_index + 1];
    v_assign_reason := 'round_robin';
    UPDATE lead_distribution SET last_index = v_next_index, updated_at = v_now WHERE id = 1;
    -- Conta o lead na campanha mesmo caindo no fallback
    IF v_form_id <> '' THEN
      UPDATE meta_form_routing SET lead_count = lead_count + 1, updated_at = v_now
      WHERE form_id = v_form_id;
    END IF;
  END IF;

  -- ── Contact: busca pelo telefone ou cria ─────────────────────────────────
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

  -- ── Lead no funil principal ──────────────────────────────────────────────
  v_sla     := sla_deadline(v_now);
  v_lead_id := gen_random_uuid()::text;

  v_notes := format('Meta Ads — %s', v_origem_desc)
    || COALESCE(E'\n\nRespostas do formulário:\n' || v_extra, '');

  INSERT INTO leads (
    id, name, phone, email, origin, meta_form_id,
    funnel_stage, followup_step,
    broker_id, contact_id, converted_at,
    property_name, notes, sla_due_at,
    kanban_order, stage_changed_at,
    created_at, updated_at
  ) VALUES (
    v_lead_id, v_name, v_phone, v_email, 'meta_ads', NULLIF(v_form_id, ''),
    'lead', 0,
    v_broker_id, v_contact_id, v_now,
    NULLIF(v_form_name, ''), v_notes, v_sla,
    EXTRACT(EPOCH FROM v_now) * 1000, v_now,
    v_now, v_now
  );

  INSERT INTO lead_assignments (lead_id, from_broker_id, to_broker_id, reason, sla_due_at)
  VALUES (v_lead_id, NULL, v_broker_id, v_assign_reason, v_sla);

  INSERT INTO lead_interactions
    (id, lead_id, type, description, interacted_at, created_at, broker_id)
  VALUES (
    gen_random_uuid()::text, v_lead_id, 'nota',
    format('Lead recebido via Meta Ads (%s)', v_origem_desc),
    v_now, v_now, NULL
  );

  INSERT INTO notifications
    (user_id, type, title, body, resource_id, resource_type, read)
  VALUES (
    v_broker_id, 'lead_assigned', 'Novo lead Meta Ads',
    concat_ws(' · ', v_name, NULLIF(v_form_name, ''),
      CASE WHEN v_phone <> '' THEN v_phone ELSE 'sem telefone' END),
    v_lead_id, 'lead', false
  );

  UPDATE meta_webhook_events
  SET status = 'processed', lead_id = v_lead_id, processed_at = v_now
  WHERE id = p_event_id;

  RETURN v_lead_id;
END $$;

-- 6. recapture_overdue_leads — ping-pong restrito à campanha do lead
CREATE OR REPLACE FUNCTION public.recapture_overdue_leads()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_lead        RECORD;
  v_pool        uuid[];
  v_dist        lead_distribution%ROWTYPE;
  v_idx         int;
  v_next_broker uuid;
  v_sla         timestamptz;
  v_now         timestamptz := now();
  v_from_name   text;
  v_to_name     text;
  v_count       int := 0;
BEGIN
  SELECT * INTO v_dist FROM lead_distribution WHERE id = 1;

  FOR v_lead IN
    SELECT id, broker_id, contact_id, meta_form_id
    FROM leads
    WHERE sla_due_at IS NOT NULL
      AND sla_due_at <= v_now
      AND first_contact_at IS NULL
      AND discard_reason IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_lead.broker_id IS NULL THEN CONTINUE; END IF;

    -- Pool da campanha (corretores ativos da regra); senão, pool global
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

    -- Sem ninguém para quem alternar (campanha de 1 corretor ou pool vazio):
    -- não transfere — o badge "SLA vencido" na UI sinaliza. Evita push repetido.
    IF v_pool IS NULL OR array_length(v_pool, 1) IS NULL OR array_length(v_pool, 1) < 2 THEN
      CONTINUE;
    END IF;

    -- Ping-pong: próximo do pool, diferente do atual
    v_idx := array_position(v_pool, v_lead.broker_id);
    IF v_idx IS NULL THEN
      v_next_broker := v_pool[1];
    ELSE
      v_next_broker := v_pool[(v_idx % array_length(v_pool, 1)) + 1];
    END IF;
    IF v_next_broker = v_lead.broker_id THEN CONTINUE; END IF;

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
      format('Transferido automaticamente: %s não registrou o 1º contato em 5 min úteis → %s',
        COALESCE(v_from_name, 'Corretor anterior'), COALESCE(v_to_name, 'Novo responsável')),
      v_now, v_now, NULL
    );

    INSERT INTO notifications
      (user_id, type, title, body, resource_id, resource_type, read)
    VALUES (
      v_next_broker, 'lead_recaptured', 'Lead transferido para você',
      format('%s não registrou o 1º contato em 5 min úteis', COALESCE(v_from_name, 'O corretor anterior')),
      v_lead.id, 'lead', false
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;
