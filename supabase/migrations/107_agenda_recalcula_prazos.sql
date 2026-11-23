-- 107 · Mudar a agenda do 1º contato recalcula os prazos que ainda correm
--
-- Até aqui (085) mudar minutos ou agenda valia só para os próximos leads: os
-- prazos já calculados ficavam. Em 22/11/2026 o Rafael passou a segunda para
-- começar às 12:00 e os 13 leads do fim de semana continuaram com "até seg.,
-- 09:10" no cartão. A regra agora:
--
--   • Ao salvar a configuração, todo lead que ainda espera o 1º contato e cujo
--     prazo AINDA NÃO VENCEU tem o prazo recalculado pela agenda nova, a partir
--     do momento em que o relógio dele começou (a última atribuição, ou a
--     chegada do lead).
--   • Prazo já vencido não muda — recalcular para trás poderia transferir um
--     lead de surpresa; e o novo prazo só é gravado se ainda estiver no futuro.
--   • updated_at é tocado: o sync incremental leva a mudança aos cartões.

CREATE OR REPLACE FUNCTION public.recalcular_prazos_pendentes()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n int;
BEGIN
  WITH alvo AS (
    SELECT l.id,
           sla_deadline(COALESCE(
             (SELECT max(a.created_at) FROM lead_assignments a WHERE a.lead_id = l.id),
             l.created_at)) AS novo
    FROM leads l
    WHERE l.sla_due_at IS NOT NULL
      AND l.sla_due_at > now()
  )
  UPDATE leads l
  SET sla_due_at = alvo.novo, updated_at = now()
  FROM alvo
  WHERE l.id = alvo.id
    AND alvo.novo IS NOT NULL
    AND alvo.novo > now()
    AND alvo.novo IS DISTINCT FROM l.sla_due_at;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

-- Interna: só a gravação da configuração chama.
REVOKE ALL ON FUNCTION public.recalcular_prazos_pendentes() FROM PUBLIC, anon, authenticated;

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

  -- 107: a agenda nova vale também para quem ainda espera o 1º contato.
  PERFORM recalcular_prazos_pendentes();

  RETURN v_new;
END $function$;

REVOKE ALL ON FUNCTION public.set_lead_sla_config(boolean, int, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lead_sla_config(boolean, int, jsonb) TO authenticated;

-- A agenda já foi trocada hoje: aplica agora aos leads que estão esperando.
SELECT public.recalcular_prazos_pendentes();
