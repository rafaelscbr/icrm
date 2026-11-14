-- 085 · Rodízio por SLA configurável (o "ping-pong")
--
-- Antes: prazo de 1º contato fixo em 5 min úteis, expediente fixo no código
-- (seg–sex 9h–18h, sáb 9h–13h), e a transferência automática foi pausada na
-- 084 tirando o cron. Agora o admin decide na tela de Configurações de Leads:
--   • liga/desliga a transferência automática;
--   • quantos minutos o corretor tem para registrar o 1º contato;
--   • em quais dias e horários o relógio corre e o rodízio acontece.
--
-- Regras:
--   • O relógio (sla_due_at) sempre segue a agenda — com o rodízio desligado
--     ele continua como meta visível no card, só não transfere.
--   • A transferência só acontece com o rodízio LIGADO e dentro da agenda.
--   • Ao ligar, nada do passado é transferido: só entram leads cujo prazo
--     vence depois do momento em que o rodízio foi ligado (enabled_at).
--   • Mudar minutos/agenda vale para os próximos prazos; os já calculados
--     ficam como estão.

CREATE TABLE IF NOT EXISTS public.lead_sla_config (
  id          int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled     boolean     NOT NULL DEFAULT false,
  minutes     int         NOT NULL DEFAULT 10 CHECK (minutes BETWEEN 1 AND 240),
  -- 7 posições, índice = dia da semana (0 = domingo … 6 = sábado)
  -- cada uma: {"on": bool, "start": "HH:MM", "end": "HH:MM"}
  schedule    jsonb       NOT NULL CHECK (jsonb_typeof(schedule) = 'array' AND jsonb_array_length(schedule) = 7),
  enabled_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES public.profiles(id)
);

-- Volta ligado, com 10 min e o mesmo expediente que o código usava.
INSERT INTO public.lead_sla_config (id, enabled, minutes, schedule, enabled_at)
VALUES (1, true, 10, '[
  {"on": false, "start": "09:00", "end": "13:00"},
  {"on": true,  "start": "09:00", "end": "18:00"},
  {"on": true,  "start": "09:00", "end": "18:00"},
  {"on": true,  "start": "09:00", "end": "18:00"},
  {"on": true,  "start": "09:00", "end": "18:00"},
  {"on": true,  "start": "09:00", "end": "18:00"},
  {"on": true,  "start": "09:00", "end": "13:00"}
]'::jsonb, now())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.lead_sla_config ENABLE ROW LEVEL SECURITY;

-- Todos leem (o card mostra "X min" e se há transferência); ninguém grava
-- direto — só pela função abaixo, que exige admin e valida a agenda.
DROP POLICY IF EXISTS lead_sla_config_select ON public.lead_sla_config;
CREATE POLICY lead_sla_config_select ON public.lead_sla_config
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.lead_sla_config FROM anon, authenticated;
GRANT SELECT ON public.lead_sla_config TO authenticated;

