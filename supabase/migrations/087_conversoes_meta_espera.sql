-- 087 · Espera de 30 min antes de avisar o Meta de uma mudança de etapa
--
-- Na 086, arrastar um card para Visita/Proposta/Venda virava evento no Meta em
-- até 5 min. Um arraste por engano (card levado até Venda e devolvido em
-- seguida) ensinava o Meta com um sinal falso, e evento enviado não se desfaz.
--
-- Agora:
--   • Evento gerado por MUDANÇA DE ETAPA espera 30 min na fila antes de sair.
--     O event_time continua sendo a hora real da mudança.
--   • Se nesse intervalo o card voltar para uma etapa anterior, os eventos das
--     etapas que ele deixou de ter são cancelados (o que já saiu, saiu).
--     Avançar de novo depois reativa o evento, com nova espera.
--   • Sem espera: lead recebido, botão "Qualificar lead" (já tem o desfazer) e
--     venda concluída pelo formulário (closed_at + sale_id), que são atos
--     deliberados.
--
-- O que NÃO muda: quem é qualificado. QUALIFIED continua saindo só pelo botão
-- ou quando o lead chega em Visita ou além.

-- Novo motivo de cancelamento: o card recuou de etapa.
ALTER TABLE public.meta_conversion_events
  DROP CONSTRAINT IF EXISTS meta_conversion_events_cancel_reason_check;
ALTER TABLE public.meta_conversion_events
  ADD CONSTRAINT meta_conversion_events_cancel_reason_check
  CHECK (cancel_reason IN ('descartado', 'desqualificado', 'recuou'));

