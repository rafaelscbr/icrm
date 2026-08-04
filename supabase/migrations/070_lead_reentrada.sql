-- 070: Reentrada — o lead que JÁ está no funil e preenche o formulário de novo
--
-- Desde a 028 a reentrada é tratada, mas em silêncio: o webhook grava uma nota
-- na timeline do lead existente e devolve 200. Ninguém é avisado. Na prática o
-- sinal mais forte que um lead pode emitir — voltar sozinho, de novo, por conta
-- própria — chegava e morria dentro de uma nota que só se lê abrindo o card.
--
-- Três buracos, os três fechados aqui:
--
-- 1. NOTIFICAÇÃO. O corretor responsável não sabia. Agora entra em
--    `notifications` (tipo `lead_reentry`), que já dispara push pelo gatilho da
--    036 — sem nenhuma peça nova de infraestrutura.
--
-- 2. TEMPERATURA. A régua da camada de inteligência dava +12 por formulário
--    repetido, o que sozinho não alcança o piso de morno (15). Um lead frio que
--    voltava a se cadastrar continuava frio na tela. A regra do Rafael é
--    explícita: quem volta fica morno, no mínimo. Vira piso, não gambiarra de
--    pontos — e o piso é recente (7 dias), porque sinal também envelhece.
--
-- 3. DESTAQUE NO FUNIL. O card ficava idêntico a todos os outros. Agora a
--    reentrada é um estado do lead (`reentry_at` / `reentry_count` /
--    `reentry_seen_at`), o card sobe para o topo da coluna e a tela tem o que
--    marcar. `reentry_seen_at` só o DONO baixa (RPC abaixo): admin passando o
--    olho na visão global não apaga o aviso de quem precisa agir.
--
-- Nada do que já funcionava muda: lead novo continua entrando igual, com o
-- mesmo roteamento, o mesmo SLA e as mesmas notas.


-- ── 1. O estado da reentrada no lead ────────────────────────────────────────
alter table public.leads
  add column if not exists reentry_at      timestamptz,
  add column if not exists reentry_count   integer not null default 0,
  add column if not exists reentry_seen_at timestamptz;

comment on column public.leads.reentry_at is
  'Quando este lead preencheu um formulário do Meta estando JÁ no funil.';
comment on column public.leads.reentry_count is
  'Quantas reentradas o lead acumulou. Nunca decrementa.';
comment on column public.leads.reentry_seen_at is
  'Quando o corretor responsável viu a reentrada. Menor que reentry_at (ou nulo) = destaque aceso no Kanban.';


-- ── 2. Backfill do que já aconteceu ─────────────────────────────────────────
-- `meta_webhook_events` guarda cada reentrada desde junho — o estado sai de lá,
-- não de estimativa. Mas reentrada de junho acendendo destaque hoje seria
-- alarme falso no primeiro dia do recurso: só as últimas 24h entram por ver.
with r as (
  select e.lead_id,
         count(*)::int      as qtd,
         max(e.received_at) as ultimo
  from public.meta_webhook_events e
  where e.status = 'reentry' and e.lead_id is not null
  group by e.lead_id
)
update public.leads l
set reentry_count   = r.qtd,
    reentry_at      = r.ultimo,
    reentry_seen_at = case when r.ultimo < now() - interval '24 hours' then r.ultimo end,
    updated_at      = greatest(l.updated_at, now())
from r
where r.lead_id = l.id;


