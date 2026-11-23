-- 108: o produto do lead vem da carteira de lançamentos (23/11/2026)
--
-- Até aqui o lead guardava o produto como texto ("Rogga", "San Pelegrino") e
-- um ticket fixo digitado na campanha. Nada disso conversava com a carteira
-- (`developments` + `development_units`): o nome nem batia ("Rogga" x
-- "Itajaí Urban") e a tabela nova da construtora não mexia no VGV do Kanban.
--
-- Combinado com o Rafael:
--   • A campanha (formulário do Meta) aponta para uma TIPOLOGIA da carteira —
--     sempre tem uma. O lead que entra por ela nasce ligado a essa tipologia.
--   • Enquanto o lead está em aberto, o VGV dele (`average_ticket`) é o preço
--     da tipologia na tabela vigente: a tabela muda, o Kanban acompanha.
--   • Em Proposta e Venda (ou fechado) o valor congela: tabela nova não
--     reescreve o que já foi negociado. Trocar a tipologia à mão ainda vale.
--   • Comissão é por produto: 5% em todos; produto pronto pode ser 6%.
--
-- O `average_ticket` continua sendo O número do VGV do lead — Kanban, Pulse,
-- painéis e funções de previsão já leem dele. Este gatilho só garante que ele
-- venha da tabela. `property_name` passa a ser o nome do lançamento.

-- ── Comissão por produto ──────────────────────────────────────────────────────
alter table public.developments
  add column if not exists commission_pct numeric(4,2) not null default 5;
alter table public.developments drop constraint if exists developments_commission_pct_check;
alter table public.developments
  add constraint developments_commission_pct_check check (commission_pct > 0 and commission_pct <= 20);
update public.developments set commission_pct = 6 where status = 'pronto' and commission_pct = 5;

-- ── O lead aponta para a carteira ─────────────────────────────────────────────
alter table public.leads
  add column if not exists development_id      text references public.developments(id)      on delete set null,
  add column if not exists development_unit_id text references public.development_units(id) on delete set null;
create index if not exists idx_leads_development      on public.leads (development_id)      where development_id is not null;
create index if not exists idx_leads_development_unit on public.leads (development_unit_id) where development_unit_id is not null;

-- ── A campanha aponta para a tipologia ────────────────────────────────────────
alter table public.meta_form_routing
  add column if not exists development_unit_id text references public.development_units(id) on delete set null;

-- ── Gatilho do lead: herda da campanha e puxa o preço da tabela ──────────────
create or replace function public.lead_produto_da_carteira()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_unit   development_units%ROWTYPE;
  v_nome   text;
  v_preco  numeric;
  v_aberto boolean;
BEGIN
  -- 1. Lead novo de formulário: herda a tipologia da campanha. Sem tipologia
  --    na campanha, ao menos o lançamento (developments.meta_form_ids).
  IF TG_OP = 'INSERT' AND NEW.development_unit_id IS NULL AND NEW.meta_form_id IS NOT NULL THEN
    SELECT r.development_unit_id INTO NEW.development_unit_id
      FROM meta_form_routing r WHERE r.form_id = NEW.meta_form_id;
    IF NEW.development_unit_id IS NULL AND NEW.development_id IS NULL THEN
      SELECT d.id INTO NEW.development_id
        FROM developments d WHERE NEW.meta_form_id = ANY (d.meta_form_ids)
       ORDER BY d.active DESC LIMIT 1;
    END IF;
  END IF;

  -- 2. A tipologia manda no lançamento.
  IF NEW.development_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit FROM development_units WHERE id = NEW.development_unit_id;
    NEW.development_id := v_unit.development_id;
  END IF;

  IF NEW.development_id IS NULL THEN
    RETURN NEW;   -- produto fora da carteira: texto e ticket continuam à mão
  END IF;

  -- 3. Nome do produto = nome do lançamento. Lançamento e imóvel pronto não
  --    convivem no mesmo lead.
  SELECT name INTO v_nome FROM developments WHERE id = NEW.development_id;
  NEW.property_name := v_nome;
  NEW.property_id   := NULL;

  -- 4. Preço: em aberto segue a tabela; em Proposta/Venda/fechado congela,
  --    a não ser que a tipologia tenha acabado de ser escolhida ou trocada.
  IF NEW.development_unit_id IS NOT NULL THEN
    v_aberto := NEW.funnel_stage NOT IN ('proposta', 'venda') AND NEW.closed_at IS NULL;
    IF v_aberto OR TG_OP = 'INSERT'
       OR NEW.development_unit_id IS DISTINCT FROM OLD.development_unit_id THEN
      v_preco := coalesce(v_unit.price, v_unit.price_min);
      IF v_preco IS NOT NULL THEN
        NEW.average_ticket := v_preco;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

drop trigger if exists trg_lead_produto_da_carteira on public.leads;
create trigger trg_lead_produto_da_carteira
  before insert or update on public.leads
  for each row execute function public.lead_produto_da_carteira();

-- ── Tabela nova: o preço chega nos leads em aberto ────────────────────────────
-- Toca `updated_at` (o sync incremental depende disso) e o gatilho do lead
-- recalcula o preço. Só os que mudam de valor, para não reenviar a base toda.
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
  RETURN NULL;
