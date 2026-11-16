-- 090 · O admin é avisado quando um corretor pausa o recebimento de leads
--
-- A 089 deixou o corretor pausar o próprio recebimento pelo menu do perfil, e o
-- admin só ficava sabendo se abrisse Leads › Configurações. Agora, no momento em
-- que a pausa é gravada, todo admin ativo recebe um aviso (sino, som e push):
--
--   "Dionata Alves pausou o recebimento de leads"
--   "Intervalo de 30 min · volta às 15:48"
--
-- Regras:
--   • Quem pausa não avisa a si mesmo: o admin que pausa o próprio recebimento
--     não recebe o aviso.
--   • Pausar de novo (trocar 30 min por 2 h) é uma pausa nova e avisa de novo.
--   • A volta não gera aviso: ela é automática, pela hora de fim, e não existe
--     um evento no banco quando o intervalo acaba.
--   • O aviso aponta para a tela de Leads (resource_type = 'lead', sem lead).
--
-- Só muda pause_lead_intake: a função é a mesma da 089 mais o INSERT do aviso.
-- Roleta, rodízio por tempo de resposta e as demais funções ficam como estão.

CREATE OR REPLACE FUNCTION public.pause_lead_intake(p_preset text)
RETURNS public.lead_intake_pauses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tz       constant text := 'America/Sao_Paulo';
  v_uid    uuid := auth.uid();
  v_now    timestamptz := now();
  v_until  timestamptz;
  v_nome   text;
  v_row    lead_intake_pauses%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo para pausar o recebimento';
  END IF;

  SELECT name INTO v_nome FROM profiles WHERE id = v_uid AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário inativo não recebe leads';
  END IF;

  v_until := CASE p_preset
    WHEN '30min' THEN v_now + interval '30 minutes'
    WHEN '1h'    THEN v_now + interval '1 hour'
    WHEN '2h'    THEN v_now + interval '2 hours'
    WHEN '3h'    THEN v_now + interval '3 hours'
    -- dia todo = até a meia-noite de hoje, no horário de Brasília
    WHEN 'dia'   THEN (date_trunc('day', v_now AT TIME ZONE tz) + interval '1 day') AT TIME ZONE tz
  END;
  IF v_until IS NULL THEN
    RAISE EXCEPTION 'Intervalo inválido: escolha 30 min, 1 h, 2 h, 3 h ou dia todo';
  END IF;

  -- Pausa nova substitui a que estiver aberta (em vigor ou já vencida).
  UPDATE lead_intake_pauses
  SET ended_at = LEAST(v_now, until_at),
      ended_by = CASE WHEN until_at > v_now THEN v_uid END
  WHERE broker_id = v_uid AND ended_at IS NULL;

  INSERT INTO lead_intake_pauses (broker_id, preset, started_at, until_at)
  VALUES (v_uid, p_preset, v_now, v_until)
  RETURNING * INTO v_row;

  -- 090: avisa os admins (menos quem pausou).
  INSERT INTO notifications
    (user_id, type, title, body, resource_id, resource_type, read)
  SELECT p.id, 'lead_intake_paused',
         format('%s pausou o recebimento de leads', COALESCE(NULLIF(trim(v_nome), ''), 'Um corretor')),
         CASE p_preset
           WHEN 'dia' THEN 'Dia todo · volta amanhã'
           ELSE format('Intervalo de %s · volta às %s',
                  CASE p_preset WHEN '30min' THEN '30 min' WHEN '1h' THEN '1 h' WHEN '2h' THEN '2 h' ELSE '3 h' END,
                  to_char(v_until AT TIME ZONE tz, 'HH24:MI'))
         END,
         NULL, 'lead', false
  FROM profiles p
  WHERE p.role = 'admin' AND p.active AND p.id <> v_uid;

  RETURN v_row;
END $function$;

REVOKE ALL ON FUNCTION public.pause_lead_intake(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_lead_intake(text) TO authenticated;
