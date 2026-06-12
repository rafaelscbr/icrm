-- ─── Migration 032: respostas personalizadas do formulário nas notas do lead ──
-- Perguntas personalizadas do Instant Form (fora dos campos padrão full_name/
-- first_name/last_name/phone_number/phone/email) passam a ser gravadas nas
-- Observações do lead e na nota de reentrada. Perguntas de múltipla escolha
-- (vários values) são unidas com vírgula.
-- CREATE OR REPLACE preserva ownership e grants (hardening da 030 intacto).

CREATE OR REPLACE FUNCTION public.process_meta_lead(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_event       meta_webhook_events%ROWTYPE;
  v_field_data  jsonb;
  v_name        text;
  v_phone       text;
  v_phone_norm  text;
  v_email       text;
  v_ad_name     text;
  v_form_id     text;
  v_form_name   text;
  v_campaign    text;
  v_origem_desc text;
  v_extra       text;
  v_notes       text;
  v_existing_id text;
  v_dist        lead_distribution%ROWTYPE;
  v_next_index  int;
  v_broker_id   uuid;
  v_contact_id  text;
  v_lead_id     text;
  v_sla         timestamptz;
  v_now         timestamptz := now();
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

  -- Telefone
  v_phone := COALESCE(
    NULLIF(trim(COALESCE((SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'phone_number'), '')), ''),
    NULLIF(trim(COALESCE((SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'phone'), '')), ''),
    ''
  );

  -- E-mail
  v_email := NULLIF(trim(COALESCE(
    (SELECT f->'values'->>0 FROM jsonb_array_elements(v_field_data) f WHERE f->>'name' = 'email'),
    ''
  )), '');

  -- Perguntas personalizadas: tudo que não é campo padrão vira "• pergunta: resposta"
  SELECT string_agg(
    '• ' || replace(f->>'name', '_', ' ') || ': ' ||
    COALESCE((SELECT string_agg(v, ', ') FROM jsonb_array_elements_text(f->'values') v), ''),
    E'\n'
  )
  INTO v_extra
  FROM jsonb_array_elements(v_field_data) f
  WHERE f->>'name' NOT IN ('full_name', 'first_name', 'last_name', 'phone_number', 'phone', 'email');

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
    -- Reentrada: nota inclui as novas respostas (podem ter mudado)
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

    RETURN v_existing_id;
  END IF;

  -- ── Round-robin: escolhe próximo corretor (serializado com FOR UPDATE) ───
  SELECT * INTO v_dist FROM lead_distribution WHERE id = 1 FOR UPDATE;

  v_next_index := (v_dist.last_index + 1) % array_length(v_dist.broker_ids, 1);
  v_broker_id  := v_dist.broker_ids[v_next_index + 1];

  UPDATE lead_distribution
  SET last_index = v_next_index, updated_at = v_now
  WHERE id = 1;

  -- ── Contact: busca pelo telefone ou cria ─────────────────────────────────
  IF v_phone_norm <> '' THEN
    SELECT id INTO v_contact_id
    FROM contacts
    WHERE normalize_phone_br(phone) = v_phone_norm
    LIMIT 1;
  END IF;

  IF v_contact_id IS NULL THEN
    v_contact_id := gen_random_uuid()::text;
    INSERT INTO contacts
      (id, name, phone, tags, has_children, is_married, permuta_items, broker_id, created_at, updated_at)
    VALUES (
      v_contact_id,
      v_name,
      CASE WHEN v_phone <> '' THEN v_phone ELSE 'sem-telefone-' || v_contact_id END,
      '{}', false, false, '[]'::jsonb,
      v_broker_id,
      v_now, v_now
    );
  ELSE
    UPDATE contacts
    SET broker_id = v_broker_id, updated_at = v_now
    WHERE id = v_contact_id;
  END IF;

  -- ── Lead no funil principal ──────────────────────────────────────────────
  v_sla     := sla_deadline(v_now);
  v_lead_id := gen_random_uuid()::text;

  v_notes := format('Meta Ads — %s', v_origem_desc)
    || COALESCE(E'\n\nRespostas do formulário:\n' || v_extra, '');

  INSERT INTO leads (
    id, name, phone, email, origin,
    funnel_stage, followup_step,
    broker_id, contact_id, converted_at,
    property_name, notes, sla_due_at,
    kanban_order, stage_changed_at,
    created_at, updated_at
  ) VALUES (
    v_lead_id,
    v_name,
    v_phone,
    v_email,
    'meta_ads',
    'lead',
    0,
    v_broker_id,
    v_contact_id,
    v_now,
    NULLIF(v_form_name, ''),
    v_notes,
    v_sla,
    EXTRACT(EPOCH FROM v_now) * 1000,
    v_now,
    v_now, v_now
  );

  INSERT INTO lead_assignments (lead_id, from_broker_id, to_broker_id, reason, sla_due_at)
  VALUES (v_lead_id, NULL, v_broker_id, 'round_robin', v_sla);

  INSERT INTO lead_interactions
    (id, lead_id, type, description, interacted_at, created_at, broker_id)
  VALUES (
    gen_random_uuid()::text,
    v_lead_id,
    'nota',
    format('Lead recebido via Meta Ads (%s)', v_origem_desc),
    v_now, v_now, NULL
  );

  INSERT INTO notifications
    (user_id, type, title, body, resource_id, resource_type, read)
  VALUES (
    v_broker_id,
    'lead_assigned',
    'Novo lead Meta Ads',
    concat_ws(' · ',
      v_name,
      NULLIF(v_form_name, ''),
      CASE WHEN v_phone <> '' THEN v_phone ELSE 'sem telefone' END
    ),
    v_lead_id,
    'lead',
    false
  );

  UPDATE meta_webhook_events
  SET status = 'processed', lead_id = v_lead_id, processed_at = v_now
  WHERE id = p_event_id;

  RETURN v_lead_id;
END $$;
