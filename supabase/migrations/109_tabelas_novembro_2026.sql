-- 109: tabelas de novembro/2026 na carteira (23/11/2026)
--
-- Material enviado pelo Rafael: tabelas do Itajaí Urban Club (1ª e 2ª fase) e
-- do Green View Urban Club (1ª fase), ambas com referência 01/11/2026, e as
-- tabelas de novembro do Porto Velas, Lago di San Pellegrino e Dot Zero.
--
-- Convenções da carteira (memória project_carteira_lancamentos):
--   • tipologia = configuração + área; vaga separa só quando muda o preço de verdade;
--   • faixa e entrada saem do estoque real (mínimo pela mais barata, ideal pela mais cara);
--   • percentuais do fluxo conferidos pelos valores das unidades, não pelo cabeçalho;
--   • renda = regra dos 30% sobre o desembolso até a entrega (mensais + reforços diluídos);
--   • o que a tabela não informa fica em branco (periodicidade dos balões, suítes do IUC).
--
-- O gatilho da migração 108 leva o preço novo para os leads em aberto.

-- ── Itajaí Urban Club (ex-Rogga) ─────────────────────────────

insert into public.development_units (id, development_id, name, bedrooms, suites, parking, area_sqm, price, price_min, price_max,
  income_min, income_ideal, down_payment_min, down_payment_ideal, payment_plans, available, units_available, notes, display_order)
values ('unit-iuc-5166', 'dev-rogga', '2 dorms · 51,66 m² · 1 vaga', 2, null, 1, 51.66, 536739.59, 536739.59, 569023.61,
  17900, 19000, 53674, 56902, '[{"name": "Fluxo da tabela", "downPaymentPct": 10, "installmentsPct": 10, "months": 20, "reinforcementPct": 10, "reinforcements": 6, "financingPct": 70, "notes": "Tabela de 01/11/2026: 10% de entrada, 10% em 20 mensais, 10% em 6 balões e 70% de financiamento. Periodicidade dos balões não informada na tabela."}]'::jsonb, true, 13, 'Tabela de 01/11/2026: 13 unidades, 8 na Torre 01 (1ª fase) e 5 na Torre 02 (2ª fase). Finais 01, 02, 07 e 08 com 51,66 m²; final 06 com 51,59 m². A 907-T2 vem com duas vagas. De R$ 536.739,59 (508-T1) a R$ 569.023,61 (1208-T1).', 1);

update public.developments set
  condition_history = condition_history || jsonb_build_array(jsonb_build_object(
    'changedAt', now(), 'validFrom', valid_from, 'before', jsonb_build_object(
      'regime', regime, 'incomeMin', income_min, 'incomeIdeal', income_ideal,
      'downPaymentMin', down_payment_min, 'downPaymentIdeal', down_payment_ideal,
      'fgtsComposes', fgts_composes, 'acceptsResident', accepts_resident, 'acceptsInvestor', accepts_investor,
      'unitTypes', to_jsonb(unit_types), 'paymentPlans', payment_plans, 'valueMin', value_min, 'valueMax', value_max))),
  value_min = 536739.59,
  value_max = 569023.61,
  income_min = 17900,
  income_ideal = 19000,
  down_payment_min = 53674,
  down_payment_ideal = 56902,
  payment_plans = '[]'::jsonb,
  unit_types = array['2'],
  valid_from = '2026-11-01',
  confirmed = true,
  notes = 'Rua Jaime Fernandes Vieira, 419 · Cordeiros, Itajaí. Rogga. Duas torres (1ª e 2ª fase) num cadastro só: 12 pavimentos, 96 apartamentos por torre (8 giardinos), edifício garagem com 199 vagas. Entrega em agosto/2028. Tabela de 01/11/2026 (CUB R$ 3.182,95): 13 unidades, todas de 2 dormitórios com cerca de 51,6 m² e 1 vaga. Fluxo conferido pelos valores das unidades: 10% de entrada, 10% em 20 mensais, 10% em 6 balões e 70% de financiamento. RENDA: regra dos 30% sobre o desembolso até a entrega (mensais + balões diluídos em 20 meses) — por isso sai acima da régua antiga do formulário (R$ 12–13 mil). PENDENTE: periodicidade dos balões e confirmação do regime (associativo).',
  updated_at = now(),
  name = 'Itajaí Urban Club',
  delivery_estimate = '2028-08',
  region = 'Cordeiros'
 where id = 'dev-rogga';

