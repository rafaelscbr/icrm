-- ─── 110: campanha de ligação ligada à tipologia da carteira ─────────────────
--
-- Mesmo elo da 108, agora para a Prospecção Ativa · Ligação. Até aqui o lead
-- transferido da fila entrava com o nome do produto em texto e o ticket fixo
-- da campanha ("Greenview", R$ 700 mil) — fora da carteira, sem preço da
-- tabela e sem a comissão do produto.
--
--   • call_campaigns.development_unit_id — a tipologia da campanha.
--   • Ao gravar, a campanha copia o nome do lançamento e o preço da tipologia
--     (product_name / average_ticket), para toda tela antiga continuar certa.
--     Tabela nova ou lançamento renomeado repassam para a campanha também.
--   • transfer_call_lead_to_funnel ganha p_unit_id: o corretor pode trocar a
--     tipologia na hora de transferir (o cliente quer o de 3 dorms). Sem
--     escolha, vale a da campanha. O gatilho lead_produto_da_carteira faz o
--     resto: nome do lançamento e preço da tabela no lead.

-- ── 1. A coluna ──────────────────────────────────────────────────────────────

alter table public.call_campaigns
  add column if not exists development_unit_id text
    references public.development_units(id) on delete set null;

create index if not exists call_campaigns_development_unit_idx
  on public.call_campaigns (development_unit_id)
  where development_unit_id is not null;

-- ── 2. A campanha copia nome e preço da tipologia ───────────────────────────

create or replace function public.campanha_ligacao_da_carteira()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_nome  text;
  v_preco numeric;
BEGIN
  IF NEW.development_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT d.name, coalesce(u.price, u.price_min)
    INTO v_nome, v_preco
    FROM development_units u
    JOIN developments d ON d.id = u.development_id
   WHERE u.id = NEW.development_unit_id;

  NEW.product_name := v_nome;
  IF v_preco IS NOT NULL THEN
    NEW.average_ticket := v_preco;
  END IF;
  RETURN NEW;
END;
$$;

revoke execute on function public.campanha_ligacao_da_carteira() from public, anon;

drop trigger if exists trg_campanha_ligacao_da_carteira on public.call_campaigns;
create trigger trg_campanha_ligacao_da_carteira
  before insert or update on public.call_campaigns
  for each row execute function public.campanha_ligacao_da_carteira();

-- Tabela nova: além dos leads em aberto, as campanhas de ligação da tipologia.
create or replace function public.tipologia_repassa_preco()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  UPDATE leads SET updated_at = now()
   WHERE development_unit_id = NEW.id
     AND funnel_stage NOT IN ('proposta', 'venda')
     AND closed_at IS NULL
     AND average_ticket IS DISTINCT FROM coalesce(NEW.price, NEW.price_min)
     AND coalesce(NEW.price, NEW.price_min) IS NOT NULL;

  UPDATE call_campaigns SET updated_at = now()
   WHERE development_unit_id = NEW.id
     AND average_ticket IS DISTINCT FROM coalesce(NEW.price, NEW.price_min)
     AND coalesce(NEW.price, NEW.price_min) IS NOT NULL;
  RETURN NULL;
END;
$$;

-- Lançamento renomeado: o nome acompanha nos leads e nas campanhas de ligação.
create or replace function public.lancamento_repassa_nome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  UPDATE leads SET updated_at = now()
   WHERE development_id = NEW.id AND property_name IS DISTINCT FROM NEW.name;

  UPDATE call_campaigns c SET updated_at = now()
    FROM development_units u
   WHERE u.id = c.development_unit_id
     AND u.development_id = NEW.id
     AND c.product_name IS DISTINCT FROM NEW.name;
  RETURN NULL;
END;
$$;

-- ── 3. Transferência para o funil herda a tipologia ─────────────────────────

drop function if exists public.transfer_call_lead_to_funnel(text, numeric, text, text);

