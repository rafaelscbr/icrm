-- 077: Leads do site (souzaimobi.com.br) entram no iCRM com origem "Site"
--
-- Decisão do Rafael (05/10/2026): os contatos deixados no site (alerta de
-- lançamento, pedido de tabela, quiz, contato) vão direto para o funil, com
-- origem própria para medir o site separado dos portais.
--
-- Caminho: site → Edge Function `site-leads` (valida, barra robô e excesso de
-- envios) → grava o evento bruto em site_lead_events → process_site_lead().
--
-- process_site_lead segue a mesma regra de process_meta_lead:
--   • mesmo telefone com lead vivo no funil = reentrada (nota + aviso ao
--     corretor), nunca lead duplicado;
--   • quem já comprou volta para o corretor que vendeu, sem relógio de SLA;
--   • lead novo entra no rodízio de lead_distribution, com SLA e notificação.

-- 1. Origem "site" ---------------------------------------------------------
alter table public.leads drop constraint if exists leads_origin_check;
alter table public.leads add constraint leads_origin_check check (origin = any (array[
  'felicita', 'meta_ads', 'portal', 'offline', 'campanha', 'indicacao', 'prospeccao_ligacao', 'site'
]::text[]));

insert into public.lead_config (id, type, slug, label, emoji, color, display_order, active)
values ('or-site', 'origin', 'site', 'Site', '🖥️', 'text-sky-400', 9, true)
on conflict (id) do nothing;

-- 2. Registro bruto de cada envio do site --------------------------------------
-- Serve de auditoria (o que chegou, quando, o que virou) e de freio: a função
-- conta envios recentes do mesmo IP (guardado só como hash).
create table if not exists public.site_lead_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  ip_hash      text,
  payload      jsonb not null,
  status       text not null default 'received',   -- received | processed | reentry | error | isca
  lead_id      text,
  error_detail text,
  processed_at timestamptz
);
create index if not exists idx_site_lead_events_ip_recent on public.site_lead_events (ip_hash, created_at desc);

-- Só a Edge Function (service role) lê e escreve. Nenhum acesso público.
alter table public.site_lead_events enable row level security;

-- 3. Processamento ---------------------------------------------------------------
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
    v_next_index    := (v_dist.last_index + 1) % array_length(v_dist.broker_ids, 1);
    v_broker_id     := v_dist.broker_ids[v_next_index + 1];
    v_assign_reason := 'round_robin';
    UPDATE lead_distribution SET last_index = v_next_index, updated_at = v_now WHERE id = 1;
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

  UPDATE site_lead_events SET status = 'processed', lead_id = v_lead_id, processed_at = v_now WHERE id = p_event_id;
  RETURN v_lead_id;
END $function$;

-- Só a Edge Function chama (service role). Ninguém de fora executa direto.
revoke all on function public.process_site_lead(uuid) from public, anon, authenticated;