-- ── 3. Baixar o destaque ────────────────────────────────────────────────────
-- Chamada quando o dono abre o lead. Silenciosa de propósito para quem não é
-- dono: o admin abre o card na visão global o tempo todo, e apagar o aviso do
-- corretor nesse caminho seria pior do que não ter aviso nenhum.
create or replace function public.ack_lead_reentry(p_lead_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  select broker_id into v_owner from leads where id = p_lead_id;
  if not found then
    raise exception 'Lead não encontrado: %', p_lead_id;
  end if;

  if v_owner is distinct from auth.uid() then
    return;
  end if;

  update leads
  set reentry_seen_at = now(),
      updated_at      = now()
  where id = p_lead_id
    and reentry_at is not null
    and (reentry_seen_at is null or reentry_seen_at < reentry_at);
end $function$;

revoke execute on function public.ack_lead_reentry(text) from public, anon;
grant  execute on function public.ack_lead_reentry(text) to authenticated;


-- ── 4. Temperatura: quem volta fica morno ───────────────────────────────────
create or replace function public.lead_temperature(
  p_lead              leads,
  p_ultima_interacao  timestamptz,
  p_avancos           integer,
  p_regressoes        integer,
  p_visitas_agendadas integer,
  p_visitas_feitas    integer,
  p_formularios       integer,
  p_ultimo_form       timestamptz,
  p_era_da_base       boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
declare
  agora     timestamptz := now();
  ref       timestamptz := greatest(coalesce(p_ultima_interacao, p_lead.created_at),
                                    coalesce(p_ultimo_form,      p_lead.created_at));
  dias      int := extract(day from agora - ref)::int;
  idade     int := extract(day from agora - p_lead.created_at)::int;
  estado    text;
  motivos   jsonb := '[]'::jsonb;
  score     int := 0;
  respondeu boolean;
begin
  -- O lead "respondeu" quando alguém o moveu para Atendimento ou além. O
  -- corretor só faz esse movimento depois que a pessoa deu sinal — é o proxy
  -- mais honesto que existe hoje. first_contact_at NÃO serve: ele marca o
  -- corretor abrindo o WhatsApp, não a pessoa respondendo.
  respondeu := p_lead.funnel_stage in ('atendimento','visita','proposta','venda');

  -- ── Venda fechada sai da régua ───────────────────────────────────────────
  if p_lead.closed_at is not null then
    return jsonb_build_object('state','ganho','score',100,
      'reasons', jsonb_build_array(jsonb_build_object('sign','+','text','Venda concluída')));
  end if;

  -- ── Descarte: frio, com o motivo à mostra ───────────────────────────────
  if p_lead.discard_reason is not null then
    return jsonb_build_object('state','frio','score',0,
      'reasons', jsonb_build_array(jsonb_build_object(
        'sign','-','text','Descartado: ' || replace(p_lead.discard_reason,'_',' '))));
  end if;

  -- ── Sinais que somam (só coisas que partiram do lead) ───────────────────
  if p_visitas_feitas > 0 then
    score := score + 45;
    motivos := motivos || jsonb_build_object('sign','+','text','Compareceu na visita');
  elsif p_visitas_agendadas > 0 then
    -- Aceitar agendar já conta, mesmo sem comparecer: a pessoa disse sim.
    score := score + 30;
    motivos := motivos || jsonb_build_object('sign','+','text','Aceitou agendar visita');
  end if;

  if respondeu then
    score := score + 20;
    motivos := motivos || jsonb_build_object('sign','+','text','Respondeu e avançou para atendimento');
  end if;

  if p_avancos > 0 then
    score := score + least(p_avancos * 8, 24);
    motivos := motivos || jsonb_build_object('sign','+',
      'text', p_avancos || ' avanço(s) real(is) no funil');
  end if;

  -- Teto de 3: lead ansioso que preenche oito vezes não pode ficar mais quente
  -- que lead que fez visita.
  if p_formularios > 1 then
    score := score + least(p_formularios - 1, 2) * 12;
    motivos := motivos || jsonb_build_object('sign','+',
      'text', p_formularios || ' formulários preenchidos');
  end if;

  if p_era_da_base then
    score := score + 12;
    motivos := motivos || jsonb_build_object('sign','+','text','Já procurava imóvel na nossa base');
  end if;

  -- ── Sinais que descontam ────────────────────────────────────────────────
  -- Regressão esfria na hora. Avanço aquece devagar (precisa de sinal do lead),
  -- recuo esfria rápido: sistema de vendas honesto é pessimista.
  if p_regressoes > 0 then
    score := score - p_regressoes * 20;
    motivos := motivos || jsonb_build_object('sign','-',
      'text', p_regressoes || ' volta(s) atrás no funil');
  end if;

  -- Não respondeu a 3+ tentativas: o próprio contador de follow-up do CRM.
  if not respondeu and p_lead.followup_step >= 3 then
    score := score - 25;
    motivos := motivos || jsonb_build_object('sign','-',
      'text','Sem resposta após ' || p_lead.followup_step || ' tentativas');
  end if;

  -- ── Decaimento por tempo ────────────────────────────────────────────────
  -- Todo sinal perde força. O lead esfria sozinho, sem ninguém mexer.
  if dias > 7 then
    score := score - least((dias - 7) * 2, 40);
    motivos := motivos || jsonb_build_object('sign','-',
      'text', dias || ' dias sem sinal novo');
  end if;

  -- ── Estado ──────────────────────────────────────────────────────────────
  -- Reaquecendo tem precedência: é o estado mais valioso do funil e sumiria
  -- dentro de "morno" se fosse decidido só pelo score.
  if dias <= 7 and idade > 30 and (p_formularios > 1 or p_avancos > 0) then
    estado := 'reaquecendo';
    motivos := jsonb_build_object('sign','+','text','Voltou a dar sinal depois de um tempo parado') || motivos;
  elsif score >= 45 then estado := 'quente';
  elsif score >= 15 then estado := 'morno';
  elsif idade <= 3 and score = 0 and p_lead.followup_step <= 1 then
    -- Corretor mover para Follow-up não muda nada: ainda é lead novo.
    estado := 'novo';
    motivos := jsonb_build_array(jsonb_build_object('sign','=','text','Entrou agora, ainda sem sinal'));
  else estado := 'frio';
  end if;

  -- ── NOVO: reentrada recente tem piso morno ──────────────────────────────
  -- Regra de negócio, não ajuste de pontos: quem preenche de novo por conta
  -- própria não é lead frio, mesmo que a régua comportamental ainda não tenha
  -- ponto suficiente para dizer isso. Só vale para reentrada RECENTE (7 dias) —
  -- sinal também envelhece, e um formulário repetido em maio não pode manter o
  -- lead morno em agosto. O score sobe junto para o piso da faixa: estado e
  -- número dizendo coisas diferentes é como o painel começa a mentir.
  if p_formularios > 1
     and p_ultimo_form is not null
     and p_ultimo_form > agora - interval '7 days'
     and estado in ('frio','novo')
  then
    estado  := 'morno';
    score   := greatest(score, 15);
    motivos := jsonb_build_object('sign','+','text','Voltou a se cadastrar — piso morno') || motivos;
  end if;

  return jsonb_build_object('state', estado, 'score', greatest(score, 0), 'reasons', motivos);
end $function$;


-- ── 5. O caminho de entrada: reentrada deixa de ser silenciosa ──────────────
-- Só o ramo da reentrada muda. Todo o resto é idêntico à 061.
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

  -- As mesmas respostas, estruturadas (ver 061).
  --
  -- O `row_number() = 1` não é enfeite: `jsonb_object_agg` levanta exceção em
  -- chave repetida, e uma exceção aqui abortaria a transação inteira — o lead
  -- não entraria. Deduplica ficando com a primeira ocorrência.
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
    SELECT * INTO v_existing
    FROM leads
    WHERE normalize_phone_br(phone) = v_phone_norm
      AND discard_reason IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- ── Reentrada: mesma pessoa preenchendo de novo ──────────────────────────
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

    -- Preenche form_answers só se o lead ainda não tiver nenhum. NÃO sobrescreve
    -- resposta anterior: as duas versões importam, e comparar uma com a outra é
    -- justamente o sinal de "melhorou de renda". O histórico completo por
    -- formulário vem de meta_webhook_events, que já guarda cada payload íntegro.
    IF v_answers IS NOT NULL THEN
      UPDATE leads
      SET form_answers = v_answers, updated_at = v_now
      WHERE id = v_existing.id AND form_answers IS NULL;
    END IF;

    -- ══ NOVO: a reentrada vira estado do lead ═══════════════════════════════
    -- `kanban_order` recebe o mesmo carimbo de tempo usado no lead que entra
    -- agora: no Kanban em ordem manual, o card sobe para o topo da coluna. O
    -- destaque em si não depende disso (a tela flutua o card em qualquer
    -- ordenação) — isto é para a ordem manual não contradizer o destaque.
    UPDATE leads
    SET reentry_at      = v_now,
        reentry_count   = reentry_count + 1,
        reentry_seen_at = NULL,
        kanban_order    = EXTRACT(EPOCH FROM v_now) * 1000,
        updated_at      = v_now
    WHERE id = v_existing.id;

    -- ══ NOVO: o corretor responsável fica sabendo ═══════════════════════════
    -- Sem dono não há a quem avisar (lead antigo sem broker_id). E se a pessoa
    -- preencheu dois formulários no mesmo minuto — acontece, a Meta entrega em
    -- lote — o aviso sai uma vez só: dois pushes idênticos ensinam a ignorar.
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
