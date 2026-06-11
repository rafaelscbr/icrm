-- ─── Migration 028: Integração Meta Ads Lead Forms ────────────────────────────
-- Tudo aditivo — nenhuma tabela/coluna existente é alterada exceto:
--   * leads: +first_contact_at, +sla_due_at
--   * supabase_realtime: +lead_interactions (correção de gap pré-existente)

-- ─── 1. Colunas novas em leads ────────────────────────────────────────────────

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_due_at       timestamptz;

-- ─── 2. Tabelas novas ─────────────────────────────────────────────────────────

-- Log bruto de cada webhook recebido da Meta.
-- Serve para: auditoria, dedup de retries, reprocesso de erros.
CREATE TABLE IF NOT EXISTS public.meta_webhook_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  leadgen_id   text        NOT NULL UNIQUE,          -- dedup de retries da Meta
  page_id      text,
  form_id      text,
  ad_id        text,
  ad_name      text,
  raw_payload  jsonb       NOT NULL,                 -- change completo recebido
  lead_payload jsonb,                                -- resposta da Graph API (field_data)
  status       text        NOT NULL DEFAULT 'received'
                           CHECK (status IN ('received','processed','reentry','error')),
  error_detail text,
  lead_id      text        REFERENCES public.leads(id) ON DELETE SET NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Auditoria de toda atribuição e transferência de lead.
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        text        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_broker_id uuid        REFERENCES auth.users(id),  -- NULL na atribuição inicial
  to_broker_id   uuid        NOT NULL REFERENCES auth.users(id),
  reason         text        NOT NULL CHECK (reason IN ('round_robin','sla_recapture','manual')),
  sla_due_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Configuração do round-robin — linha única, ponteiro persistido no banco.
