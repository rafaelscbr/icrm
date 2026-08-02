-- 060: lançamentos (empreendimentos na planta) com condição comercial
--
-- Até aqui, Rogga / San Pelegrino / Porto Velas / Dotzero só existiam como
-- texto solto em `meta_form_routing.product_name` — e em 2 dos 3 formulários
-- novos nem isso estava preenchido. Não havia lugar nenhum no iCRM para
-- registrar QUANTO cada produto exige de renda ou de entrada.
--
-- Sem esse cadastro a qualificação de lead é uma conta com um lado só: dá para
-- saber o que o lead declarou, não dá para saber se aquilo serve para alguma
-- coisa. Esta tabela é o outro lado.
--
-- `properties` continua sendo a unidade PRONTA (kind='ready', 31 linhas). Um
-- lançamento não é uma unidade: é um empreendimento com régua, tipologias e
-- fluxos de pagamento. Modelo próprio, tabela própria.

create table if not exists public.developments (
  id            text primary key,
  name          text not null,
  builder       text,                                    -- construtora
  region        text,                                    -- bairro
  city          text not null default 'Itajaí',
  status        text not null default 'lancamento',      -- lancamento | em_obra | pronto
  delivery_estimate text,                                -- 'YYYY-MM' — previsão de entrega

  -- ── Regime ────────────────────────────────────────────────────────────────
  -- É ESTE campo que liga ou desliga o FGTS na qualificação. Em produto
  -- associativo o saldo entra na composição e a pergunta importa; em pós-chaves
  -- o FGTS só aparece no financiamento lá na frente e perguntar é ruído.
  -- Sem isso, todo lead de Porto Velas nasceria com um alerta falso de
  -- "falta descobrir o FGTS".
  regime        text not null default 'pos_chaves',      -- associativo | pos_chaves

  -- ── Faixa de valor das unidades ───────────────────────────────────────────
  value_min     numeric,
  value_max     numeric,

  -- ── Régua de qualificação ─────────────────────────────────────────────────
  -- min  = abaixo disso o perfil não alcança
  -- ideal= acima disso alcança com folga
  -- Entre os dois é a zona de "Possível": dá, mas precisa simular.
  income_min          numeric,
  income_ideal        numeric,
  down_payment_min    numeric,
  down_payment_ideal  numeric,

  -- Só faz sentido quando regime = 'associativo'. A UI esconde o campo em
  -- pós-chaves justamente para não sugerir que ele muda alguma coisa.
  fgts_composes       boolean not null default false,

  accepts_resident    boolean not null default true,     -- aceita quem vai morar
  accepts_investor    boolean not null default true,     -- aceita investidor
  unit_types          text[]  not null default '{}',     -- tipologias: '1','2','3','4'

  -- ── Fluxos de pagamento ───────────────────────────────────────────────────
  -- [{ name, downPayment, installment, months, notes }]
  -- Cada fluxo tem a própria entrada. É o que permite o sistema dizer
  -- "não bate no fluxo A, mas bate no fluxo B" em vez de só reprovar.
  payment_plans jsonb not null default '[]'::jsonb,

  -- ── Vigência ──────────────────────────────────────────────────────────────
  -- Tabela muda, estoque muda, negociação muda. A qualificação de um lead usa
  -- a condição que valia NO DIA EM QUE ELE ENTROU — nunca a de hoje. Sem isso,
  -- toda alteração de tabela reescreveria o histórico inteiro.
  valid_from    date not null default current_date,
  valid_until   date,
  -- Snapshot da régua anterior a cada edição: [{ changedAt, changedBy, before }]
  condition_history jsonb not null default '[]'::jsonb,

  -- ── Ligações ──────────────────────────────────────────────────────────────
  -- Formulários do Meta que trazem lead para este produto. É o que fecha o elo
  -- meta_form_routing → produto → régua.
  meta_form_ids text[] not null default '{}',

  -- ── Estado ────────────────────────────────────────────────────────────────
  -- Régua conferida por gente? O seed abaixo entra tudo com `false`: são
  -- inferências minhas a partir das faixas dos formulários. Nenhuma
  -- classificação de lead pode rodar sobre régua não confirmada — senão o
  -- sistema classificaria a base inteira em cima de palpite.
  confirmed     boolean not null default false,
  active        boolean not null default true,
  notes         text,
  thumbnail     text,

  created_by_id uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint developments_status_check
    check (status = any (array['lancamento','em_obra','pronto'])),
  constraint developments_regime_check
    check (regime = any (array['associativo','pos_chaves'])),
  -- Régua incoerente é pior que régua ausente: silenciosamente classificaria
  -- todo mundo errado. Barra na escrita.
  constraint developments_income_order
    check (income_ideal is null or income_min is null or income_ideal >= income_min),
  constraint developments_down_order
    check (down_payment_ideal is null or down_payment_min is null or down_payment_ideal >= down_payment_min),
  constraint developments_value_order
    check (value_max is null or value_min is null or value_max >= value_min),
  constraint developments_purpose_check
    check (accepts_resident or accepts_investor)
);

create index if not exists idx_developments_active
  on public.developments (active, name) where active;

create index if not exists idx_developments_meta_forms
  on public.developments using gin (meta_form_ids);

alter table public.developments enable row level security;

-- Todo corretor LÊ (precisa saber a régua para se preparar para o atendimento).
-- Só admin escreve — condição comercial é decisão da casa, não do corretor.
drop policy if exists developments_select on public.developments;
create policy developments_select on public.developments
  for select using (auth.uid() is not null);

drop policy if exists developments_insert on public.developments;
create policy developments_insert on public.developments
  for insert with check (is_admin());

