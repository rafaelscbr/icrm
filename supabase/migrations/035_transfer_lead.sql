-- ─── Migration 035: transferência manual de lead ──────────────────────────────
-- Botão "Transferir" no LeadModal. SECURITY DEFINER porque o RLS de leads
-- (WITH CHECK broker_id = auth.uid()) impede o corretor de "dar" o lead a
-- outro via UPDATE direto. A permissão é validada aqui dentro:
-- só o dono do lead ou admin podem transferir.
-- Reaproveita a trilha de auditoria da integração Meta (lead_assignments
-- reason='manual', interação no histórico, notificação ao destino).

CREATE OR REPLACE FUNCTION public.transfer_lead(p_lead_id text, p_to_broker uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_lead       leads%ROWTYPE;
  v_actor      uuid := auth.uid();
  v_from       uuid;
  v_from_name  text;
  v_to_name    text;
  v_actor_name text;
  v_now        timestamptz := now();
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  -- Permissão: dono do lead ou admin
  IF v_actor IS NULL OR NOT (v_actor = v_lead.broker_id OR is_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para transferir este lead';
  END IF;

  IF p_to_broker IS NULL OR p_to_broker = v_lead.broker_id THEN
    RAISE EXCEPTION 'Corretor de destino inválido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_to_broker AND active) THEN
    RAISE EXCEPTION 'Corretor de destino inativo ou inexistente';
  END IF;

  v_from := v_lead.broker_id;

  UPDATE leads
  SET broker_id = p_to_broker, updated_at = v_now
  WHERE id = p_lead_id;

  -- Alinha o contato para visibilidade RLS do novo responsável
  IF v_lead.contact_id IS NOT NULL THEN
    UPDATE contacts
    SET broker_id = p_to_broker, updated_at = v_now
    WHERE id = v_lead.contact_id;
  END IF;

  SELECT name INTO v_from_name  FROM profiles WHERE id = v_from;
  SELECT name INTO v_to_name    FROM profiles WHERE id = p_to_broker;
  SELECT name INTO v_actor_name FROM profiles WHERE id = v_actor;

  -- Trilha auditável (mantém o SLA vigente — transferência não reinicia o relógio)
  INSERT INTO lead_assignments (lead_id, from_broker_id, to_broker_id, reason, sla_due_at)
  VALUES (p_lead_id, v_from, p_to_broker, 'manual', v_lead.sla_due_at);

  INSERT INTO lead_interactions
    (id, lead_id, type, description, interacted_at, created_at, broker_id)
  VALUES (
    gen_random_uuid()::text,
    p_lead_id,
    'nota',
    format('Transferido manualmente por %s: %s → %s',
      COALESCE(v_actor_name, 'Admin'),
      COALESCE(v_from_name, '—'),
      COALESCE(v_to_name, '—')
    ),
    v_now, v_now, v_actor
  );

  INSERT INTO notifications
    (user_id, type, title, body, resource_id, resource_type, read)
  VALUES (
    p_to_broker,
    'lead_assigned',
    'Lead transferido para você',
    format('%s · transferido por %s', v_lead.name, COALESCE(v_actor_name, 'Admin')),
    p_lead_id,
    'lead',
    false
  );
END $$;

-- Só usuários logados podem chamar — a checagem fina (dono ou admin) é interna
REVOKE EXECUTE ON FUNCTION public.transfer_lead(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transfer_lead(text, uuid) TO authenticated, service_role;