END;
$$;

drop trigger if exists trg_tipologia_repassa_preco on public.development_units;
create trigger trg_tipologia_repassa_preco
  after update of price, price_min on public.development_units
  for each row execute function public.tipologia_repassa_preco();

-- Lançamento renomeado: o nome acompanha nos leads.
create or replace function public.lancamento_repassa_nome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  UPDATE leads SET updated_at = now()
   WHERE development_id = NEW.id AND property_name IS DISTINCT FROM NEW.name;
  RETURN NULL;
END;
$$;

drop trigger if exists trg_lancamento_repassa_nome on public.developments;
create trigger trg_lancamento_repassa_nome
  after update of name on public.developments
  for each row when (OLD.name IS DISTINCT FROM NEW.name)
  execute function public.lancamento_repassa_nome();

-- ── Admin escolhe a tipologia da campanha ─────────────────────────────────────
-- Grava na campanha, fecha o elo formulário → lançamento (meta_form_ids, que a
-- qualificação usa) e liga os leads em aberto daquele formulário que ainda não
-- têm tipologia. Devolve quantos leads foram ligados.
create or replace function public.definir_tipologia_da_campanha(p_form_id text, p_unit_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_unit development_units%ROWTYPE;
  v_nome text;
  v_n    integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Só o administrador define o produto da campanha';
  END IF;

  SELECT * INTO v_unit FROM development_units WHERE id = p_unit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipologia não encontrada';
  END IF;
  IF NOT v_unit.available OR coalesce(v_unit.price, v_unit.price_min) IS NULL THEN
    RAISE EXCEPTION 'Essa tipologia está sem tabela vigente';
  END IF;
  SELECT name INTO v_nome FROM developments WHERE id = v_unit.development_id;

  UPDATE meta_form_routing
     SET development_unit_id = p_unit_id,
         product_name   = v_nome,
         product_ticket = coalesce(v_unit.price, v_unit.price_min),
         updated_at     = now()
   WHERE form_id = p_form_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada';
  END IF;

  UPDATE developments
     SET meta_form_ids = array_remove(meta_form_ids, p_form_id), updated_at = now()
   WHERE p_form_id = ANY (meta_form_ids) AND id <> v_unit.development_id;
  UPDATE developments
     SET meta_form_ids = meta_form_ids || p_form_id, updated_at = now()
   WHERE id = v_unit.development_id AND NOT (p_form_id = ANY (meta_form_ids));

  UPDATE leads
     SET development_unit_id = p_unit_id, updated_at = now()
   WHERE meta_form_id = p_form_id
     AND development_unit_id IS NULL
     AND funnel_stage NOT IN ('proposta', 'venda')
     AND closed_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

revoke all on function public.definir_tipologia_da_campanha(text, text) from public, anon;
grant execute on function public.definir_tipologia_da_campanha(text, text) to authenticated;
revoke all on function public.lead_produto_da_carteira()  from public, anon, authenticated;
revoke all on function public.tipologia_repassa_preco()   from public, anon, authenticated;
revoke all on function public.lancamento_repassa_nome()   from public, anon, authenticated;

-- ── Ligar o que já existe ─────────────────────────────────────────────────────
-- a) Campanha cujo lançamento tem UMA só tipologia com tabela: essa é a dela
--    (hoje: os dois formulários do San Pellegrino → 3 dorms). Com mais de uma
--    (Porto Velas) ou nenhuma (Itajaí Urban), o admin escolhe na tela.
update public.meta_form_routing r
   set development_unit_id = u.id, updated_at = now()
  from public.developments d
  join lateral (
    select array_agg(x.id) ids from public.development_units x
     where x.development_id = d.id and x.available and coalesce(x.price, x.price_min) is not null
  ) t on true
  join public.development_units u on u.id = t.ids[1]
 where r.form_id = any (d.meta_form_ids)
   and r.development_unit_id is null
   and array_length(t.ids, 1) = 1;

-- b) Lead → lançamento, pelo formulário de origem.
update public.leads l
   set development_id = d.id, updated_at = now()
  from public.developments d
 where l.development_id is null
   and l.meta_form_id is not null
   and l.meta_form_id = any (d.meta_form_ids);

-- c) Lead → lançamento, pelo nome (os que não vieram por formulário).
update public.leads l
   set development_id = m.dev, updated_at = now()
  from (values ('rogga', 'dev-rogga'), ('itajaí urban', 'dev-rogga'),
               ('san pelegrino', 'dev-san-pelegrino'), ('lago di san pellegrino', 'dev-san-pelegrino'),
               ('porto velas', 'dev-porto-velas'), ('dotzero', 'dev-dotzero')) as m(nome, dev)
 where l.development_id is null
   and lower(trim(l.property_name)) = m.nome;

-- d) Lead em aberto → tipologia da campanha.
update public.leads l
   set development_unit_id = r.development_unit_id, updated_at = now()
  from public.meta_form_routing r
 where r.form_id = l.meta_form_id
   and r.development_unit_id is not null
   and l.development_unit_id is null
   and l.funnel_stage not in ('proposta', 'venda')
   and l.closed_at is null;