create or replace function public.transfer_call_lead_to_funnel(
  p_queue_id      text,
  p_ticket        numeric DEFAULT NULL,
  p_notes         text    DEFAULT NULL,
  p_property_name text    DEFAULT NULL,
  p_unit_id       text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_q       public.call_queue%ROWTYPE;
  v_c       public.contacts%ROWTYPE;
  v_camp    public.call_campaigns%ROWTYPE;
  v_unit    text;
  v_lead_id text;
  v_now     timestamptz := now();
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
  IF v_q.transferred_to_lead_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este lead já foi transferido para o funil';
  END IF;

  SELECT * INTO v_c    FROM public.contacts       WHERE id = v_q.contact_id;
  SELECT * INTO v_camp FROM public.call_campaigns WHERE id = v_q.campaign_id;

  v_unit := coalesce(p_unit_id, v_camp.development_unit_id);
  IF p_unit_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.development_units WHERE id = p_unit_id) THEN
    RAISE EXCEPTION 'Tipologia não encontrada na carteira';
  END IF;

  v_lead_id := gen_random_uuid()::text;

  -- Com tipologia, o gatilho lead_produto_da_carteira troca property_name e
  -- average_ticket pelo nome do lançamento e pelo preço da tabela.
  INSERT INTO public.leads (
    id, name, phone, origin, funnel_stage, followup_step,
    property_name, average_ticket, development_unit_id, contact_id, notes,
    stage_changed_at, broker_id, created_at, updated_at
  ) VALUES (
    v_lead_id, v_c.name, v_c.phone, 'prospeccao_ligacao', 'atendimento', 0,
    coalesce(p_property_name, v_camp.product_name),
    coalesce(p_ticket, v_camp.average_ticket),
    v_unit,
    v_c.id,
    nullif(concat_ws(E'\n',
      nullif(trim(coalesce(p_notes, v_q.notes, '')), ''),
      format('Origem: prospecção ativa · ligação — campanha "%s" (%s tentativa%s)',
             v_camp.name, v_q.attempt_count,
             CASE WHEN v_q.attempt_count = 1 THEN '' ELSE 's' END)
    ), ''),
    v_now, v_uid, v_now, v_now
  );

  INSERT INTO public.lead_interactions (
    id, lead_id, type, description, interacted_at, broker_id, created_at
  )
  SELECT
    gen_random_uuid()::text, v_lead_id, 'ligacao',
    format('Prospecção ativa · tentativa %s — %s%s',
           cl.attempt_number,
           CASE cl.outcome
             WHEN 'discou'          THEN 'ligação feita'
             WHEN 'nao_atendeu'     THEN 'não atendeu'
             WHEN 'caixa_postal'    THEN 'caixa postal'
             WHEN 'pediu_retorno'   THEN 'pediu retorno'
             WHEN 'interessado'     THEN 'demonstrou interesse'
             WHEN 'sem_interesse'   THEN 'sem interesse'
             WHEN 'nao_perturbe'    THEN 'pediu para não receber'
             WHEN 'numero_invalido' THEN 'número inválido'
             ELSE cl.outcome
           END,
           coalesce(': ' || nullif(trim(cl.notes), ''), '')),
    cl.called_at, cl.broker_id, cl.called_at
  FROM public.call_logs cl
  WHERE cl.queue_id = v_q.id
  ORDER BY cl.called_at;

  UPDATE public.call_queue
     SET status                 = 'transferido',
         transferred_at         = v_now,
         transferred_to_lead_id = v_lead_id,
         claimed_by             = NULL,
         claimed_until          = NULL,
         next_attempt_at        = NULL,
         updated_at             = v_now
   WHERE id = v_q.id;

  INSERT INTO public.contact_events (id, contact_id, event_type, title, metadata, broker_id, created_at)
  VALUES (gen_random_uuid()::text, v_c.id, 'entered_funnel',
          format('Entrou no funil pela ligação — campanha "%s"', v_camp.name),
          jsonb_build_object('leadId', v_lead_id, 'callCampaignId', v_camp.id),
          v_uid, v_now);

  RETURN jsonb_build_object('leadId', v_lead_id);
END $function$;

revoke execute on function public.transfer_call_lead_to_funnel(text, numeric, text, text, text) from public, anon;
grant  execute on function public.transfer_call_lead_to_funnel(text, numeric, text, text, text) to authenticated;

-- ── 4. As duas campanhas de hoje, na mesma tipologia das campanhas do Meta ──
-- (escolha do Rafael em 23/11/2026: Green View Tipo 2, Porto Velas Tipo 2 com vaga)

update public.call_campaigns set development_unit_id = 'unit-gv-t2'
 where id = 'd4ccdf59-8d24-4f3b-84ea-ce62cd73fb55' and development_unit_id is null;

update public.call_campaigns set development_unit_id = 'unit-pv-t2cv'
 where id = '021ccf9d-5c67-4027-b17d-55fe1ca3c621' and development_unit_id is null;
