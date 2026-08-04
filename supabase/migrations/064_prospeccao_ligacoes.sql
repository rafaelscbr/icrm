-- ─── 064: Prospecção Ativa — Ligações via WhatsApp ────────────────────────────
--
-- Segundo canal de prospecção, irmão do Disparo. Tabelas próprias de propósito:
-- o fluxo de disparo é o que gera receita hoje e não pode ser tocado, as
-- métricas dos dois canais não podem se misturar, e o funil de ligação tem
-- estados que não existem em disparo (tentativa com cadência, retorno agendado).
--
-- Modelo: FILA ÚNICA COMPARTILHADA. Uma campanha ("Porto Velas"), todos os
-- corretores puxam da mesma fila, e quem puxa RESERVA o lead por alguns minutos
-- para ninguém mais ligar no mesmo número. A ordenação é global por contato,
-- não por campanha — quem foi tocado recentemente (por ligação OU por disparo)
-- desce para o fim, inclusive em campanha criada depois.
--
-- Regra de negócio decidida com o Rafael:
--   clicar em "Ligar pelo WhatsApp" JÁ CONTA a ligação. Não existe URL que
--   inicie chamada de WhatsApp — o wa.me abre a conversa e o corretor toca no
--   telefone. Se ele abriu e não ligou, o problema é dele. O desfecho refina o
--   registro depois; ausência de desfecho não apaga a ligação.

-- ── 1. Origem nova no funil principal ────────────────────────────────────────
-- Sem isto, transfer_call_lead_to_funnel() estoura no CHECK de leads.origin.

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_origin_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_origin_check
  CHECK (origin = ANY (ARRAY[
    'felicita', 'meta_ads', 'portal', 'offline',
    'campanha',              -- Prospecção · Disparo (slug mantido: histórico)
    'indicacao',
    'prospeccao_ligacao'     -- Prospecção · Ligação WhatsApp
  ]));

-- O slug de disparo continua 'campanha' — renomear quebraria 100% do histórico.
-- Só o rótulo muda, para os dois canais ficarem legíveis lado a lado.
UPDATE public.lead_config
   SET label = 'Prospecção · Disparo', updated_at = now()
 WHERE type = 'origin' AND slug = 'campanha';

INSERT INTO public.lead_config (id, type, slug, label, emoji, color, display_order, active, created_at, updated_at)
SELECT gen_random_uuid()::text, 'origin', 'prospeccao_ligacao',
       'Prospecção · Ligação', '📞', 'text-emerald-400', 7, true, now(), now()
 WHERE NOT EXISTS (SELECT 1 FROM public.lead_config WHERE type = 'origin' AND slug = 'prospeccao_ligacao');

-- ── 2. Último toque por contato (cross-canal) ────────────────────────────────
-- É a coluna que faz "ligou → fim da fila" valer para SEMPRE, inclusive em
-- campanha nova. Denormalizada porque com 60k contatos ordenar por subquery
-- não termina em tempo aceitável.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS last_touch_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contacts_last_touch ON public.contacts (last_touch_at NULLS FIRST);

