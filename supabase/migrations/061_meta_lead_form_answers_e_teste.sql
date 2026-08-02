-- 061: process_meta_lead passa a gravar form_answers estruturado
--
-- Dois furos no caminho de entrada dos leads do Meta:
--
-- 1. `leads.form_answers` existe desde a migração 059, mas quem a preencheu foi
--    só o backfill daquela migração. A RPC nunca gravou. Resultado: os 3
--    formulários novos entraram em produção e os leads deles ficaram todos com
--    form_answers NULL — as respostas existem só como texto solto em `notes`,
--    que serve para ler e não serve para decidir.
--
-- 2. (revertido) Chegou a existir aqui um bloqueio dos leads de TESTE do Meta.
--    Foi removido a pedido: o disparo de teste no gerenciador é justamente como
--    se confere que a integração está de pé — se o lead não aparece no funil,
--    não há como validar que o webhook funciona. O teste volta a entrar como
--    lead normal, e quem testa apaga depois.
--    O status 'test' segue permitido em meta_webhook_events (ninguém grava),
--    para não precisar mexer no CHECK de novo se a decisão mudar.
--
-- Esta migração é ADITIVA e defensiva. Nenhum caminho existente muda de
-- comportamento: o lead que entrava continua entrando, com o mesmo roteamento,
-- o mesmo SLA e o mesmo `notes`. O que há de novo é uma coluna a mais no INSERT.

-- ── 1. status 'test' nos eventos ────────────────────────────────────────────
-- Fica permitido mas ninguém grava (ver nota 2 acima). Manter o valor no CHECK
-- custa nada e evita mexer na constraint de novo se a decisão for revista.
alter table public.meta_webhook_events
  drop constraint if exists meta_webhook_events_status_check;

alter table public.meta_webhook_events
  add constraint meta_webhook_events_status_check
  check (status = any (array['received','processed','reentry','error','test']));


-- ── 2. A função ─────────────────────────────────────────────────────────────
create or replace function public.process_meta_lead(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- ══ NOVO: as mesmas respostas, estruturadas ═══════════════════════════════
  -- Mesma normalização da migração 059 (minúscula, '_' → espaço), para o que
  -- for gravado agora casar com o que já existe na base.
  --
  -- O `row_number() = 1` não é enfeite: `jsonb_object_agg` levanta exceção em
  -- chave repetida, e uma exceção aqui abortaria a transação inteira — o lead
  -- não entraria. Hoje nenhum dos 507 payloads tem chave repetida, mas um
  -- formulário futuro com duas perguntas de nome parecido criaria um caminho
  -- silencioso para perder lead. Deduplica ficando com a primeira ocorrência.
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
    SELECT id INTO v_existing_id
    FROM leads
    WHERE normalize_phone_br(phone) = v_phone_norm
      AND discard_reason IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- ── Reentrada: mesma pessoa preenchendo de novo ──────────────────────────
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

    -- Preenche form_answers só se o lead ainda não tiver nenhum. NÃO sobrescreve
    -- resposta anterior: as duas versões importam, e comparar uma com a outra é
    -- justamente o sinal de "melhorou de renda". O histórico completo por
    -- formulário vem na próxima fase, a partir de meta_webhook_events (que já
    -- guarda cada payload íntegro). Aqui, na dúvida, não se destrói nada.
    IF v_answers IS NOT NULL THEN
      UPDATE leads
      SET form_answers = v_answers, updated_at = v_now
      WHERE id = v_existing_id AND form_answers IS NULL;
    END IF;

    UPDATE meta_webhook_events
    SET status = 'reentry', lead_id = v_existing_id, processed_at = v_now
    WHERE id = p_event_id;

    IF v_form_id <> '' THEN
      UPDATE meta_form_routing SET lead_count = lead_count + 1, updated_at = v_now
      WHERE form_id = v_form_id;
    END IF;

    RETURN v_existing_id;
  END IF;

  -- ── Roteamento ───────────────────────────────────────────────────────────
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

  IF v_pool IS NOT NULL AND array_length(v_pool, 1) >= 1 THEN
    v_next_index    := (v_routing.last_index + 1) % array_length(v_pool, 1);
    v_broker_id     := v_pool[v_next_index + 1];
    v_assign_reason := 'campaign_routing';
    UPDATE meta_form_routing
    SET last_index = v_next_index, lead_count = lead_count + 1, updated_at = v_now
    WHERE form_id = v_form_id;
  ELSE
    SELECT * INTO v_dist FROM lead_distribution WHERE id = 1 FOR UPDATE;
    v_next_index    := (v_dist.last_index + 1) % array_length(v_dist.broker_ids, 1);
    v_broker_id     := v_dist.broker_ids[v_next_index + 1];
    v_assign_reason := 'round_robin';
    UPDATE lead_distribution SET last_index = v_next_index, updated_at = v_now WHERE id = 1;
    IF v_form_id <> '' THEN
      UPDATE meta_form_routing SET lead_count = lead_count + 1, updated_at = v_now
      WHERE form_id = v_form_id;
    END IF;
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

  v_sla     := sla_deadline(v_now);
  v_lead_id := gen_random_uuid()::text;

  v_notes := format('Meta Ads — %s', v_origem_desc)
    || COALESCE(E'\n\nRespostas do formulário:\n' || v_extra, '');

  INSERT INTO leads (
    id, name, phone, email, origin, meta_form_id,
    funnel_stage, followup_step,
    broker_id, contact_id, converted_at,
    property_name, average_ticket, notes, form_answers, sla_due_at,
    kanban_order, stage_changed_at,
    created_at, updated_at
  ) VALUES (
    v_lead_id, v_name, v_phone, v_email, 'meta_ads', NULLIF(v_form_id, ''),
    'lead', 0,
    v_broker_id, v_contact_id, v_now,
    COALESCE(NULLIF(v_routing.product_name, ''), NULLIF(v_form_name, '')),
    v_routing.product_ticket,
    v_notes, v_answers, v_sla,
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
END $function$;