-- ── Green View Urban Club ─────────────────────────────────────

insert into public.developments (id, name, builder, region, city, status, regime, delivery_estimate, fgts_composes,
  accepts_resident, accepts_investor, unit_types, payment_plans, valid_from, meta_form_ids, confirmed, active, commission_pct)
values ('dev-green-view', 'Green View Urban Club', 'Rogga', 'Ressacada', 'Itajaí', 'lancamento', 'associativo', '2030-10', false,
  true, true, '{}', '[]'::jsonb, '2026-11-01', array['1630622655212045'], true, true, 5)
on conflict (id) do nothing;

insert into public.development_units (id, development_id, name, bedrooms, suites, parking, area_sqm, price, price_min, price_max,
  income_min, income_ideal, down_payment_min, down_payment_ideal, payment_plans, available, units_available, notes, display_order)
values ('unit-gv-t2', 'dev-green-view', 'Tipo 2 · 2 dorms · 1 suíte · 63,56 m²', 2, 1, 1, 63.56, 608497.28, 608497.28, 745236.82,
  10200, 12500, 42595, 52167, '[{"name": "Fluxo da tabela", "downPaymentPct": 7, "installmentsPct": 15, "months": 46, "reinforcementPct": 8, "reinforcements": 8, "financingPct": 70, "notes": "Tabela de 01/11/2026: 7% de entrada, 15% em 46 mensais, 8% em 8 balões e 70% de financiamento. Periodicidade dos balões não informada na tabela."}]'::jsonb, true, 31, 'Tabela da 1ª fase (Torre 01), 01/11/2026: 31 unidades. 1 suíte + 1 dormitório. Três delas (1605, 1606 e 1705) com vaga dupla. Preço varia por andar e posição.', 1);

insert into public.development_units (id, development_id, name, bedrooms, suites, parking, area_sqm, price, price_min, price_max,
  income_min, income_ideal, down_payment_min, down_payment_ideal, payment_plans, available, units_available, notes, display_order)
values ('unit-gv-t1', 'dev-green-view', 'Tipo 1 · 3 dorms · 1 suíte · 72,85 m² · vaga dupla', 3, 1, 2, 72.85, 773402.74, 773402.74, 884478.15,
  12900, 14800, 54138, 61913, '[{"name": "Fluxo da tabela", "downPaymentPct": 7, "installmentsPct": 15, "months": 46, "reinforcementPct": 8, "reinforcements": 8, "financingPct": 70, "notes": "Tabela de 01/11/2026: 7% de entrada, 15% em 46 mensais, 8% em 8 balões e 70% de financiamento. Periodicidade dos balões não informada na tabela."}]'::jsonb, true, 38, '38 unidades. 1 suíte + 2 dormitórios, com opções de planta (2 suítes + 1 dormitório, sala ampliada). Vaga dupla, exceto 1102-T1 e 1702-T1 (vaga simples ou estendida, com hobby box).', 2);

insert into public.development_units (id, development_id, name, bedrooms, suites, parking, area_sqm, price, price_min, price_max,
  income_min, income_ideal, down_payment_min, down_payment_ideal, payment_plans, available, units_available, notes, display_order)
values ('unit-gv-giard2', 'dev-green-view', 'Giardino · 2 dorms · 1 suíte', 2, 1, 1, 74.59, 617011.67, 617011.67, 668247.62,
  10300, 11200, 43191, 46777, '[{"name": "Fluxo da tabela", "downPaymentPct": 7, "installmentsPct": 15, "months": 46, "reinforcementPct": 8, "reinforcements": 8, "financingPct": 70, "notes": "Tabela de 01/11/2026: 7% de entrada, 15% em 46 mensais, 8% em 8 balões e 70% de financiamento. Periodicidade dos balões não informada na tabela."}]'::jsonb, true, 2, 'Apartamentos com jardim no 3º pavimento: 306-T1 (74,59 m², com hobby box) e 303-T1 (79,15 m²).', 3);

insert into public.development_units (id, development_id, name, bedrooms, suites, parking, area_sqm, price, price_min, price_max,
  income_min, income_ideal, down_payment_min, down_payment_ideal, payment_plans, available, units_available, notes, display_order)
