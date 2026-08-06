-- 073: Falar com um lead fora da ordem da fila
--
-- A fila decide em quem ligar, e isso continua certo: é o que impede dois
-- corretores de ligarem para a mesma pessoa e o que garante que quem levou
-- toque recente vá para o fim. Mas a vida acontece fora da ordem — o lead com
-- retorno marcado para quinta liga de volta na terça, o corretor encontra a
-- pessoa numa visita, o cliente responde no WhatsApp de madrugada.
--
-- Até agora, nesses casos, não havia onde registrar. O corretor esperava o
-- sistema oferecer alguém com quem ele já tinha conversado — e enquanto isso o
-- lead ficava com o desfecho antigo, na coluna errada, com a cadência contando
-- um retorno que já aconteceu.
--
-- A saída NÃO é deixar o quadro gravar desfecho por conta própria. Desfecho tem
-- efeito em cadeia (muda coluna, marca o próximo toque, alimenta o relatório) e
-- duas telas gravando por caminhos diferentes é como elas passam a discordar. O
-- que muda aqui é só COMO o lead chega à mão do corretor: em vez de a fila
-- escolher, ele pode pedir um específico. Dali para frente é o mesmo discador,
-- o mesmo registro, os mesmos botões.
--
-- A reserva continua valendo. Pedir um lead que está na mão de outro corretor
-- agora dá erro, exatamente como se a fila o tivesse pulado.
--
-- Decisão do Rafael (06/08/2026): conversa que aconteceu fora da fila CONTA na
-- meta do dia — houve conversa de verdade, que é o que a meta mede. Fica
-- gravado de onde veio (`call_logs.origem`), para o relatório poder separar se
-- um dia isso virar assunto.


-- ── 1. De onde veio a tentativa ─────────────────────────────────────────────
alter table public.call_logs
  add column if not exists origem text not null default 'fila';

alter table public.call_logs
  drop constraint if exists call_logs_origem_check;

alter table public.call_logs
  add constraint call_logs_origem_check
  check (origem = any (array['fila', 'manual']));

comment on column public.call_logs.origem is
  '`fila` = o discador entregou o lead. `manual` = o corretor pediu este lead específico (falou fora da ordem). Ver migração 073.';


-- ── 2. O payload do lead, num lugar só ──────────────────────────────────────
-- `next_call_lead` e `claim_call_lead` precisam devolver EXATAMENTE a mesma
-- forma: é o mesmo `atual` do discador, lido pelo mesmo componente. Duas cópias
-- do jsonb_build_object divergiriam no primeiro campo novo, e o bug apareceria
-- só num dos dois caminhos — o mais difícil de achar.
create or replace function public.call_lead_payload(p_queue_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  SELECT jsonb_build_object(
    'id',             q.id,
    'campaignId',     q.campaign_id,
    'contactId',      q.contact_id,
    'listId',         q.list_id,
    'name',           c.name,
    'phone',          c.phone,
    'status',         q.status,
    'attemptCount',   q.attempt_count,
    'nextAttemptAt',  q.next_attempt_at,
    'lastCallAt',     q.last_call_at,
    'lastOutcome',    q.last_outcome,
    'notes',          q.notes,
    'claimedUntil',   q.claimed_until,
    'lastTouchAt',    c.last_touch_at,
    'perfil',         c.base_lead_profile,
    'historico', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id',         cl.id,
               'calledAt',   cl.called_at,
               'outcome',    cl.outcome,
               'attempt',    cl.attempt_number,
               'notes',      cl.notes,
               'brokerId',   cl.broker_id,
               'brokerName', pr.name
             ) ORDER BY cl.called_at DESC)
        FROM public.call_logs cl
        LEFT JOIN public.profiles pr ON pr.id = cl.broker_id
       WHERE cl.contact_id = q.contact_id
    ), '[]'::jsonb)
  )
  FROM public.call_queue q
  JOIN public.contacts c ON c.id = q.contact_id
  WHERE q.id = p_queue_id;
$function$;

revoke execute on function public.call_lead_payload(text) from public, anon;
grant  execute on function public.call_lead_payload(text) to authenticated;


