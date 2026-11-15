-- 086 · Devolve ao Meta o que acontece com o lead (API de Conversões para CRM)
--
-- A campanha otimiza para "lead qualificado", mas o conjunto de dados do Meta
-- não recebe evento desde 25/09/2026. Esta migração monta a parte do banco:
--
--   1. leads.qualified_at / qualified_by — o botão "Qualificar lead".
--   2. meta_conversion_events — fila de saída, 1 linha por (leadgen_id, evento).
--   3. Gatilhos que enfileiram: lead recebido, qualificado, visita, proposta, venda.
--   4. Funções da fila para a Edge Function `meta-conversions` (service_role).
--   5. Visão e ações do admin.
--   6. Agendamento (pg_cron → pg_net → Edge Function), a cada 5 min.
--   7. Carga inicial (função; roda uma vez, à mão, depois da implantação).
--
-- Regras do Meta que moldam o desenho (documentação lida em 14/11/2026):
--   • event_time com mais de 7 dias derruba o envio INTEIRO → a fila expira o
--     evento antes disso e a função envia 1 evento por chamada.
--   • event_time precisa ser posterior ao envio do formulário.
--   • O Meta casa a etapa pelo nome exato → nomes fixos, em minúsculas (CHECK).
--   • Nenhum dado pessoal sai daqui: só o leadgen_id.
--
-- Regras do iCRM:
--   • Só lead que veio de formulário do Meta (tem leadgen_id) gera evento.
--   • Lead descartado não gera evento: o que ainda não saiu é cancelado.
--   • Desfazer a qualificação não avisa o Meta; só cancela o que não saiu.
--   • A fonte é a linha de `leads` (gatilho), não o histórico stage_change:
--     o histórico é gravado depois e pode falhar, e a venda concluída
--     (closed_at + sale_id) nem passa por mudança de etapa.
--   • Lead que pula etapas envia também as do meio (venda ⇒ proposta, visita,
--     qualificado) — o Meta precisa do funil completo.

-- ── 1. Qualificação no lead ──────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualified_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.leads.qualified_at IS
  'Quando o lead foi marcado como qualificado (botão no detalhe). Gravado só por set_lead_qualified; o upsert do front não toca.';
COMMENT ON COLUMN public.leads.qualified_by IS
  'Quem qualificou. Nulo junto com qualified_at quando a qualificação é desfeita.';

-- ── 2. Fila de saída ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_conversion_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),  -- vira o event_id no Meta
  lead_id         text        REFERENCES public.leads(id) ON DELETE SET NULL,
  leadgen_id      text        NOT NULL CHECK (leadgen_id ~ '^[0-9]{15,17}$'),
  event_name      text        NOT NULL CHECK (event_name IN
                    ('lead_recebido', 'lead_qualificado', 'visita', 'proposta', 'venda')),
  event_time      timestamptz NOT NULL,
  status          text        NOT NULL DEFAULT 'pendente' CHECK (status IN
                    ('pendente', 'enviando', 'enviado', 'erro', 'expirado', 'cancelado')),
  cancel_reason   text        CHECK (cancel_reason IN ('descartado', 'desqualificado')),
  attempts        int         NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at       timestamptz,
  sent_at         timestamptz,
  sent_as_test    boolean     NOT NULL DEFAULT false,
  http_status     int,
  response        jsonb,       -- resposta do Meta, como veio
  fbtrace_id      text,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- um evento por lead do Meta e por etapa: é o que impede enfileirar em dobro
  CONSTRAINT meta_conversion_events_unico UNIQUE (leadgen_id, event_name)
);

CREATE INDEX IF NOT EXISTS idx_mce_fila
  ON public.meta_conversion_events (next_attempt_at)
  WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_mce_lead
  ON public.meta_conversion_events (lead_id);

-- Estado da última execução do envio (linha única) — é por aqui que a tela do
-- admin sabe se o token está faltando ou se o modo de teste está ligado.
CREATE TABLE IF NOT EXISTS public.meta_conversion_state (
  id            int         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at   timestamptz,
  last_run_note text,
  test_mode     boolean     NOT NULL DEFAULT false
);
INSERT INTO public.meta_conversion_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.meta_conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_conversion_state  ENABLE ROW LEVEL SECURITY;