values ('unit-gv-giard3', 'dev-green-view', 'Giardino · 3 dorms · 1 suíte · vaga dupla', 3, 1, 2, 88.73, 780866.76, 780866.76, 780866.76,
  13100, 13100, 54661, 54661, '[{"name": "Fluxo da tabela", "downPaymentPct": 7, "installmentsPct": 15, "months": 46, "reinforcementPct": 8, "reinforcements": 8, "financingPct": 70, "notes": "Tabela de 01/11/2026: 7% de entrada, 15% em 46 mensais, 8% em 8 balões e 70% de financiamento. Periodicidade dos balões não informada na tabela."}]'::jsonb, true, 1, '308-T1, com jardim no 3º pavimento (88,73 m²) e vaga dupla.', 4);

update public.developments set
  value_min = 608497.28,
  value_max = 884478.15,
  income_min = 10200,
  income_ideal = 14800,
  down_payment_min = 42595,
  down_payment_ideal = 61913,
  payment_plans = '[]'::jsonb,
  unit_types = array['2','3'],
  valid_from = '2026-11-01',
  confirmed = true,
  notes = 'Bairro Ressacada, Itajaí. Rogga — o lead conhece como "Greenview". Duas torres, 240 apartamentos (226 tipo e 14 giardinos), lazer no 3º pavimento, 247 vagas privativas (vaga dupla só nos 3 dormitórios) e 18 hobby boxes. Início de obra 07/2027, entrega 10/2030. Tabela da 1ª fase (Torre 01) de 01/11/2026: 72 unidades. Fluxo conferido pelos valores das unidades: 7% de entrada, 15% em 46 mensais, 8% em 8 balões e 70% de financiamento. Tipo 3 (62,86 m², Torre 02) não está na tabela. PENDENTE: regime copiado do Itajaí Urban Club (mesma construtora e modalidade) — confirmar; periodicidade dos balões.',
  updated_at = now()
 where id = 'dev-green-view';

-- ── Porto Velas ───────────────────────────────────────────────

update public.development_units set price = 801966.66, price_min = 801966.66, price_max = 920427.11,
  income_min = 15800, income_ideal = 18100, down_payment_min = 24059, down_payment_ideal = 27613,
  payment_plans = '[{"name": "Fluxo da tabela", "downPaymentPct": 3, "installmentsPct": 19, "months": 51, "reinforcementPct": 11, "reinforcements": 8, "reinforcementPeriod": "semestral", "financingPct": 67, "notes": "Tabela de novembro/2026, conferida pelos valores das unidades: 3% de entrada, 19% em 51 mensais, 11% em 8 reforços semestrais e 67% financiado. O cabeçalho diz 18% e 12%; as unidades fecham em 19% e 11%."}]'::jsonb, available = true, units_available = 2, updated_at = now()
 where id = 'unit-pv-t1';

update public.development_units set price = 534644.46, price_min = 534644.46, price_max = 597543.79,
  income_min = 10500, income_ideal = 11800, down_payment_min = 16039, down_payment_ideal = 17926,
  payment_plans = '[{"name": "Fluxo da tabela", "downPaymentPct": 3, "installmentsPct": 19, "months": 51, "reinforcementPct": 11, "reinforcements": 8, "reinforcementPeriod": "semestral", "financingPct": 67, "notes": "Tabela de novembro/2026, conferida pelos valores das unidades: 3% de entrada, 19% em 51 mensais, 11% em 8 reforços semestrais e 67% financiado. O cabeçalho diz 18% e 12%; as unidades fecham em 19% e 11%."}]'::jsonb, available = true, units_available = 33, updated_at = now()
 where id = 'unit-pv-t2sv';

update public.development_units set price = 671974.68, price_min = 671974.68, price_max = 693989.47,
  income_min = 13200, income_ideal = 13700, down_payment_min = 20159, down_payment_ideal = 20820,
  payment_plans = '[{"name": "Fluxo da tabela", "downPaymentPct": 3, "installmentsPct": 19, "months": 51, "reinforcementPct": 11, "reinforcements": 8, "reinforcementPeriod": "semestral", "financingPct": 67, "notes": "Tabela de novembro/2026, conferida pelos valores das unidades: 3% de entrada, 19% em 51 mensais, 11% em 8 reforços semestrais e 67% financiado. O cabeçalho diz 18% e 12%; as unidades fecham em 19% e 11%."}]'::jsonb, available = true, units_available = 8, updated_at = now()
 where id = 'unit-pv-t2cv';