-- ── 3. next_call_lead passa a usar o payload comum ──────────────────────────
create or replace function public.next_call_lead(p_campaign_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_minutes  int;
  v_status   text;
  v_id       text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente';
  END IF;
  IF NOT public.is_call_campaign_member(p_campaign_id) THEN
    RAISE EXCEPTION 'Você não participa desta campanha de ligação';
  END IF;

  SELECT status, claim_minutes INTO v_status, v_minutes
    FROM public.call_campaigns WHERE id = p_campaign_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Campanha de ligação não encontrada';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Campanha % — reative para continuar ligando',
      CASE v_status WHEN 'paused' THEN 'pausada' ELSE 'finalizada' END;
  END IF;

  SELECT q.id INTO v_id
    FROM public.call_queue q
    JOIN public.contacts c ON c.id = q.contact_id
   WHERE q.campaign_id = p_campaign_id
     AND q.status IN ('fila', 'tentativa', 'retorno_agendado')
     AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= now())
     AND (q.claimed_until IS NULL OR q.claimed_until < now() OR q.claimed_by = v_uid)
   ORDER BY
     (CASE WHEN q.status = 'retorno_agendado' THEN 0 ELSE 1 END),
     c.last_touch_at ASC NULLS FIRST,
     q.attempt_count ASC,
     q.queue_seed
   LIMIT 1
   FOR UPDATE OF q SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.call_queue
     SET claimed_by    = v_uid,
         claimed_until = now() + (v_minutes || ' minutes')::interval,
         updated_at    = now()
   WHERE id = v_id;

  RETURN public.call_lead_payload(v_id);
END $function$;

revoke execute on function public.next_call_lead(text) from public, anon;
grant  execute on function public.next_call_lead(text) to authenticated;