CREATE OR REPLACE FUNCTION public.touch_contact(p_contact_id text, p_at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.contacts
     SET last_touch_at = greatest(coalesce(last_touch_at, '-infinity'::timestamptz), p_at)
   WHERE id = p_contact_id;
$$;

-- Disparo também é toque: o corretor que recebeu mensagem ontem não pode ser o
-- primeiro da fila de ligação hoje.
CREATE OR REPLACE FUNCTION public.trg_touch_from_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contact text;
BEGIN
  -- disparo_logs guarda campaign_leads.id; o vínculo com o contato é o telefone.
  SELECT c.id INTO v_contact
    FROM public.campaign_leads cl
    JOIN public.contacts c
      ON public.normalize_phone_br(c.phone) = public.normalize_phone_br(cl.phone)
   WHERE cl.id = NEW.lead_id
   LIMIT 1;

  IF v_contact IS NOT NULL THEN
    PERFORM public.touch_contact(v_contact, NEW.fired_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_contact_on_dispatch ON public.disparo_logs;
CREATE TRIGGER touch_contact_on_dispatch
  AFTER INSERT ON public.disparo_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_from_dispatch();

-- Backfill do histórico de disparos já existente.
UPDATE public.contacts c
   SET last_touch_at = d.ultimo
  FROM (
    SELECT ct.id AS contact_id, max(dl.fired_at) AS ultimo
      FROM public.disparo_logs dl
      JOIN public.campaign_leads cl ON cl.id = dl.lead_id
      JOIN public.contacts ct
        ON public.normalize_phone_br(ct.phone) = public.normalize_phone_br(cl.phone)
     GROUP BY ct.id
  ) d
 WHERE c.id = d.contact_id
   AND (c.last_touch_at IS NULL OR c.last_touch_at < d.ultimo);

-- ── 3. Campanhas de ligação ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.call_campaigns (
  id               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name             text        NOT NULL,
  description      text,
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'paused', 'finished')),
  owner_broker_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  average_ticket   numeric,
  product_name     text,
  -- Cadência: horas de espera até a próxima tentativa, por número da tentativa.
  -- {4,24,72,168} = 4h, 1 dia, 3 dias, 7 dias. Depois de max_attempts o lead
  -- encerra como 'nao_localizado'.
  retry_hours      int[]       NOT NULL DEFAULT '{4,24,72,168}',
  max_attempts     int         NOT NULL DEFAULT 5,
  -- Minutos que um lead fica reservado para o corretor que o puxou da fila.
  claim_minutes    int         NOT NULL DEFAULT 15,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.call_campaign_lists (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id text        NOT NULL REFERENCES public.call_campaigns(id) ON DELETE CASCADE,
  list_id     text        NOT NULL REFERENCES public.lead_lists(id)     ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, list_id)
);

CREATE TABLE IF NOT EXISTS public.call_campaign_participants (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id text        NOT NULL REFERENCES public.call_campaigns(id) ON DELETE CASCADE,
  broker_id   uuid        NOT NULL REFERENCES auth.users(id)            ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'collaborator'
                          CHECK (role IN ('owner', 'collaborator')),
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, broker_id)
);

-- ── 4. A fila ────────────────────────────────────────────────────────────────
-- Uma linha por contato na campanha. É O ESTADO — call_logs é o histórico.

CREATE TABLE IF NOT EXISTS public.call_queue (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id  text        NOT NULL REFERENCES public.call_campaigns(id) ON DELETE CASCADE,
  contact_id   text        NOT NULL REFERENCES public.contacts(id)       ON DELETE CASCADE,
  list_id      text        REFERENCES public.lead_lists(id)              ON DELETE SET NULL,

  status       text        NOT NULL DEFAULT 'fila'
                           CHECK (status IN ('fila','tentativa','retorno_agendado',
                                             'interessado','transferido','encerrado')),
  attempt_count   int          NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_call_at    timestamptz,
  last_outcome    text,
  close_reason    text,        -- sem_interesse | nao_perturbe | numero_invalido | nao_localizado
  notes           text,

  -- Reserva: quem puxou o lead e até quando ele é dele.
  claimed_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_until timestamptz,

  transferred_at         timestamptz,
  transferred_to_lead_id text,

  -- Embaralhamento estável: dois contatos sem nenhum toque anterior não podem
  -- sair sempre na ordem em que a lista foi importada.
  queue_seed  double precision NOT NULL DEFAULT random(),

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, contact_id)
);

-- ── 5. O histórico ───────────────────────────────────────────────────────────
-- Uma linha por clique em "Ligar pelo WhatsApp". Nasce com outcome='discou' e
-- é refinada quando o corretor registra o desfecho. NUNCA é apagada: é dela que
-- saem a meta de 10 ligações/dia, o dashboard e o histórico que viaja junto na
-- transferência para o funil.

CREATE TABLE IF NOT EXISTS public.call_logs (
  id             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id    text        NOT NULL REFERENCES public.call_campaigns(id) ON DELETE CASCADE,
  queue_id       text        REFERENCES public.call_queue(id)              ON DELETE SET NULL,
  contact_id     text        NOT NULL REFERENCES public.contacts(id)       ON DELETE CASCADE,
  contact_name   text,
  broker_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  called_at      timestamptz NOT NULL DEFAULT now(),
  attempt_number int         NOT NULL DEFAULT 1,
  outcome        text        NOT NULL DEFAULT 'discou'
                             CHECK (outcome IN ('discou','nao_atendeu','caixa_postal',
                                                'numero_invalido','pediu_retorno',
                                                'sem_interesse','nao_perturbe','interessado')),
  callback_at    timestamptz,
  notes          text
);

-- ── 6. Índices ───────────────────────────────────────────────────────────────
-- O índice da fila serve exatamente ao ORDER BY de next_call_lead().