CREATE TABLE IF NOT EXISTS public.lead_distribution (
  id          smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  broker_ids  uuid[]      NOT NULL,      -- ordem da rotação
  last_index  integer     NOT NULL DEFAULT -1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Dionata recebe o lead 1, Rafael o lead 2.
INSERT INTO public.lead_distribution (id, broker_ids, last_index)
VALUES (1,
  ARRAY[
    '54fd0e07-124f-43e6-aded-e17589e9c9ff'::uuid,  -- Dionata (índice 0)
    '7844d77b-330a-4ffa-a4bd-f9e1134952f1'::uuid   -- Rafael  (índice 1)
  ],
  -1
)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. RLS nas tabelas novas ─────────────────────────────────────────────────

ALTER TABLE public.meta_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_distribution    ENABLE ROW LEVEL SECURITY;

-- meta_webhook_events: somente admin lê; service role escreve (sem policy de escrita)
DROP POLICY IF EXISTS "meta_webhook_events_select" ON public.meta_webhook_events;
CREATE POLICY "meta_webhook_events_select" ON public.meta_webhook_events
  FOR SELECT USING (public.is_admin());

-- lead_assignments: broker vê as que o envolvem; admin vê tudo
DROP POLICY IF EXISTS "lead_assignments_select" ON public.lead_assignments;
CREATE POLICY "lead_assignments_select" ON public.lead_assignments
  FOR SELECT USING (
    from_broker_id = auth.uid()
    OR to_broker_id = auth.uid()
    OR public.is_admin()
  );

-- lead_distribution: somente admin lê e pode alterar
DROP POLICY IF EXISTS "lead_distribution_select" ON public.lead_distribution;
DROP POLICY IF EXISTS "lead_distribution_update" ON public.lead_distribution;
CREATE POLICY "lead_distribution_select" ON public.lead_distribution
  FOR SELECT USING (public.is_admin());
CREATE POLICY "lead_distribution_update" ON public.lead_distribution
  FOR UPDATE USING (public.is_admin());

-- ─── 4. Funções ───────────────────────────────────────────────────────────────

-- 4.1 normalize_phone_br
-- Remove não-dígitos e strip do prefixo 55 de números com DDI brasileiro.
-- IMMUTABLE: usada em índice funcional.
CREATE OR REPLACE FUNCTION public.normalize_phone_br(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d ~ '^55' AND length(d) >= 12 THEN substring(d FROM 3)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) t;
$$;

-- 4.2 sla_deadline
-- Retorna o prazo de +5 minutos úteis a partir de um instante.
-- Janela comercial: Seg–Sex 09:00–18:00, Sáb 09:00–13:00 (America/Sao_Paulo).
-- Fora da janela o relógio pausa; a contagem recomeça no início da próxima janela.
CREATE OR REPLACE FUNCTION public.sla_deadline(from_ts timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE
SET search_path = public AS $$
DECLARE
  tz      CONSTANT text := 'America/Sao_Paulo';
  v_ts    timestamptz   := from_ts;
  v_local timestamp;
  v_dow   int;
  v_time  time;
  v_end   time;
  v_ovf   int;
BEGIN
  -- Passo 1: avança v_ts para dentro da próxima janela útil (máx. 10 dias)
  FOR i IN 1..10 LOOP
    v_local := v_ts AT TIME ZONE tz;
    v_dow   := EXTRACT(DOW FROM v_local)::int;  -- 0=Dom, 1=Seg … 6=Sáb
    v_time  := v_local::time;

    IF v_dow BETWEEN 1 AND 5 AND v_time >= '09:00' AND v_time < '18:00' THEN
      EXIT;  -- Seg–Sex dentro da janela

    ELSIF v_dow = 6 AND v_time >= '09:00' AND v_time < '13:00' THEN
      EXIT;  -- Sáb dentro da janela

    ELSIF (v_dow BETWEEN 1 AND 5 OR v_dow = 6) AND v_time < '09:00' THEN
      -- Antes do expediente: avança para 09:00 do mesmo dia
      v_ts := (date_trunc('day', v_local) + interval '9 hours') AT TIME ZONE tz;
      EXIT;

    ELSE
      -- Após o expediente ou domingo: avança para 09:00 do próximo dia e re-avalia
      v_ts := (date_trunc('day', v_local) + interval '1 day' + interval '9 hours') AT TIME ZONE tz;
    END IF;
  END LOOP;

  -- Passo 2: adiciona 5 minutos
  v_ts := v_ts + interval '5 minutes';

  -- Passo 3: verifica estouro além do fim da janela
  v_local := v_ts AT TIME ZONE tz;
  v_dow   := EXTRACT(DOW FROM v_local)::int;
  v_time  := v_local::time;

  IF    v_dow BETWEEN 1 AND 5 THEN v_end := '18:00';
  ELSIF v_dow = 6              THEN v_end := '13:00';
  ELSE                              v_end := NULL;
  END IF;

  IF v_end IS NOT NULL AND v_time >= v_end THEN
    -- Minutos que estouraram além do fim da janela
    v_ovf := EXTRACT(EPOCH FROM (v_time::interval - v_end::interval))::int / 60;

    -- Avança para 09:00 do próximo dia útil (pula domingo se necessário)
    v_ts := (date_trunc('day', v_local) + interval '1 day') AT TIME ZONE tz;
    FOR i IN 1..3 LOOP
      v_local := v_ts AT TIME ZONE tz;
      v_dow   := EXTRACT(DOW FROM v_local)::int;
      IF v_dow BETWEEN 1 AND 6 THEN  -- Seg–Sáb são janelas válidas
        v_ts := (date_trunc('day', v_local) + interval '9 hours') AT TIME ZONE tz;
        EXIT;
      END IF;
      v_ts := v_ts + interval '1 day';
    END LOOP;

    -- Adiciona os minutos restantes
    v_ts := v_ts + (v_ovf * interval '1 minute');
  END IF;

  RETURN v_ts;
END $$;

-- 4.3 process_meta_lead
-- Processa um evento Meta em UMA transação atômica:
--   dedup por telefone → reentrada (nota no lead existente)
--   OU round-robin + contact + lead + assignment + interação + notificação
CREATE OR REPLACE FUNCTION public.process_meta_lead(p_event_id uuid)
RETURNS text  -- lead_id criado ou do lead existente (reentrada)
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
  v_existing_id text;
  v_dist        lead_distribution%ROWTYPE;
  v_next_index  int;
  v_broker_id   uuid;
  v_contact_id  text;
  v_lead_id     text;
  v_sla         timestamptz;
  v_now         timestamptz := now();
BEGIN
  -- Carrega o evento
  SELECT * INTO v_event FROM meta_webhook_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado: %', p_event_id;
  END IF;

  -- Extrai field_data (garante array vazio quando ausente)
  v_field_data := COALESCE(v_event.lead_payload -> 'field_data', '[]'::jsonb);
  v_ad_name    := COALESCE(v_event.ad_name, '');
  v_form_id    := COALESCE(v_event.form_id, '');

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
    -- Reentrada: apenas registra nota no lead existente
    INSERT INTO lead_interactions
      (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (
      gen_random_uuid()::text,
      v_existing_id,
      'nota',
      format('Preencheu novamente o formulário Meta Ads (anúncio: %s)', v_ad_name),
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
  v_broker_id  := v_dist.broker_ids[v_next_index + 1];  -- arrays PG são 1-based

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
    -- Alinha broker_id para que o corretor designado enxergue o contato via RLS
    UPDATE contacts
    SET broker_id = v_broker_id, updated_at = v_now
    WHERE id = v_contact_id;
  END IF;

  -- ── Lead no funil principal ──────────────────────────────────────────────
  v_sla    := sla_deadline(v_now);
  v_lead_id := gen_random_uuid()::text;

  INSERT INTO leads (
    id, name, phone, email, origin,
    funnel_stage, followup_step,
    broker_id, contact_id, converted_at,
    notes, sla_due_at,
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
    format('Meta Ads — anúncio: %s · formulário: %s', v_ad_name, v_form_id),
    v_sla,
    EXTRACT(EPOCH FROM v_now) * 1000,
    v_now,
    v_now, v_now
  );

  -- ── Registro auditável da atribuição ─────────────────────────────────────
  INSERT INTO lead_assignments (lead_id, from_broker_id, to_broker_id, reason, sla_due_at)
  VALUES (v_lead_id, NULL, v_broker_id, 'round_robin', v_sla);

  -- ── Interação inicial visível no histórico do lead ────────────────────────
  INSERT INTO lead_interactions
    (id, lead_id, type, description, interacted_at, created_at, broker_id)
  VALUES (
    gen_random_uuid()::text,
    v_lead_id,
    'nota',
    format('Lead recebido via Meta Ads (anúncio: %s · formulário: %s)', v_ad_name, v_form_id),
    v_now, v_now, NULL
  );

  -- ── Notificação ao corretor designado ────────────────────────────────────
  INSERT INTO notifications
    (user_id, type, title, body, resource_id, resource_type, read)
  VALUES (
    v_broker_id,
    'lead_assigned',
    'Novo lead Meta Ads',
    format('%s · %s', v_name, CASE WHEN v_phone <> '' THEN v_phone ELSE 'sem telefone' END),
    v_lead_id,
    'lead',
    false
  );

  -- ── Marca evento como processado ─────────────────────────────────────────
  UPDATE meta_webhook_events
  SET status = 'processed', lead_id = v_lead_id, processed_at = v_now
  WHERE id = p_event_id;

  RETURN v_lead_id;
END $$;

-- 4.4 recapture_overdue_leads
-- Chamada pelo pg_cron a cada minuto.
-- Transfere leads cujo sla_due_at expirou e que ainda não tiveram 1º contato.
-- Ping-pong: alterna entre os dois corretores indefinidamente até o 1º contato.
CREATE OR REPLACE FUNCTION public.recapture_overdue_leads()
RETURNS integer  -- número de leads transferidos
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_lead        RECORD;
  v_dist        lead_distribution%ROWTYPE;
  v_next_broker uuid;
  v_sla         timestamptz;
  v_now         timestamptz := now();
  v_from_name   text;
  v_to_name     text;
  v_count       int := 0;
BEGIN
  SELECT * INTO v_dist FROM lead_distribution WHERE id = 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  FOR v_lead IN
    SELECT id, broker_id, contact_id
    FROM leads
    WHERE sla_due_at IS NOT NULL
      AND sla_due_at <= v_now
      AND first_contact_at IS NULL
      AND discard_reason IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_lead.broker_id IS NULL THEN CONTINUE; END IF;

    -- Próximo corretor: o que NÃO é o atual (ping-pong)
    IF v_dist.broker_ids[1] = v_lead.broker_id THEN
      v_next_broker := v_dist.broker_ids[2];
    ELSE
      v_next_broker := v_dist.broker_ids[1];
    END IF;
    IF v_next_broker IS NULL THEN CONTINUE; END IF;

    v_sla := sla_deadline(v_now);

    -- Atualiza o lead (só se ainda sem 1º contato — guarda contra corrida com trigger)
    UPDATE leads
    SET broker_id  = v_next_broker,
        sla_due_at = v_sla,
        updated_at = v_now
    WHERE id = v_lead.id
      AND first_contact_at IS NULL;

    IF NOT FOUND THEN CONTINUE; END IF;  -- trigger chegou antes — pula

    -- Alinha contato para visibilidade RLS do novo broker
    IF v_lead.contact_id IS NOT NULL THEN
      UPDATE contacts
      SET broker_id = v_next_broker, updated_at = v_now
      WHERE id = v_lead.contact_id;
    END IF;

    -- Nomes para a interação
    SELECT name INTO v_from_name FROM profiles WHERE id = v_lead.broker_id;
    SELECT name INTO v_to_name   FROM profiles WHERE id = v_next_broker;

    -- Registro auditável de transferência
    INSERT INTO lead_assignments (lead_id, from_broker_id, to_broker_id, reason, sla_due_at)
    VALUES (v_lead.id, v_lead.broker_id, v_next_broker, 'sla_recapture', v_sla);

    -- Interação visível no histórico
    INSERT INTO lead_interactions
      (id, lead_id, type, description, interacted_at, created_at, broker_id)
    VALUES (
      gen_random_uuid()::text,
      v_lead.id,
      'nota',
      format('Transferido automaticamente: %s não registrou o 1º contato em 5 min úteis → %s',
        COALESCE(v_from_name, 'Corretor anterior'),
        COALESCE(v_to_name, 'Novo responsável')
      ),
      v_now, v_now, NULL
    );

    -- Notificação ao novo responsável
    INSERT INTO notifications
      (user_id, type, title, body, resource_id, resource_type, read)
    VALUES (
      v_next_broker,
      'lead_recaptured',
      'Lead transferido para você',
      format('%s não registrou o 1º contato em 5 min úteis',
        COALESCE(v_from_name, 'O corretor anterior')
      ),
      v_lead.id,
      'lead',
      false
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

-- ─── 5. Trigger — para o relógio no 1º contato ───────────────────────────────
-- Dispara APÓS INSERT em lead_interactions.
-- Se type = 'whatsapp', seta first_contact_at e zera sla_due_at no lead.
-- SECURITY DEFINER: garante que o UPDATE no lead funciona mesmo que o broker
-- que insere a interação já não seja o dono do lead (após recaptura).
CREATE OR REPLACE FUNCTION public.handle_first_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.type = 'whatsapp' THEN
    UPDATE public.leads
    SET first_contact_at = COALESCE(first_contact_at, NEW.interacted_at),
        sla_due_at       = NULL,
        updated_at       = now()
    WHERE id = NEW.lead_id
      AND first_contact_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_first_contact ON public.lead_interactions;
CREATE TRIGGER trg_first_contact
  AFTER INSERT ON public.lead_interactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_first_contact();

-- ─── 6. Índices ───────────────────────────────────────────────────────────────

-- Índice funcional de telefone normalizado (normalize_phone_br precisa existir antes)
CREATE INDEX IF NOT EXISTS idx_leads_phone_norm
  ON public.leads(public.normalize_phone_br(phone));

-- Índice parcial de eventos não processados
CREATE INDEX IF NOT EXISTS idx_meta_events_status
  ON public.meta_webhook_events(status)
  WHERE status <> 'processed';

-- Índice de atribuições por lead
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead
  ON public.lead_assignments(lead_id, created_at DESC);

-- Índice parcial de leads com SLA ativo
CREATE INDEX IF NOT EXISTS idx_leads_sla_due
  ON public.leads(sla_due_at)
  WHERE sla_due_at IS NOT NULL;

-- ─── 7. Realtime: corrige gap pré-existente ───────────────────────────────────
-- useLeadInteractionsStore.subscribe() já existe no frontend mas a tabela
-- não estava na publication. Corrige aqui.
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_interactions;
