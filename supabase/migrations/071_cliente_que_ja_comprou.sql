-- 071: O cliente que já comprou e volta a se cadastrar
--
-- A 070 resolveu o lead ATIVO que preenche de novo. Falta o caso oposto e mais
-- valioso: quem já comprou com a gente e volta pelo anúncio.
--
-- O que acontecia: a busca de duplicidade olhava só `discard_reason IS NULL` —
-- lead ganho passa nesse filtro. Então o interesse novo era pendurado como
-- reentrada no lead ENCERRADO, que não aparece em funil nenhum (a tela filtra
-- por `closed_at`). O sinal mais forte do negócio — cliente satisfeito voltando
-- para comprar de novo — caía num card invisível.
--
-- Nunca aconteceu ainda (conferido: zero eventos de reentrada em lead fechado),
-- e é por isso que dá para arrumar agora, sem migrar dado histórico.
--
-- A regra nova:
--
--   Lead ATIVO existe        → reentrada, como na 070. Nada muda.
--   Só existe lead GANHO     → NASCE UM LEAD NOVO, no funil do corretor que
--                              vendeu, marcado como cliente que voltou.
--   Nada existe              → lead novo no rodízio, como sempre foi.
--
-- Três decisões que valem explicar:
--
-- • O dono é quem vendeu, não o rodízio. Quem atendeu até a assinatura tem o
--   relacionamento; mandar esse cliente para outro corretor jogaria fora o
--   ativo mais caro que a empresa tem. Se o corretor não estiver mais ativo, aí
--   sim cai no rodízio.
--
-- • SEM relógio de SLA. O SLA de 5 minutos existe para garantir velocidade em
--   lead distribuído por rodízio, e quem estoura perde o lead para o outro
--   corretor (`recapture_overdue_leads`). Aqui o dono é predeterminado — deixar
--   o relógio rodando faria o sistema tirar do vendedor justamente o cliente
--   dele. Sem `sla_due_at`, a recaptura nem olha para este lead.
--
-- • O lead ganho antigo NÃO é reaberto nem alterado. Venda fechada é histórico
--   e histórico não se mexe; ele só recebe uma nota dizendo que a pessoa voltou
--   e para onde foi. O vínculo fica em `returning_from_lead_id`.


-- ── 0. O novo motivo de atribuição ──────────────────────────────────────────
-- `lead_assignments` é a trilha de quem ficou com qual lead e por quê. Sem
-- liberar o motivo novo, o INSERT falha e a transação inteira volta — o lead
-- não entraria. (Descoberto testando: a constraint barrou na primeira tentativa.)
alter table public.lead_assignments
  drop constraint if exists lead_assignments_reason_check;

alter table public.lead_assignments
  add constraint lead_assignments_reason_check
  check (reason = any (array['round_robin','campaign_routing','sla_recapture','manual','returning_client']));


-- ── 1. O vínculo com a compra anterior ──────────────────────────────────────
alter table public.leads
  add column if not exists returning_from_lead_id text;

comment on column public.leads.returning_from_lead_id is
  'Lead ganho anterior desta mesma pessoa. Preenchido quando um cliente que já comprou volta a se cadastrar — o card avisa "já comprou com você".';

create index if not exists idx_leads_returning_from
  on public.leads(returning_from_lead_id)
  where returning_from_lead_id is not null;


-- ── 1b. A frase da compra anterior ──────────────────────────────────────────
-- Fora da função grande de propósito: é texto que o Rafael vai querer ajustar,
-- e mexer numa linha de frase não pode obrigar a reescrever o caminho de
-- entrada dos leads inteiro.
--
-- Lê da VENDA antes do lead: `leads.property_name` está nulo em parte dos leads
-- ganhos (o produto só foi nomeado na hora de fechar) e a data da venda é a
-- data comercial, não o carimbo de quando alguém clicou em "concluir".
--
-- O rodeio no `to_char` é para o dinheiro sair em real: o banco formata no
-- padrão americano (680,815.00) e aqui a moeda é sempre R$ — 680.815,00.
create or replace function public.venda_anterior_desc(p_lead leads)
returns text
language sql
stable
set search_path to 'public'
as $function$
  select concat_ws(' ',
    'Já comprou:',
    coalesce(nullif(s.property_name, ''), nullif(p_lead.property_name, ''), 'imóvel não identificado'),
    case when coalesce(s.value, p_lead.won_value) is not null
         then '— R$ ' || replace(replace(replace(
                to_char(coalesce(s.value, p_lead.won_value), 'FM999G999G999D00'),
                ',', 'X'), '.', ','), 'X', '.')
         else '' end,
    case when coalesce(s.date::timestamp, p_lead.closed_at at time zone 'America/Sao_Paulo') is not null
         then 'em ' || to_char(coalesce(s.date::timestamp,
                                        p_lead.closed_at at time zone 'America/Sao_Paulo'), 'DD/MM/YYYY')
         else '' end)
  from (select 1) z
  left join sales s on s.id = p_lead.sale_id;
$function$;


-- ── 2. O caminho de entrada ─────────────────────────────────────────────────
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

  UPDATE meta_webhook_events
  SET status = 'processed', lead_id = v_lead_id, processed_at = v_now
  WHERE id = p_event_id;

  RETURN v_lead_id;
END $function$;