update public.development_units set price = 649959.92, price_min = 649959.92, price_max = 728584.11,
  income_min = 12800, income_ideal = 14300, down_payment_min = 19499, down_payment_ideal = 21858,
  payment_plans = '[{"name": "Fluxo da tabela", "downPaymentPct": 3, "installmentsPct": 19, "months": 51, "reinforcementPct": 11, "reinforcements": 8, "reinforcementPeriod": "semestral", "financingPct": 67, "notes": "Tabela de novembro/2026, conferida pelos valores das unidades: 3% de entrada, 19% em 51 mensais, 11% em 8 reforços semestrais e 67% financiado. O cabeçalho diz 18% e 12%; as unidades fecham em 19% e 11%."}]'::jsonb, available = true, units_available = 71, updated_at = now()
 where id = 'unit-pv-t3';

update public.development_units set price = 451826.98, price_min = 451826.98, price_max = 475918.51,
  income_min = 8900, income_ideal = 9400, down_payment_min = 13555, down_payment_ideal = 14278,
  payment_plans = '[{"name": "Fluxo da tabela", "downPaymentPct": 3, "installmentsPct": 19, "months": 51, "reinforcementPct": 11, "reinforcements": 8, "reinforcementPeriod": "semestral", "financingPct": 67, "notes": "Tabela de novembro/2026, conferida pelos valores das unidades: 3% de entrada, 19% em 51 mensais, 11% em 8 reforços semestrais e 67% financiado. O cabeçalho diz 18% e 12%; as unidades fecham em 19% e 11%."}]'::jsonb, available = true, units_available = 5, updated_at = now()
 where id = 'unit-pv-t4';

update public.developments set
  condition_history = condition_history || jsonb_build_array(jsonb_build_object(
    'changedAt', now(), 'validFrom', valid_from, 'before', jsonb_build_object(
      'regime', regime, 'incomeMin', income_min, 'incomeIdeal', income_ideal,
      'downPaymentMin', down_payment_min, 'downPaymentIdeal', down_payment_ideal,
      'fgtsComposes', fgts_composes, 'acceptsResident', accepts_resident, 'acceptsInvestor', accepts_investor,
      'unitTypes', to_jsonb(unit_types), 'paymentPlans', payment_plans, 'valueMin', value_min, 'valueMax', value_max))),
  value_min = 451826.98,
  value_max = 920427.11,
  income_min = 8900,
  income_ideal = 18100,
  down_payment_min = 13555,
  down_payment_ideal = 27613,
  payment_plans = '[]'::jsonb,
  unit_types = array['1','2','3'],
  valid_from = '2026-11-01',
  confirmed = true,
  notes = 'Well Living / Home Club · Rua Felipe Reiser, 553 · São João, Itajaí. Lotisa. Incorporação 80.471. Quatro torres (A, B, C, D), lazer no 3º pavimento. Entrega em março/2031. Tabela de novembro/2026: 119 unidades disponíveis. Fluxo: 3% de entrada + 51 mensais (19%) + 8 reforços semestrais (11%) + 67% financiado. ATENÇÃO: o cabeçalho da tabela diz 18% e 12%, mas os valores das unidades fecham em 19% e 11% — usar sempre o valor da unidade. PENDENTE: regras de FGTS. RENDA: regra dos 30% sobre o desembolso até a entrega (mensais + reforços diluídos). Mínimo pela unidade mais barata da tipologia, ideal pela mais cara.',
  updated_at = now()
 where id = 'dev-porto-velas';

-- ── Lago di San Pellegrino ────────────────────────────────────

update public.development_units set price = 595000.0, price_min = 595000.0, price_max = 645000.0,
  income_min = 33100, income_ideal = 35900, down_payment_min = 59500, down_payment_ideal = 64500,
  payment_plans = '[{"name": "Fluxo da tabela", "downPaymentPct": 10, "installmentsPct": 10, "months": 12, "reinforcementPct": 10, "reinforcements": 1, "financingPct": 70, "notes": "Tabela de novembro/2026: 10% de entrada, 10% em 12 mensais, 10% de reforço e 70% de financiamento. A tabela traz um único valor de reforço, sem data."}]'::jsonb, available = true, units_available = 8, notes = 'Tabela de novembro/2026: 8 unidades, 99,72 m² totais e 1 vaga (11,52 m²). Preço varia por andar: R$ 595 mil a R$ 645 mil.', parking = 1, updated_at = now()
 where id = 'unit-sanp-7793';