-- As duas funções de enfileirar ganham o parâmetro de espera. Mudar a lista de
-- parâmetros exige recriar; as permissões são refeitas no fim.
DROP FUNCTION IF EXISTS public.meta_conv_enqueue(text, text, timestamptz, text, timestamptz);
DROP FUNCTION IF EXISTS public.meta_conv_enqueue_stage(text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.meta_conv_enqueue(
  p_lead_id text, p_leadgen_id text, p_form_at timestamptz, p_event text, p_time timestamptz,
  p_delay interval DEFAULT interval '0'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_time timestamptz := LEAST(GREATEST(p_time, p_form_at + interval '1 second'), now());
BEGIN
  IF p_leadgen_id IS NULL OR p_leadgen_id !~ '^[0-9]{15,17}$' THEN
    RETURN;  -- id de teste/fora do padrão: o Meta recusaria
  END IF;

  INSERT INTO meta_conversion_events (lead_id, leadgen_id, event_name, event_time, next_attempt_at)
  VALUES (p_lead_id, p_leadgen_id, p_event, v_time, now() + p_delay)
  ON CONFLICT ON CONSTRAINT meta_conversion_events_unico DO UPDATE
    SET status          = 'pendente',
        cancel_reason   = NULL,
        event_time      = EXCLUDED.event_time,
        next_attempt_at = EXCLUDED.next_attempt_at,
        attempts        = 0,
        last_error      = NULL,
        updated_at      = now()
    WHERE meta_conversion_events.status = 'cancelado';
END $function$;

CREATE OR REPLACE FUNCTION public.meta_conv_enqueue_stage(
  p_lead_id text, p_event text, p_time timestamptz,
  p_delay interval DEFAULT interval '0'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_ordem CONSTANT text[] := ARRAY['lead_qualificado', 'visita', 'proposta', 'venda'];
  v_pos     int := array_position(c_ordem, p_event);
  v_leadgen text;
  v_form_at timestamptz;
BEGIN
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'Etapa desconhecida para o Meta: %', p_event;
  END IF;

  IF EXISTS (SELECT 1 FROM leads WHERE id = p_lead_id AND discard_reason IS NOT NULL) THEN
    RETURN;
  END IF;

  SELECT e.leadgen_id, e.received_at INTO v_leadgen, v_form_at
  FROM meta_webhook_events e
  WHERE e.lead_id = p_lead_id
    AND e.status IN ('processed', 'reentry')
    AND e.received_at <= p_time
  ORDER BY e.received_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  FOR i IN 1..v_pos LOOP
    PERFORM meta_conv_enqueue(p_lead_id, v_leadgen, v_form_at, c_ordem[i], p_time, p_delay);
  END LOOP;
END $function$;

-- Gatilho em leads: igual ao da 086, mais a espera e o cancelamento no recuo.
CREATE OR REPLACE FUNCTION public.meta_conv_on_lead_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_espera CONSTANT interval := interval '30 minutes';
  -- posição no funil que interessa ao Meta: 0 = antes de visita
  v_old int := COALESCE(array_position(ARRAY['visita', 'proposta', 'venda'], OLD.funnel_stage), 0);
  v_new int := COALESCE(array_position(ARRAY['visita', 'proposta', 'venda'], NEW.funnel_stage), 0);
BEGIN
  -- Descartou: o que ainda não saiu deixa de sair.
  IF OLD.discard_reason IS NULL AND NEW.discard_reason IS NOT NULL THEN
    UPDATE meta_conversion_events
    SET status = 'cancelado', cancel_reason = 'descartado', updated_at = now()
    WHERE lead_id = NEW.id AND status IN ('pendente', 'erro');
    RETURN NEW;
  END IF;

  IF NEW.discard_reason IS NOT NULL THEN
    RETURN NEW;  -- continua descartado: nada gera evento
  END IF;

  -- Restaurou: volta o que o descarte tinha cancelado.
  IF OLD.discard_reason IS NOT NULL THEN
    UPDATE meta_conversion_events
    SET status = 'pendente', cancel_reason = NULL, next_attempt_at = now(),
        attempts = 0, last_error = NULL, updated_at = now()
    WHERE lead_id = NEW.id AND status = 'cancelado' AND cancel_reason = 'descartado';
  END IF;

  -- Qualificação pelo botão: sem espera (o desfazer cancela o que não saiu)
  IF OLD.qualified_at IS NULL AND NEW.qualified_at IS NOT NULL THEN
    PERFORM meta_conv_enqueue_stage(NEW.id, 'lead_qualificado', NEW.qualified_at);
  ELSIF OLD.qualified_at IS NOT NULL AND NEW.qualified_at IS NULL
        AND NEW.funnel_stage NOT IN ('visita', 'proposta', 'venda')
        AND NEW.closed_at IS NULL THEN
    UPDATE meta_conversion_events
    SET status = 'cancelado', cancel_reason = 'desqualificado', updated_at = now()
    WHERE lead_id = NEW.id AND event_name = 'lead_qualificado'
      AND status IN ('pendente', 'erro');
  END IF;

  IF NEW.funnel_stage IS DISTINCT FROM OLD.funnel_stage THEN
    IF v_new > v_old THEN
      -- Avançou: enfileira com espera, para dar tempo de corrigir um engano
      PERFORM meta_conv_enqueue_stage(NEW.id, NEW.funnel_stage, now(), c_espera);
    ELSIF v_new < v_old AND NEW.closed_at IS NULL THEN
      -- Recuou: cancela o que ainda não saiu das etapas que o lead deixou de ter.
      -- O "qualificado" só cai junto se o lead saiu de visita para trás e não
      -- foi qualificado pelo botão.
      UPDATE meta_conversion_events
      SET status = 'cancelado', cancel_reason = 'recuou', updated_at = now()
      WHERE lead_id = NEW.id
        AND status IN ('pendente', 'erro')
        AND (
          COALESCE(array_position(ARRAY['visita', 'proposta', 'venda'], event_name), 0) > v_new
          OR (event_name = 'lead_qualificado' AND v_new = 0 AND NEW.qualified_at IS NULL)
        );
    END IF;
  END IF;

  -- Venda concluída pelo formulário (closed_at + sale_id): sem espera
  IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND NEW.sale_id IS NOT NULL THEN
    PERFORM meta_conv_enqueue_stage(NEW.id, 'venda', now());
  END IF;

  RETURN NEW;
END $function$;

-- Endurecimento (padrão da 030): as funções recriadas voltam a ser só internas.
REVOKE EXECUTE ON FUNCTION public.meta_conv_enqueue(text, text, timestamptz, text, timestamptz, interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_enqueue_stage(text, text, timestamptz, interval)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_on_lead_change()                                              FROM PUBLIC, anon, authenticated;