CREATE INDEX IF NOT EXISTS idx_call_queue_campaign_status
  ON public.call_queue (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_call_queue_proxima
  ON public.call_queue (campaign_id, next_attempt_at NULLS FIRST, attempt_count, queue_seed)
  WHERE status IN ('fila', 'tentativa', 'retorno_agendado');
CREATE INDEX IF NOT EXISTS idx_call_queue_contact  ON public.call_queue (contact_id);
CREATE INDEX IF NOT EXISTS idx_call_queue_claim    ON public.call_queue (claimed_by, claimed_until);

CREATE INDEX IF NOT EXISTS idx_call_logs_broker_dia ON public.call_logs (broker_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_campaign   ON public.call_logs (campaign_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_contact    ON public.call_logs (contact_id, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_queue      ON public.call_logs (queue_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_campaign_lists_campaign ON public.call_campaign_lists (campaign_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_campaign   ON public.call_campaign_participants (campaign_id);

-- ── 7. RLS ───────────────────────────────────────────────────────────────────
-- A fila é COMPARTILHADA: leitura liberada para qualquer autenticado, senão o
-- modelo de fila única não existe. Escrita operacional acontece só pelas RPCs
-- SECURITY DEFINER (que checam participação); o cliente não escreve direto.

CREATE OR REPLACE FUNCTION public.can_manage_call_campaign(p_campaign_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.call_campaigns c
     WHERE c.id = p_campaign_id AND c.owner_broker_id = auth.uid()
  );
$$;

ALTER TABLE public.call_campaigns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_campaign_lists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_campaign_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_queue                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs                  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_campaigns_select ON public.call_campaigns;
CREATE POLICY call_campaigns_select ON public.call_campaigns
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS call_campaigns_write ON public.call_campaigns;
CREATE POLICY call_campaigns_write ON public.call_campaigns
  FOR ALL TO authenticated
  USING      (owner_broker_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_broker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS call_campaign_lists_select ON public.call_campaign_lists;
CREATE POLICY call_campaign_lists_select ON public.call_campaign_lists
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS call_campaign_lists_write ON public.call_campaign_lists;
CREATE POLICY call_campaign_lists_write ON public.call_campaign_lists
  FOR ALL TO authenticated
  USING      (public.can_manage_call_campaign(campaign_id))
  WITH CHECK (public.can_manage_call_campaign(campaign_id));

DROP POLICY IF EXISTS call_participants_select ON public.call_campaign_participants;
CREATE POLICY call_participants_select ON public.call_campaign_participants
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS call_participants_write ON public.call_campaign_participants;
CREATE POLICY call_participants_write ON public.call_campaign_participants
  FOR ALL TO authenticated
  USING      (public.can_manage_call_campaign(campaign_id))
  WITH CHECK (public.can_manage_call_campaign(campaign_id));

DROP POLICY IF EXISTS call_queue_select ON public.call_queue;
CREATE POLICY call_queue_select ON public.call_queue
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS call_queue_write ON public.call_queue;
CREATE POLICY call_queue_write ON public.call_queue
  FOR ALL TO authenticated
  USING      (public.can_manage_call_campaign(campaign_id))
  WITH CHECK (public.can_manage_call_campaign(campaign_id));

DROP POLICY IF EXISTS call_logs_select ON public.call_logs;
CREATE POLICY call_logs_select ON public.call_logs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS call_logs_insert ON public.call_logs;
CREATE POLICY call_logs_insert ON public.call_logs
  FOR INSERT TO authenticated WITH CHECK (broker_id = auth.uid() OR public.is_admin());

-- ── 8. Realtime ──────────────────────────────────────────────────────────────
-- Só call_logs: é o que o Pulse consome. A fila muda a cada clique e assinar
-- call_queue transformaria o painel num firehose sem nada a mostrar.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
  END IF;
END $$;

-- ── 9. Permissões de menu ────────────────────────────────────────────────────
-- 'campanhas' virou dois itens. Sem esta migração, corretor com menu restrito
-- perde o acesso ao Disparo no dia do deploy.

UPDATE public.profiles
   SET allowed_menus = (
         SELECT array_agg(DISTINCT m ORDER BY m)
           FROM unnest(allowed_menus || ARRAY['disparos','ligacoes']) AS m
          WHERE m <> 'campanhas'
       ),
       updated_at = now()
 WHERE allowed_menus IS NOT NULL
   AND 'campanhas' = ANY (allowed_menus);