-- ── 4. Pedir um lead específico ─────────────────────────────────────────────
-- Mesma reserva, mesmas checagens de campanha. O que NÃO é checado de
-- propósito: `next_attempt_at`. Pedir um lead cujo retorno é só na quinta é
-- justamente o caso de uso — a pessoa ligou antes.
create or replace function public.claim_call_lead(p_queue_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_q       public.call_queue%ROWTYPE;
  v_minutes int;
  v_status  text;
  v_dono    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente';
  END IF;

  SELECT * INTO v_q FROM public.call_queue WHERE id = p_queue_id FOR UPDATE;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'Lead não encontrado nesta campanha';
  END IF;
  IF NOT public.is_call_campaign_member(v_q.campaign_id) THEN
    RAISE EXCEPTION 'Você não participa desta campanha de ligação';
  END IF;

  SELECT status, claim_minutes INTO v_status, v_minutes
    FROM public.call_campaigns WHERE id = v_q.campaign_id;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Campanha % — reative para continuar ligando',
      CASE v_status WHEN 'paused' THEN 'pausada' ELSE 'finalizada' END;
  END IF;

  -- Lead já encerrado ou já no funil não volta por aqui. Reabrir contato morto
  -- é decisão de campanha, não de atendimento — e transferido já tem dono no
  -- funil principal, onde o histórico continua.
  IF v_q.status IN ('encerrado', 'transferido') THEN
    RAISE EXCEPTION 'Este lead está em "%" e não volta para a fila de ligação',
      CASE v_q.status WHEN 'encerrado' THEN 'encerrado' ELSE 'transferido para o funil' END;
  END IF;

  -- A reserva é o coração da fila compartilhada: sem esta checagem, dois
  -- corretores registrariam desfecho em cima do mesmo contato.
  IF v_q.claimed_by IS NOT NULL AND v_q.claimed_by <> v_uid AND v_q.claimed_until > now() THEN
    SELECT name INTO v_dono FROM public.profiles WHERE id = v_q.claimed_by;
    RAISE EXCEPTION 'Este lead está com % agora — espere a reserva terminar',
      coalesce(v_dono, 'outro corretor');
  END IF;

  UPDATE public.call_queue
     SET claimed_by    = v_uid,
         claimed_until = now() + (coalesce(v_minutes, 15) || ' minutes')::interval,
         updated_at    = now()
   WHERE id = v_q.id;

  RETURN public.call_lead_payload(v_q.id);
END $function$;

revoke execute on function public.claim_call_lead(text) from public, anon;
grant  execute on function public.claim_call_lead(text) to authenticated;


-- ── 5. Achar o lead pelo nome ou telefone ───────────────────────────────────
-- Busca no BANCO, não no navegador: uma campanha tem dezenas de milhares de
-- contatos e baixar a fila inteira para filtrar em memória é exatamente o
-- padrão que já custou um incidente de egress neste projeto.
create or replace function public.search_call_leads(
  p_campaign_id text,
  p_termo       text,
  p_limite      int DEFAULT 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  v_termo  text := trim(coalesce(p_termo, ''));
  v_digits text := regexp_replace(coalesce(p_termo, ''), '\D', '', 'g');
  v_out    jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente';
  END IF;
  IF NOT public.is_call_campaign_member(p_campaign_id) THEN
    RAISE EXCEPTION 'Você não participa desta campanha de ligação';
  END IF;

  -- Termo curto devolve vazio em vez de meia base: dois caracteres casariam
  -- com milhares de nomes e a lista deixaria de ajudar a escolher.
  IF length(v_termo) < 3 AND length(v_digits) < 4 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT jsonb_build_object(
             'id',            q.id,
             'contactId',     q.contact_id,
             'name',          c.name,
             'phone',         c.phone,
             'status',        q.status,
             'attemptCount',  q.attempt_count,
             'nextAttemptAt', q.next_attempt_at,
             'lastCallAt',    q.last_call_at,
             'lastOutcome',   q.last_outcome,
             'closeReason',   q.close_reason,
             'claimedBy',     q.claimed_by,
             'claimedUntil',  q.claimed_until
           ) AS x
      FROM public.call_queue q
      JOIN public.contacts   c ON c.id = q.contact_id
     WHERE q.campaign_id = p_campaign_id
       AND (
         (length(v_termo)  >= 3 AND unaccent_br(c.name) ILIKE '%' || unaccent_br(v_termo) || '%')
         OR
         (length(v_digits) >= 4 AND normalize_phone_br(c.phone) LIKE '%' || v_digits || '%')
       )
     LIMIT greatest(1, least(coalesce(p_limite, 8), 20))
  ) t;

  RETURN v_out;
END $function$;

revoke execute on function public.search_call_leads(text, text, int) from public, anon;
grant  execute on function public.search_call_leads(text, text, int) to authenticated;


-- ── 6. A tentativa guarda de onde veio ──────────────────────────────────────
-- Parâmetro com DEFAULT: a chamada antiga continua válida e continua sendo
-- 'fila', que é o caminho de 99% das ligações.
--
-- O DROP não é zelo: `create or replace` com um parâmetro a mais cria uma
-- SOBRECARGA, e aí a chamada de um argumento vira ambígua e o discador inteiro
-- para de registrar. Tem de sair a de um argumento.
drop function if exists public.register_call_attempt(text);

create or replace function public.register_call_attempt(
  p_queue_id text,
  p_origem   text DEFAULT 'fila'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_q       public.call_queue%ROWTYPE;
  v_minutes int;
  v_name    text;
  v_log_id  text;
  v_attempt int;
  v_origem  text := CASE WHEN p_origem = 'manual' THEN 'manual' ELSE 'fila' END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada — faça login novamente';
  END IF;

  SELECT * INTO v_q FROM public.call_queue WHERE id = p_queue_id FOR UPDATE;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'Lead não encontrado na fila';
  END IF;
  IF NOT public.is_call_campaign_member(v_q.campaign_id) THEN
    RAISE EXCEPTION 'Você não participa desta campanha de ligação';
  END IF;
  IF v_q.claimed_by IS NOT NULL AND v_q.claimed_by <> v_uid AND v_q.claimed_until > now() THEN
    RAISE EXCEPTION 'Este lead está reservado para outro corretor agora';
  END IF;

  SELECT claim_minutes INTO v_minutes FROM public.call_campaigns WHERE id = v_q.campaign_id;
  SELECT name INTO v_name FROM public.contacts WHERE id = v_q.contact_id;

  v_attempt := v_q.attempt_count + 1;

  INSERT INTO public.call_logs (campaign_id, queue_id, contact_id, contact_name,
                                broker_id, attempt_number, outcome, origem)
  VALUES (v_q.campaign_id, v_q.id, v_q.contact_id, v_name, v_uid, v_attempt, 'discou', v_origem)
  RETURNING id INTO v_log_id;

  UPDATE public.call_queue
     SET status        = CASE WHEN status = 'fila' THEN 'tentativa' ELSE status END,
         attempt_count = v_attempt,
         last_call_at  = now(),
         last_outcome  = 'discou',
         claimed_by    = v_uid,
         claimed_until = now() + (coalesce(v_minutes, 15) || ' minutes')::interval,
         updated_at    = now()
   WHERE id = v_q.id;

  PERFORM public.touch_contact(v_q.contact_id, now());

  RETURN jsonb_build_object('logId', v_log_id, 'attempt', v_attempt);
END $function$;

revoke execute on function public.register_call_attempt(text, text) from public, anon;
grant  execute on function public.register_call_attempt(text, text) to authenticated;