update public.development_units set price = 589000.0, price_min = 589000.0, price_max = 589000.0,
  income_min = 32800, income_ideal = 32800, down_payment_min = 58900, down_payment_ideal = 58900,
  payment_plans = '[{"name": "Fluxo da tabela", "downPaymentPct": 10, "installmentsPct": 10, "months": 12, "reinforcementPct": 10, "reinforcements": 1, "financingPct": 70, "notes": "Tabela de novembro/2026: 10% de entrada, 10% em 12 mensais, 10% de reforço e 70% de financiamento. A tabela traz um único valor de reforço, sem data."}]'::jsonb, available = true, units_available = 1, notes = 'Tipos 01 e 08. Voltou na tabela de novembro/2026 com 1 unidade, 84,52 m² totais e 1 vaga.', parking = 1, updated_at = now()
 where id = 'unit-sanp-6605';

update public.developments set
  condition_history = condition_history || jsonb_build_array(jsonb_build_object(
    'changedAt', now(), 'validFrom', valid_from, 'before', jsonb_build_object(
      'regime', regime, 'incomeMin', income_min, 'incomeIdeal', income_ideal,
      'downPaymentMin', down_payment_min, 'downPaymentIdeal', down_payment_ideal,
      'fgtsComposes', fgts_composes, 'acceptsResident', accepts_resident, 'acceptsInvestor', accepts_investor,
      'unitTypes', to_jsonb(unit_types), 'paymentPlans', payment_plans, 'valueMin', value_min, 'valueMax', value_max))),
  value_min = 589000.0,
  value_max = 645000.0,
  income_min = 32800,
  income_ideal = 35900,
  down_payment_min = 58900,
  down_payment_ideal = 64500,
  payment_plans = '[]'::jsonb,
  unit_types = array['2','3'],
  valid_from = '2026-11-01',
  confirmed = true,
  notes = 'Home Club · Rua Jovito Anacleto, 60, ao lado da Reinaldo Schmithausen. MMC. Incorporação 76.443. Entrega em dezembro/2027. Tabela de novembro/2026: 9 unidades disponíveis (8 de 77,93 m² e 1 de 66,05 m²). Fluxo: 10% de entrada + 10% em 12 mensais + 10% de reforço + 70% de financiamento. RENDA: regra dos 30% sobre o desembolso até a entrega — com só 12 meses até a chave, ela sai alta (acima de R$ 32 mil). PENDENTE: data do reforço e o piso real de entrada que a construtora aceita. A tipologia de 61,22 m² segue sem tabela.',
  updated_at = now()
 where id = 'dev-san-pelegrino';

-- ── Dot Zero ──────────────────────────────────────────────────

insert into public.development_units (id, development_id, name, bedrooms, suites, parking, area_sqm, price, price_min, price_max,
  income_min, income_ideal, down_payment_min, down_payment_ideal, payment_plans, available, units_available, notes, display_order)
values ('unit-dz-studio', 'dev-dotzero', 'Studio · 23 a 30 m²', 1, 0, 0, 23.49, 440000.0, 440000.0, 480000.0,
  11700, 12700, 22000, 24000, '[{"name": "Fluxo da tabela", "downPaymentPct": 5, "installmentsPct": 80, "months": 120, "reinforcementPct": 15, "reinforcements": 10, "reinforcementPeriod": "anual", "financingPct": 0, "notes": "Tabela de novembro/2026: 5% de entrada, 80% em 120 mensais e 15% em 10 reforços anuais, direto com a incorporadora — sem financiamento bancário. As mensais seguem depois da entrega."}]'::jsonb, true, 144, 'Tabela de novembro/2026: 144 studios de 23,49 a 28,87 m², sem vaga. R$ 440 mil a R$ 480 mil conforme andar.', 1);

insert into public.development_units (id, development_id, name, bedrooms, suites, parking, area_sqm, price, price_min, price_max,
  income_min, income_ideal, down_payment_min, down_payment_ideal, payment_plans, available, units_available, notes, display_order)