-- ── Gravação (só admin) ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_lead_sla_config(p_enabled boolean, p_minutes int, p_schedule jsonb)
RETURNS public.lead_sla_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old  lead_sla_config%ROWTYPE;
  v_new  lead_sla_config%ROWTYPE;
  v_dia  jsonb;
  v_on   int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN
    RAISE EXCEPTION 'Só o admin pode mudar o rodízio por SLA';
  END IF;

  IF p_minutes IS NULL OR p_minutes < 1 OR p_minutes > 240 THEN
    RAISE EXCEPTION 'O prazo precisa ficar entre 1 e 240 minutos';
  END IF;

  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) <> 'array' OR jsonb_array_length(p_schedule) <> 7 THEN
    RAISE EXCEPTION 'Agenda inválida: são 7 dias, de domingo a sábado';
  END IF;

  FOR i IN 0..6 LOOP
    v_dia := p_schedule -> i;
    IF jsonb_typeof(v_dia -> 'on') <> 'boolean'
       OR (v_dia ->> 'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_dia ->> 'end')   !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Agenda inválida no dia %', i;
    END IF;
    IF (v_dia ->> 'on')::boolean THEN
      IF (v_dia ->> 'start')::time >= (v_dia ->> 'end')::time THEN
        RAISE EXCEPTION 'O horário de início precisa ser antes do fim (dia %)', i;
      END IF;
      v_on := v_on + 1;
    END IF;
  END LOOP;

  IF v_on = 0 THEN
    RAISE EXCEPTION 'Deixe pelo menos um dia na agenda — para parar as transferências, desligue o rodízio';
  END IF;

  SELECT * INTO v_old FROM lead_sla_config WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração do rodízio não encontrada';
  END IF;

  UPDATE lead_sla_config
  SET enabled    = p_enabled,
      minutes    = p_minutes,
      schedule   = p_schedule,
      -- religar marca o corte: prazos vencidos antes disso não são transferidos
      enabled_at = CASE WHEN p_enabled AND NOT v_old.enabled THEN now() ELSE v_old.enabled_at END,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = 1
  RETURNING * INTO v_new;

  RETURN v_new;
END $function$;

REVOKE ALL ON FUNCTION public.set_lead_sla_config(boolean, int, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lead_sla_config(boolean, int, jsonb) TO authenticated;

-- ── Prazo: soma N minutos dentro das janelas da agenda ───────────────────────
-- Sem agenda (não deveria acontecer — a gravação exige 1 dia) devolve NULL:
-- o lead entra sem relógio em vez de travar a entrada do lead.
CREATE OR REPLACE FUNCTION public.sla_deadline(from_ts timestamp with time zone)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  tz      CONSTANT text := 'America/Sao_Paulo';
  v_cfg   lead_sla_config%ROWTYPE;
  v_cur   timestamp := from_ts AT TIME ZONE tz;
  v_dia   date      := (from_ts AT TIME ZONE tz)::date;
  v_rest  numeric;
  v_j     jsonb;
  v_ini   timestamp;
  v_fim   timestamp;
  v_disp  numeric;
BEGIN
  SELECT * INTO v_cfg FROM lead_sla_config WHERE id = 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_rest := v_cfg.minutes;

  FOR i IN 0..14 LOOP
    v_j := v_cfg.schedule -> EXTRACT(DOW FROM v_dia)::int;
    IF COALESCE((v_j ->> 'on')::boolean, false) THEN
      v_ini := GREATEST(v_dia + (v_j ->> 'start')::time, v_cur);
      v_fim := v_dia + (v_j ->> 'end')::time;
      IF v_fim > v_ini THEN
        v_disp := EXTRACT(EPOCH FROM (v_fim - v_ini)) / 60.0;
        IF v_rest <= v_disp THEN
          RETURN (v_ini + v_rest * interval '1 minute') AT TIME ZONE tz;
        END IF;
        v_rest := v_rest - v_disp;
      END IF;
    END IF;
    v_dia := v_dia + 1;
  END LOOP;

  RETURN NULL;
END $function$;

-- ── Rodízio: só ligado, só dentro da agenda, só prazos depois de ligar ───────
CREATE OR REPLACE FUNCTION public.recapture_overdue_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tz            constant text := 'America/Sao_Paulo';
  c_limite      constant int  := 20;
  v_cfg         lead_sla_config%ROWTYPE;
  v_local       timestamp;
  v_hoje        jsonb;
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
  SELECT * INTO v_cfg FROM lead_sla_config WHERE id = 1;
  IF NOT FOUND OR NOT v_cfg.enabled OR v_cfg.enabled_at IS NULL THEN
    RETURN 0;
  END IF;

  -- Fora da agenda ninguém perde lead: espera a próxima janela.
  v_local := v_now AT TIME ZONE tz;
  v_hoje  := v_cfg.schedule -> EXTRACT(DOW FROM v_local)::int;
  IF NOT COALESCE((v_hoje ->> 'on')::boolean, false)
     OR v_local::time <  (v_hoje ->> 'start')::time
     OR v_local::time >= (v_hoje ->> 'end')::time THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_dist FROM lead_distribution WHERE id = 1;

  FOR v_lead IN
    SELECT id, name, broker_id, contact_id, meta_form_id
    FROM leads
    WHERE sla_due_at IS NOT NULL
      AND sla_due_at <= v_now
      AND sla_due_at >  v_cfg.enabled_at
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
      format('Transferido automaticamente: %s não registrou o 1º contato em %s min → %s',
        COALESCE(v_from_name, 'Corretor anterior'), v_cfg.minutes, COALESCE(v_to_name, 'Novo responsável')),
      v_now, v_now, NULL
    );

    INSERT INTO notifications
      (user_id, type, title, body, resource_id, resource_type, read)
    VALUES (
      v_next_broker, 'lead_recaptured', 'Lead transferido para você',
      format('%s · %s não registrou o 1º contato em %s min',
        COALESCE(NULLIF(v_lead.name, ''), 'Lead'), COALESCE(v_from_name, 'O corretor anterior'), v_cfg.minutes),
      v_lead.id, 'lead', false
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;

-- O cron volta a rodar a cada minuto; com o rodízio desligado a função sai
-- na primeira linha. Liga/desliga é pela tela, não pelo cron.
SELECT cron.unschedule('recapture-leads-sla')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recapture-leads-sla');
SELECT cron.schedule('recapture-leads-sla', '* * * * *', 'SELECT public.recapture_overdue_leads()');