-- Só o admin lê; ninguém grava pelo app (só gatilhos e service_role).
DROP POLICY IF EXISTS meta_conversion_events_admin_select ON public.meta_conversion_events;
CREATE POLICY meta_conversion_events_admin_select ON public.meta_conversion_events
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS meta_conversion_state_admin_select ON public.meta_conversion_state;
CREATE POLICY meta_conversion_state_admin_select ON public.meta_conversion_state
  FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.meta_conversion_events FROM anon, authenticated;
REVOKE ALL ON public.meta_conversion_state  FROM anon, authenticated;
GRANT SELECT ON public.meta_conversion_events TO authenticated;
GRANT SELECT ON public.meta_conversion_state  TO authenticated;

-- ── 3. Enfileirar ────────────────────────────────────────────────────────────
-- Insere 1 evento. Repetido é ignorado; cancelado volta a pendente (lead
-- restaurado ou qualificado de novo). event_time nunca fica antes do formulário
-- nem no futuro.
CREATE OR REPLACE FUNCTION public.meta_conv_enqueue(
  p_lead_id text, p_leadgen_id text, p_form_at timestamptz, p_event text, p_time timestamptz
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

  INSERT INTO meta_conversion_events (lead_id, leadgen_id, event_name, event_time)
  VALUES (p_lead_id, p_leadgen_id, p_event, v_time)
  ON CONFLICT ON CONSTRAINT meta_conversion_events_unico DO UPDATE
    SET status          = 'pendente',
        cancel_reason   = NULL,
        event_time      = EXCLUDED.event_time,
        next_attempt_at = now(),
        attempts        = 0,
        last_error      = NULL,
        updated_at      = now()
    WHERE meta_conversion_events.status = 'cancelado';
END $function$;

-- Enfileira a etapa alcançada e as anteriores que ela implica, no formulário
-- do Meta mais recente desse lead até aquele momento. Lead sem formulário do
-- Meta ou descartado: não faz nada.
CREATE OR REPLACE FUNCTION public.meta_conv_enqueue_stage(
  p_lead_id text, p_event text, p_time timestamptz
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
    PERFORM meta_conv_enqueue(p_lead_id, v_leadgen, v_form_at, c_ordem[i], p_time);
  END LOOP;
END $function$;

-- Gatilho em leads: etapa, venda concluída, qualificação, descarte/restauração.
CREATE OR REPLACE FUNCTION public.meta_conv_on_lead_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Qualificação (botão)
  IF OLD.qualified_at IS NULL AND NEW.qualified_at IS NOT NULL THEN
    PERFORM meta_conv_enqueue_stage(NEW.id, 'lead_qualificado', NEW.qualified_at);
  ELSIF OLD.qualified_at IS NOT NULL AND NEW.qualified_at IS NULL
        AND NEW.funnel_stage NOT IN ('visita', 'proposta', 'venda')
        AND NEW.closed_at IS NULL THEN
    -- Desfez: não avisa o Meta; só cancela se ainda não saiu. Lead que já
    -- chegou em visita ou além continua qualificado para o Meta.
    UPDATE meta_conversion_events
    SET status = 'cancelado', cancel_reason = 'desqualificado', updated_at = now()
    WHERE lead_id = NEW.id AND event_name = 'lead_qualificado'
      AND status IN ('pendente', 'erro');
  END IF;

  -- Mudança de etapa (hora do banco, não a do navegador)
  IF NEW.funnel_stage IS DISTINCT FROM OLD.funnel_stage
     AND NEW.funnel_stage IN ('visita', 'proposta', 'venda') THEN
    PERFORM meta_conv_enqueue_stage(NEW.id, NEW.funnel_stage, now());
  END IF;

  -- Venda concluída: closed_at + sale_id, sem passar por mudança de etapa
  IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL AND NEW.sale_id IS NOT NULL THEN
    PERFORM meta_conv_enqueue_stage(NEW.id, 'venda', now());
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_meta_conv_lead ON public.leads;
CREATE TRIGGER trg_meta_conv_lead
  AFTER UPDATE OF funnel_stage, closed_at, sale_id, qualified_at, discard_reason ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.meta_conv_on_lead_change();

-- Gatilho no webhook: formulário processado (lead novo ou reentrada) = "lead recebido".
CREATE OR REPLACE FUNCTION public.meta_conv_on_webhook_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('processed', 'reentry')
     AND NEW.lead_id IS NOT NULL
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT EXISTS (SELECT 1 FROM leads WHERE id = NEW.lead_id AND discard_reason IS NOT NULL) THEN
    PERFORM meta_conv_enqueue(NEW.lead_id, NEW.leadgen_id, NEW.received_at, 'lead_recebido', NEW.received_at);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_meta_conv_webhook ON public.meta_webhook_events;
CREATE TRIGGER trg_meta_conv_webhook
  AFTER UPDATE OF status ON public.meta_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.meta_conv_on_webhook_event();

-- ── 4. Fila para a Edge Function (service_role) ──────────────────────────────
-- Reserva o próximo lote. Antes: expira o que está perto do limite de 7 dias
-- do Meta e devolve à fila o que ficou travado em "enviando" (função caiu no
-- meio). Reenvio de travado é seguro: o Meta descarta event_id repetido.
CREATE OR REPLACE FUNCTION public.meta_conv_claim(p_limit int DEFAULT 50)
RETURNS SETOF public.meta_conversion_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE meta_conversion_events
  SET status = 'pendente', locked_at = NULL, updated_at = now()
  WHERE status = 'enviando' AND locked_at < now() - interval '10 minutes';

  UPDATE meta_conversion_events
  SET status = 'expirado', updated_at = now(),
      last_error = COALESCE(last_error, 'Passou do limite de 7 dias do Meta antes de ser enviado')
  WHERE status = 'pendente' AND event_time < now() - interval '6 days 23 hours';

  RETURN QUERY
  UPDATE meta_conversion_events q
  SET status = 'enviando', locked_at = now(), attempts = q.attempts + 1, updated_at = now()
  WHERE q.id IN (
    SELECT id FROM meta_conversion_events
    WHERE status = 'pendente' AND next_attempt_at <= now()
    ORDER BY event_time, created_at
    LIMIT GREATEST(1, LEAST(p_limit, 200))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING q.*;
END $function$;

-- Registra o desfecho de um envio.
--   enviado  → concluído.
--   tentar   → volta à fila com espera crescente (2, 4, 8… min, teto de 6 h).
--   erro     → o Meta recusou o evento; fica visível para o admin.
--   expirado → passou do limite de idade.
CREATE OR REPLACE FUNCTION public.meta_conv_report(
  p_id uuid, p_outcome text, p_http int, p_response jsonb, p_error text, p_test boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_outcome NOT IN ('enviado', 'tentar', 'erro', 'expirado') THEN
    RAISE EXCEPTION 'Desfecho inválido: %', p_outcome;
  END IF;

  UPDATE meta_conversion_events
  SET status          = CASE p_outcome WHEN 'tentar' THEN 'pendente' ELSE p_outcome END,
      locked_at       = NULL,
      sent_at         = CASE WHEN p_outcome = 'enviado' THEN now() ELSE sent_at END,
      sent_as_test    = CASE WHEN p_outcome = 'enviado' THEN COALESCE(p_test, false) ELSE sent_as_test END,
      next_attempt_at = CASE WHEN p_outcome = 'tentar'
                          THEN now() + LEAST(interval '6 hours', interval '1 minute' * power(2, LEAST(attempts, 10)))
                          ELSE next_attempt_at END,
      http_status     = p_http,
      response        = p_response,
      fbtrace_id      = COALESCE(p_response ->> 'fbtrace_id', p_response -> 'error' ->> 'fbtrace_id', fbtrace_id),
      last_error      = CASE WHEN p_outcome = 'enviado' THEN NULL ELSE p_error END,
      updated_at      = now()
  WHERE id = p_id AND status = 'enviando';
END $function$;

CREATE OR REPLACE FUNCTION public.meta_conv_heartbeat(p_note text, p_test boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE meta_conversion_state
  SET last_run_at = now(), last_run_note = p_note, test_mode = COALESCE(p_test, false)
  WHERE id = 1;
$function$;

-- ── 5. Qualificar / desfazer (corretor do lead ou admin) ─────────────────────
CREATE OR REPLACE FUNCTION public.set_lead_qualified(p_lead_id text, p_qualified boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_lead  leads%ROWTYPE;
  v_now   timestamptz := now();
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  IF v_actor IS NULL OR NOT (v_actor = v_lead.broker_id OR is_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para qualificar este lead';
  END IF;

  IF p_qualified AND v_lead.discard_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Lead descartado não pode ser qualificado — restaure o lead antes';
  END IF;

  -- Já está no estado pedido: devolve o que há, sem regravar quem/quando.
  IF p_qualified = (v_lead.qualified_at IS NOT NULL) THEN
    RETURN jsonb_build_object('qualified_at', v_lead.qualified_at, 'qualified_by', v_lead.qualified_by);
  END IF;

  UPDATE leads
  SET qualified_at = CASE WHEN p_qualified THEN v_now   END,
      qualified_by = CASE WHEN p_qualified THEN v_actor END,
      updated_at   = v_now   -- sync incremental depende disto
  WHERE id = p_lead_id;

  INSERT INTO lead_interactions
    (id, lead_id, type, description, interacted_at, created_at, broker_id)
  VALUES (
    gen_random_uuid()::text, p_lead_id, 'nota',
    CASE WHEN p_qualified THEN 'Lead qualificado' ELSE 'Qualificação desfeita' END,
    v_now, v_now, v_actor
  );

  RETURN jsonb_build_object(
    'qualified_at', CASE WHEN p_qualified THEN v_now   END,
    'qualified_by', CASE WHEN p_qualified THEN v_actor END
  );
END $function$;

-- ── 6. Visão e ações do admin ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.meta_conv_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Só o admin vê os eventos enviados ao Meta';
  END IF;

  SELECT jsonb_build_object(
    'state', (SELECT to_jsonb(s) - 'id' FROM meta_conversion_state s WHERE id = 1),
    'totals', (
      SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
      FROM (SELECT status, count(*) AS n FROM meta_conversion_events GROUP BY status) t
    ),
    -- pendentes que já falharam ao menos uma vez (rede, token, limite do Meta)
    'retrying', (SELECT count(*) FROM meta_conversion_events
                 WHERE status = 'pendente' AND last_error IS NOT NULL),
    'sent_by_event', (
      SELECT COALESCE(jsonb_object_agg(event_name, n), '{}'::jsonb)
      FROM (SELECT event_name, count(*) AS n FROM meta_conversion_events
            WHERE status = 'enviado' AND sent_at > now() - interval '30 days'
            GROUP BY event_name) t
    ),
    'last_sent_at', (SELECT max(sent_at) FROM meta_conversion_events WHERE status = 'enviado'),
    'problems', (
      SELECT COALESCE(jsonb_agg(p ORDER BY p.updated_at DESC), '[]'::jsonb)
      FROM (
        SELECT q.id, q.lead_id, l.name AS lead_name, q.event_name, q.status,
               q.event_time, q.attempts, q.http_status, q.last_error, q.fbtrace_id, q.updated_at
        FROM meta_conversion_events q
        LEFT JOIN leads l ON l.id = q.lead_id
        WHERE q.status = 'erro' OR (q.status = 'pendente' AND q.last_error IS NOT NULL)
        ORDER BY q.updated_at DESC
        LIMIT 30
      ) p
    )
  ) INTO v_out;

  RETURN v_out;
END $function$;

-- "Tentar de novo": devolve à fila os eventos com erro (um, ou todos). O que
-- já passou do limite de idade vira expirado em vez de voltar.
CREATE OR REPLACE FUNCTION public.meta_conv_retry(p_id uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n int;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Só o admin pode reenviar eventos ao Meta';
  END IF;

  UPDATE meta_conversion_events
  SET status = 'expirado', updated_at = now()
  WHERE status = 'erro' AND (p_id IS NULL OR id = p_id)
    AND event_time < now() - interval '6 days 23 hours';

  UPDATE meta_conversion_events
  SET status = 'pendente', next_attempt_at = now(), attempts = 0, updated_at = now()
  WHERE (p_id IS NULL OR id = p_id)
    AND (status = 'erro' OR (status = 'pendente' AND last_error IS NOT NULL));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM meta_conv_dispatch();
  RETURN v_n;
END $function$;

-- ── 7. Agendamento: pg_cron → pg_net → Edge Function ─────────────────────────
-- Segredo do gancho gerado aqui dentro do Vault (não passa pelo repositório);
-- a Edge Function lê pelo get_secret (migração 036).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'meta_capi_hook_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'meta_capi_hook_secret',
      'Autentica o pg_cron na Edge Function meta-conversions'
    );
  END IF;
END $$;

-- Chama a Edge Function só quando há o que enviar.
CREATE OR REPLACE FUNCTION public.meta_conv_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM meta_conversion_events
    WHERE (status = 'pendente' AND next_attempt_at <= now())
       OR (status = 'enviando' AND locked_at < now() - interval '10 minutes')
  ) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'meta_capi_hook_secret';
  IF v_secret IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := 'https://dczexbzsfdavcrwiungk.supabase.co/functions/v1/meta-conversions',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
    body    := '{}'::jsonb
  );
END $function$;

SELECT cron.unschedule('meta-conversions-send')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-conversions-send');

SELECT cron.schedule('meta-conversions-send', '*/5 * * * *', 'SELECT public.meta_conv_dispatch()');

-- ── 8. Carga inicial ─────────────────────────────────────────────────────────
-- Enfileira o que aconteceu nos últimos dias e ainda cabe no limite do Meta,
-- com a hora REAL de cada fato (o Meta proíbe ajustar event_time). Pode rodar
-- mais de uma vez: a chave única ignora o que já está na fila.
-- NÃO roda sozinha — executar à mão depois de validar o envio:
--   SELECT public.meta_conv_backfill();
CREATE OR REPLACE FUNCTION public.meta_conv_backfill()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_corte  CONSTANT timestamptz := now() - interval '6 days 12 hours';
  v_antes  int;
  v_depois int;
  r        record;
BEGIN
  SELECT count(*) INTO v_antes FROM meta_conversion_events;

  -- Lead recebido: cada formulário processado na janela
  FOR r IN
    SELECT e.lead_id, e.leadgen_id, e.received_at
    FROM meta_webhook_events e
    JOIN leads l ON l.id = e.lead_id
    WHERE e.status IN ('processed', 'reentry')
      AND e.received_at > c_corte
      AND l.discard_reason IS NULL
  LOOP
    PERFORM meta_conv_enqueue(r.lead_id, r.leadgen_id, r.received_at, 'lead_recebido', r.received_at);
  END LOOP;

  -- Etapas alcançadas na janela: histórico, etapa atual e venda concluída
  FOR r IN
    SELECT x.lead_id, x.evento, min(x.quando) AS quando
    FROM (
      SELECT i.lead_id, i.to_stage AS evento, i.interacted_at AS quando
      FROM lead_interactions i
      WHERE i.type = 'stage_change' AND i.to_stage IN ('visita', 'proposta', 'venda')
        AND i.interacted_at > c_corte
      UNION ALL
      SELECT l.id, l.funnel_stage, l.stage_changed_at
      FROM leads l
      WHERE l.funnel_stage IN ('visita', 'proposta', 'venda') AND l.stage_changed_at > c_corte
      UNION ALL
      SELECT l.id, 'venda', l.closed_at
      FROM leads l
      WHERE l.closed_at > c_corte AND l.sale_id IS NOT NULL
      UNION ALL
      SELECT l.id, 'lead_qualificado', l.qualified_at
      FROM leads l
      WHERE l.qualified_at > c_corte
    ) x
    GROUP BY x.lead_id, x.evento
    ORDER BY min(x.quando)
  LOOP
    PERFORM meta_conv_enqueue_stage(r.lead_id, r.evento, LEAST(r.quando, now()));
  END LOOP;

  SELECT count(*) INTO v_depois FROM meta_conversion_events;
  RETURN v_depois - v_antes;
END $function$;

-- ── 9. Endurecimento (padrão da migração 030) ────────────────────────────────
-- Funções internas: só gatilho, cron e Edge Function (service_role).
REVOKE EXECUTE ON FUNCTION public.meta_conv_enqueue(text, text, timestamptz, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_enqueue_stage(text, text, timestamptz)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_on_lead_change()                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_on_webhook_event()                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_claim(int)                                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_report(uuid, text, int, jsonb, text, boolean)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_heartbeat(text, boolean)                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_dispatch()                                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.meta_conv_backfill()                                          FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.meta_conv_claim(int)                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_conv_report(uuid, text, int, jsonb, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_conv_heartbeat(text, boolean)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_conv_dispatch()                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_conv_backfill()                                    TO service_role;

-- Funções chamadas pelo app: validam quem chama por dentro.
REVOKE ALL ON FUNCTION public.set_lead_qualified(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meta_conv_summary()               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meta_conv_retry(uuid)             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lead_qualified(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meta_conv_summary()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.meta_conv_retry(uuid)             TO authenticated;