values ('unit-dz-studio-m', 'dev-dotzero', 'Studio · 32 a 40 m²', 1, 0, 0, 31.07, 520000.0, 520000.0, 610000.0,
  13800, 16100, 26000, 30500, '[{"name": "Fluxo da tabela", "downPaymentPct": 5, "installmentsPct": 80, "months": 120, "reinforcementPct": 15, "reinforcements": 10, "reinforcementPeriod": "anual", "financingPct": 0, "notes": "Tabela de novembro/2026: 5% de entrada, 80% em 120 mensais e 15% em 10 reforços anuais, direto com a incorporadora — sem financiamento bancário. As mensais seguem depois da entrega."}]'::jsonb, true, 24, '24 studios de 31,07 a 39,54 m², sem vaga. R$ 520 mil a R$ 610 mil.', 2);

insert into public.development_units (id, development_id, name, bedrooms, suites, parking, area_sqm, price, price_min, price_max,
  income_min, income_ideal, down_payment_min, down_payment_ideal, payment_plans, available, units_available, notes, display_order)
values ('unit-dz-60', 'dev-dotzero', 'Studio · 60 m²', 1, 0, 0, 60.25, 660000.0, 660000.0, 660000.0,
  17500, 17500, 33000, 33000, '[{"name": "Fluxo da tabela", "downPaymentPct": 5, "installmentsPct": 80, "months": 120, "reinforcementPct": 15, "reinforcements": 10, "reinforcementPeriod": "anual", "financingPct": 0, "notes": "Tabela de novembro/2026: 5% de entrada, 80% em 120 mensais e 15% em 10 reforços anuais, direto com a incorporadora — sem financiamento bancário. As mensais seguem depois da entrega."}]'::jsonb, true, 1, 'Uma unidade de 60,25 m² privativos (102,6 m² totais), sem vaga.', 3);

update public.developments set
  condition_history = condition_history || jsonb_build_array(jsonb_build_object(
    'changedAt', now(), 'validFrom', valid_from, 'before', jsonb_build_object(
      'regime', regime, 'incomeMin', income_min, 'incomeIdeal', income_ideal,
      'downPaymentMin', down_payment_min, 'downPaymentIdeal', down_payment_ideal,
      'fgtsComposes', fgts_composes, 'acceptsResident', accepts_resident, 'acceptsInvestor', accepts_investor,
      'unitTypes', to_jsonb(unit_types), 'paymentPlans', payment_plans, 'valueMin', value_min, 'valueMax', value_max))),
  value_min = 440000.0,
  value_max = 660000.0,
  income_min = 11700,
  income_ideal = 17500,
  down_payment_min = 22000,
  down_payment_ideal = 33000,
  payment_plans = '[]'::jsonb,
  unit_types = array['1'],
  valid_from = '2026-11-01',
  confirmed = true,
  notes = 'Incorporação 91.455. Só studios (1 ambiente de dormir), sem vaga. Entrega em dezembro/2030. Tabela de novembro/2026: 169 unidades disponíveis, R$ 440 mil a R$ 660 mil. FLUXO DIFERENTE DOS OUTROS: direto com a incorporadora, sem banco — 5% de entrada, 80% em 120 mensais e 15% em 10 reforços anuais. As mensais continuam depois da entrega. RENDA: regra dos 30% sobre a mensal + reforços diluídos nos 120 meses. PENDENTE: construtora, endereço e índice de correção.',
  updated_at = now(),
  active = true,
  delivery_estimate = '2030-12'
 where id = 'dev-dotzero';

-- ── Campanhas e leads ─────────────────────────────────────────
-- Formulários do Itajaí Urban Club: uma tipologia só, sem o que escolher.
update public.meta_form_routing
   set development_unit_id = 'unit-iuc-5166', product_name = 'Itajaí Urban Club', product_ticket = 536739.59, updated_at = now()
 where form_id = any ((select meta_form_ids from public.developments where id = 'dev-rogga')::text[])
   and development_unit_id is null;

-- Leads do Green View → lançamento (o preço chega quando a campanha tiver tipologia).
update public.leads set development_id = 'dev-green-view', updated_at = now()
 where development_id is null
   and (meta_form_id = '1630622655212045' or lower(trim(property_name)) in ('greenview', 'green view', 'green view urban club'));

-- Leads em aberto do Itajaí Urban Club → a tipologia (VGV pela tabela).
update public.leads l
   set development_unit_id = r.development_unit_id, updated_at = now()
  from public.meta_form_routing r
 where r.form_id = l.meta_form_id
   and r.development_unit_id = 'unit-iuc-5166'
   and l.development_unit_id is null
   and l.funnel_stage not in ('proposta', 'venda')
   and l.closed_at is null;