drop policy if exists developments_update on public.developments;
create policy developments_update on public.developments
  for update using (is_admin()) with check (is_admin());

drop policy if exists developments_delete on public.developments;
create policy developments_delete on public.developments
  for delete using (is_admin());

-- Delete é registrado como em contacts (rastro de exclusão)
drop trigger if exists log_delete_developments on public.developments;
create trigger log_delete_developments
  after delete on public.developments
  for each row execute function log_deleted_row();


-- ── Seed: os quatro produtos que já trazem lead hoje ────────────────────────
--
-- TUDO AQUI É INFERÊNCIA e entra com confirmed = false.
--
-- De onde saiu cada número:
--
--  1. As FAIXAS DO FORMULÁRIO. Quem desenhou o formulário desenhou as opções em
--     torno do que o produto pede — o corte entre as alternativas denuncia a
--     régua. Porto Velas pergunta "até 15 / 15-30 / +30" e a pista antiga dizia
--     "R$ 30 mil de ato": as duas coisas batem. É a fonte mais confiável que
--     existe hoje.
--  2. As PISTAS dos formulários antigos (junho/julho): "renda de R$ 13.000
--     comprovada" no Rogga, "R$ 22 mil + R$ 2.000/mês" no Dotzero,
--     "R$ 30 mil de ato + R$ 1.500" no Porto Velas.
--  3. As VENDAS REAIS: Porto Velas fechou entre R$ 517k e R$ 680k (12 vendas),
--     Rogga R$ 530.947, San Pelegrino R$ 667.000.
--  4. O ticket em meta_form_routing.product_ticket.
--
-- Regime confirmado pelo Rafael: San Pelegrino e Porto Velas são PÓS-CHAVES.
-- Rogga e Dotzero ficam como associativo/pós-chaves a confirmar.
--
-- valid_from = data do primeiro lead de cada formulário.

insert into public.developments
  (id, name, builder, region, status, regime, delivery_estimate,
   value_min, value_max,
   income_min, income_ideal, down_payment_min, down_payment_ideal,
   fgts_composes, accepts_resident, accepts_investor, unit_types,
   payment_plans, valid_from, meta_form_ids, confirmed, notes)
values
  (
    'dev-rogga', 'Rogga', null, null, 'lancamento', 'associativo', null,
    500000, 560000,
    5000, 10000, 10000, 20000,
    -- Rafael confirmou: no Rogga o FGTS NÃO compõe a entrada.
    false, true, true, '{}',
    '[]'::jsonb, '2026-06-12', '{2844383485917003,1512839613921544,2090155531929280}', false,
    'Régua inferida das faixas do formulário (renda até 5 / 5-10 / +10; entrada até 10 / 10-20 / +20). '
    'ATENÇÃO: a pista do formulário de junho dizia "renda de R$ 13.000 comprovada" — se ainda valer, '
    'a régua abaixo está muito folgada e 8 dos 11 leads recentes ficam fora dela. Confirmar antes de ligar a qualificação. '
    'Venda real registrada: R$ 530.947.'
  ),
  (
    'dev-san-pelegrino', 'San Pelegrino', null, null, 'lancamento', 'pos_chaves', null,
    570000, 670000,
    8000, 15000, 20000, 50000,
    false, true, true, '{2,3}',
    '[]'::jsonb, '2026-06-12', '{2866501457059393,2015420939066147}', false,
    'Pós-chaves — FGTS não é critério. Régua inferida das faixas do formulário '
    '(renda até 8 / 8-15 / 15-20 / +20; entrada até 25 / 20-50 / +50). '
    'A faixa "até R$ 25 mil" se sobrepõe a "entre R$ 20 e 50 mil" e nenhum lead a escolheu — '
    'ajustar o formulário quando a campanha permitir. Venda real: R$ 667.000.'
  ),
  (
    'dev-porto-velas', 'Porto Velas', null, null, 'lancamento', 'pos_chaves', null,
    517000, 681000,
    5000, 10000, 15000, 30000,
    false, true, true, '{}',
    '[{"name":"Ato + mensais","downPayment":30000,"installment":1500,"months":null,"notes":"Pista do formulário de julho — confirmar"}]'::jsonb,
    '2026-07-07', '{2952185188465860,971798969188963}', false,
    'Pós-chaves — FGTS não é critério e o formulário não pergunta (correto). '
    'Também não pergunta prazo: o lead deste produto entra com um sinal a menos de urgência. '
    'Régua inferida das faixas (entrada até 15 / 15-30 / +30) e da pista "R$ 30 mil de ato + R$ 1.500/mês". '
    'Produto mais vendido: 12 vendas entre R$ 517k e R$ 680k.'
  ),
  (
    'dev-dotzero', 'Dotzero', null, null, 'lancamento', 'pos_chaves', null,
    420000, 460000,
    null, null, 22000, null,
    false, true, true, '{}',
    '[{"name":"Entrada + mensais","downPayment":22000,"installment":2000,"months":null,"notes":"Pista do formulário de junho — confirmar"}]'::jsonb,
    '2026-06-13', '{25059793933718336}', false,
    'Sem lead novo desde 09/07. Régua de renda desconhecida — o formulário antigo não perguntava. '
    'Entrada vem da pista "R$ 22 mil + R$ 2.000/mês".'
  )
on conflict (id) do nothing;

-- Dionata precisa VER os lançamentos (é para isso que eles existem: preparar o
-- atendimento). Só admin edita — a RLS acima já garante.
update public.profiles
set allowed_menus = allowed_menus || array['lancamentos'],
    updated_at = now()
where allowed_menus is not null
  and not (allowed_menus @> array['lancamentos']);
