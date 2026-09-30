-- 076: Limite do rodízio do SLA — 20 transferências e o admin é avisado
--
-- O ping-pong (recapture_overdue_leads, a cada minuto) passava o lead sem 1º
-- contato de um corretor para o outro a cada 5 min úteis, SEM FIM. Em 29/09
-- eram 8 leads girando havia dias: ~750 transferências num dia, cada uma com
-- nota, notificação, push e eventos realtime para todos os clientes — 59% da
-- lead_interactions e 90% das notifications eram "Transferido
-- automaticamente", e isso pesou no bloqueio por egress.
--
-- Regra (decisão do Rafael, 29/09/2026): depois de 20 transferências por SLA
-- sem 1º contato, o rodízio para. O lead fica com quem está, sem relógio de
-- SLA (sla_due_at = NULL, o mesmo estado de quem já foi atendido), ganha uma
-- nota na timeline e cada admin ativo recebe UM aviso (com push, pelo mesmo
-- webhook das outras notificações). Daí em diante, é decisão humana:
-- transferir, cobrar ou descartar.
--
-- A contagem é por lead: o SLA só existe uma vez na vida de um lead (nasce em
-- process_meta_lead e morre no 1º contato); cliente que volta pelo formulário
-- vira lead novo, com contagem nova.

-- Consulta da contagem a cada rodada do cron
create index if not exists idx_lead_assignments_sla_recapture
  on public.lead_assignments (lead_id)
  where reason = 'sla_recapture';

CREATE OR REPLACE FUNCTION public.recapture_overdue_leads()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_limite      constant int := 20;
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
  SELECT * INTO v_dist FROM lead_distribution WHERE id = 1;

  FOR v_lead IN
    SELECT id, name, broker_id, contact_id, meta_form_id
    FROM leads
    WHERE sla_due_at IS NOT NULL
      AND sla_due_at <= v_now
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
END $function$;
