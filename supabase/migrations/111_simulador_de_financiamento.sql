-- ════════════════════════════════════════════════════════════════════════════
-- 111 · Simulador de financiamento (24/11/2026)
--
-- O corretor precisa saber, na hora, quanto de renda o cliente precisa para o
-- repasse (o saldo financiado no banco na entrega das chaves). Para isso:
--
--   1. bancos_parametros — a fonte oficial das condições de cada banco, editada
--      no admin. Banco não tem API pública de taxa de balcão; NÃO se inventa
--      taxa: só a Caixa nasce preenchida, os outros nascem vazios e desligados.
--   2. indices_mensais   — INCC e TR (BCB, automático) e CUB/SC (lançado no admin).
--   3. taxas_bcb         — a taxa média praticada por banco (BCB/Olinda), só de
--      referência ao lado da taxa cadastrada.
--   4. indices_sync      — quando a busca no BCB deu certo ou errado.
--   5. developments.indice_correcao — cada construtora corrige por um índice.
--   6. idade no perfil do lead — apurada pelo corretor ou vinda do formulário.
--   7. Agendamento diário: pg_cron → pg_net → Edge Function `indices-bcb`.
--      O navegador nunca chama API externa.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Parâmetros dos bancos ────────────────────────────────────────────────
create table if not exists public.bancos_parametros (
  id                 text primary key,
  nome               text not null,
  sigla              text not null,
  logo_url           text,
  ativo              boolean not null default false,
  -- o banco da conta automática da ficha do lead (só um)
  padrao             boolean not null default false,
  ordem              int not null default 0,
  -- CNPJ base: liga o banco à taxa média do BCB
  cnpj8              text,
  -- % a.a.; nulo = não cadastrada
  taxa_sfh           numeric check (taxa_sfh is null or (taxa_sfh > 0 and taxa_sfh < 50)),
  taxa_sfi           numeric check (taxa_sfi is null or (taxa_sfi > 0 and taxa_sfi < 50)),
  indexador          text not null default 'TR' check (indexador in ('TR', 'IPCA', 'fixa')),
  -- % do imóvel; nulo = não cadastrada
  cota_sac           numeric check (cota_sac is null or (cota_sac > 0 and cota_sac <= 100)),
  cota_price         numeric check (cota_price is null or (cota_price > 0 and cota_price <= 100)),
  prazo_maximo       int check (prazo_maximo is null or (prazo_maximo between 12 and 600)),
  -- idade + prazo, em meses (966 = 80 anos e 6 meses)
  idade_maxima_meses int not null default 966 check (idade_maxima_meses between 600 and 1200),
  -- % da renda bruta
  comprometimento    numeric not null default 30 check (comprometimento > 0 and comprometimento <= 100),
  -- [{ "idadeAte": 120, "coef": 0.025 }] — coef em % ao mês sobre o financiado
  mip                jsonb not null default '[]'::jsonb check (jsonb_typeof(mip) = 'array'),
  -- % ao mês sobre o valor do imóvel
  dfi                numeric not null default 0.01 check (dfi >= 0 and dfi < 1),
  -- R$ por mês
  tarifa             numeric not null default 25 check (tarifa >= 0),
  atualizado_em      timestamptz,
  atualizado_por     uuid references public.profiles(id) on delete set null,
  -- banco ligado precisa estar completo para a conta fechar
  constraint bancos_ativo_completo check (
    not ativo or (taxa_sfh is not null and cota_sac is not null and cota_price is not null and prazo_maximo is not null)
  )
);

create unique index if not exists bancos_parametros_um_padrao on public.bancos_parametros (padrao) where padrao;

-- Quem mexeu e quando: carimbo do banco, não do front.
create or replace function public.bancos_parametros_carimbo()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;

drop trigger if exists bancos_parametros_carimbo on public.bancos_parametros;
create trigger bancos_parametros_carimbo
  before insert or update on public.bancos_parametros
  for each row execute function public.bancos_parametros_carimbo();

alter table public.bancos_parametros enable row level security;

drop policy if exists bancos_select on public.bancos_parametros;
create policy bancos_select on public.bancos_parametros for select using (auth.uid() is not null);
drop policy if exists bancos_insert on public.bancos_parametros;
create policy bancos_insert on public.bancos_parametros for insert with check (is_admin());
drop policy if exists bancos_update on public.bancos_parametros;
create policy bancos_update on public.bancos_parametros for update using (is_admin()) with check (is_admin());
drop policy if exists bancos_delete on public.bancos_parametros;
create policy bancos_delete on public.bancos_parametros for delete using (is_admin());

-- Seed: só a Caixa com valores (balcão SFH 10,99% a 11,49% + TR → 11,49%,
-- o conservador). MIP: o 0,025% combinado, faixa única até o Rafael preencher
-- a tabela por idade. Os outros bancos nascem sem taxa, sem cota e desligados.
insert into public.bancos_parametros
  (id, nome, sigla, ativo, padrao, ordem, cnpj8, taxa_sfh, taxa_sfi, indexador,
   cota_sac, cota_price, prazo_maximo, idade_maxima_meses, comprometimento, mip, dfi, tarifa)
values
  ('caixa',     'Caixa',           'CEF',   true,  true,  1, '00360305', 11.49, null, 'TR', 80, 70, 420, 966, 30,
   '[{"idadeAte": 120, "coef": 0.025}]'::jsonb, 0.01, 25),
  ('itau',      'Itaú',            'ITAÚ',  false, false, 2, '60701190', null, null, 'TR', null, null, null, 966, 30, '[]'::jsonb, 0.01, 25),
  ('bradesco',  'Bradesco',        'BRAD',  false, false, 3, '60746948', null, null, 'TR', null, null, null, 966, 30, '[]'::jsonb, 0.01, 25),
  ('santander', 'Santander',       'SANT',  false, false, 4, '90400888', null, null, 'TR', null, null, null, 966, 30, '[]'::jsonb, 0.01, 25),
  ('bb',        'Banco do Brasil', 'BB',    false, false, 5, '00000000', null, null, 'TR', null, null, null, 966, 30, '[]'::jsonb, 0.01, 25),
  ('brb',       'BRB',             'BRB',   false, false, 6, '00000208', null, null, 'TR', null, null, null, 966, 30, '[]'::jsonb, 0.01, 25),
  ('inter',     'Inter',           'INTER', false, false, 7, '00416968', null, null, 'TR', null, null, null, 966, 30, '[]'::jsonb, 0.01, 25)
on conflict (id) do nothing;

-- ── 2. Índices mensais ──────────────────────────────────────────────────────
-- variacao = % no mês. mes = primeiro dia do mês de referência.
create table if not exists public.indices_mensais (
  serie          text not null check (serie in ('incc_di', 'incc_m', 'tr', 'cub_sc')),
  mes            date not null check (extract(day from mes) = 1),
  variacao       numeric not null check (variacao > -50 and variacao < 50),
  fonte          text not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id) on delete set null,
  primary key (serie, mes)
);

alter table public.indices_mensais enable row level security;

drop policy if exists indices_select on public.indices_mensais;
create policy indices_select on public.indices_mensais for select using (auth.uid() is not null);
-- O admin lança só o CUB (não há fonte automática); INCC e TR vêm do BCB pela Edge Function.
drop policy if exists indices_insert on public.indices_mensais;
create policy indices_insert on public.indices_mensais for insert with check (is_admin() and serie = 'cub_sc');
drop policy if exists indices_update on public.indices_mensais;
create policy indices_update on public.indices_mensais for update
  using (is_admin() and serie = 'cub_sc') with check (is_admin() and serie = 'cub_sc');
drop policy if exists indices_delete on public.indices_mensais;
create policy indices_delete on public.indices_mensais for delete using (is_admin() and serie = 'cub_sc');

-- ── 3. Taxa média praticada (BCB/Olinda) ───────────────────────────────────
create table if not exists public.taxas_bcb (
  cnpj8        text not null,
  ano_mes      text not null,          -- '2026-10'
  modalidade   text not null,
  instituicao  text not null,
  taxa_mes     numeric,
  taxa_ano     numeric not null,
  buscado_em   timestamptz not null default now(),
  primary key (cnpj8, ano_mes, modalidade)
);

alter table public.taxas_bcb enable row level security;
drop policy if exists taxas_bcb_select on public.taxas_bcb;
create policy taxas_bcb_select on public.taxas_bcb for select using (auth.uid() is not null);

-- ── 4. Situação da busca ────────────────────────────────────────────────────
create table if not exists public.indices_sync (
  fonte       text primary key,        -- 'sgs' | 'olinda'
  tentado_em  timestamptz,
  ok_em       timestamptz,
  erro        text
);

alter table public.indices_sync enable row level security;
drop policy if exists indices_sync_select on public.indices_sync;
create policy indices_sync_select on public.indices_sync for select using (auth.uid() is not null);

-- ── 5. Índice de correção do lançamento ─────────────────────────────────────
alter table public.developments
  add column if not exists indice_correcao text not null default 'incc'
  check (indice_correcao in ('incc', 'cub'));

-- ── 6. Idade no perfil do lead ──────────────────────────────────────────────
-- Entra como campo do perfil, igual à renda: o formulário do Meta preenche
-- quando perguntar, e o corretor apura na conversa (com data, para a idade
-- envelhecer sozinha). Cuidado: "cidade" contém "idade" — os padrões abaixo
-- não casam com "qual sua cidade?".
alter table public.lead_field_map drop constraint if exists lead_field_map_field_check;
alter table public.lead_field_map add constraint lead_field_map_field_check check (field = any (array[
  'objetivo', 'renda', 'entrada', 'fgts', 'prazo', 'tipologia', 'capacidade', 'interesse_visita', 'consentimento', 'idade'
]));

insert into public.lead_field_map (field, question_like, priority, active)
select v.field, v.q, 50, true
from (values ('idade', '%sua idade%'), ('idade', '%qual idade%'), ('idade', '%qual a idade%'), ('idade', '%quantos anos%')) v(field, q)
where not exists (select 1 from public.lead_field_map m where m.question_like = v.q);

CREATE OR REPLACE FUNCTION public.normalize_answer(p_field text, p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v text := lower(trim(coalesce(p_value,'')));
  l text;
  vi int;
begin
  if v = '' then return null; end if;
  l := public.pretty_label(v);

  if p_field in ('renda','entrada') then
    return coalesce(
      public.parse_money_range(v) || jsonb_build_object('value', v, 'label', l),
      jsonb_build_object('value', v, 'label', l, 'unplanned', true));
  end if;

  -- Idade: numa faixa ("40 a 50 anos") vale o MAIOR número — pior cenário,
  -- prazo mais curto e seguro mais caro.
  if p_field = 'idade' then
    select max((m)[1]::int) into vi from regexp_matches(v, '([0-9]{2,3})', 'g') m;
    if vi between 18 and 100 then
      return jsonb_build_object('value', vi::text, 'label', l);
    end if;
    return jsonb_build_object('label', l);
  end if;

  if p_field = 'objetivo' then
    return jsonb_build_object('label', l, 'value',
      case
        when v ~ 'invest'                  then 'investir'
        when v ~ '(morar|moradia|residir)' then 'morar'
        else 'indefinido' end);
  end if;

  if p_field = 'fgts' then
    return jsonb_build_object('label', l,
      'value', case when v ~ '^(sim|s|yes)' then 'sim' else 'nao' end);
  end if;

  if p_field = 'prazo' then
    return jsonb_build_object('label', l,
      'value', case
        when v ~ '(não quero perder|nao quero perder|o quanto antes|quero comprar|30 dias|imediat)' then 'imediato'
        when v ~ '(1 a 3|um a tr)'                 then 'curto'
        when v ~ '(3 a 6|final do ano|sem pressa)' then 'medio'
        else 'pesquisando' end,
      'rank', case
        when v ~ '(não quero perder|nao quero perder|o quanto antes|quero comprar|30 dias|imediat)' then 4
        when v ~ '(1 a 3|um a tr)'                 then 3
        when v ~ '(3 a 6|final do ano|sem pressa)' then 2
        else 1 end);
  end if;

  if p_field = 'tipologia' then
    return jsonb_build_object('label', l,
      'value', coalesce(substring(v from '([0-9]+)'), v));
  end if;

  if p_field in ('capacidade','interesse_visita','consentimento') then
    return jsonb_build_object('label', l,
      'value', case when v ~ '^(sim|tenho|estou ciente)' or v ~ 'disponível agora' or v ~ 'interesse sim'
                    then 'sim' else 'nao' end);
  end if;

  return jsonb_build_object('value', v, 'label', l);
end $function$;

CREATE OR REPLACE FUNCTION public.set_lead_profile_field(p_lead_id text, p_field text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead leads%ROWTYPE; v_novo jsonb; v_desc text;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then raise exception 'Lead não encontrado'; end if;
  if auth.uid() is null or not (coalesce(v_lead.broker_id = auth.uid(), false) or is_admin()) then
    raise exception 'Sem permissão para editar este lead';
  end if;
  if p_field not in ('objetivo','renda','entrada','fgts','prazo','tipologia',
                     'regioes','tipologias','idade') then
    raise exception 'Campo inválido: %', p_field;
  end if;
  if p_field = 'idade' and p_value is not null
     and coalesce((p_value->>'value') ~ '^[0-9]{2,3}$', false) = false then
    raise exception 'Idade inválida';
  end if;

  if p_value is null then
    v_novo := coalesce(v_lead.profile_override, '{}'::jsonb) - p_field;
    v_desc := format('Removeu %s do perfil', p_field);
  else
    v_novo := coalesce(v_lead.profile_override, '{}'::jsonb)
              || jsonb_build_object(p_field,
                   p_value || jsonb_build_object('by', auth.uid(), 'at', now()));
    v_desc := format('Atualizou %s: %s', p_field,
      coalesce(
        (select string_agg(x, ', ') from jsonb_array_elements_text(p_value->'values') x),
        p_value->>'label', p_value->>'value', '—'));
  end if;

  update leads set profile_override = nullif(v_novo, '{}'::jsonb), updated_at = now()
  where id = p_lead_id;

  insert into lead_interactions (id, lead_id, type, description, interacted_at, created_at, broker_id)
  values (gen_random_uuid()::text, p_lead_id, 'nota', v_desc, now(), now(), auth.uid());

  return (select profile from lead_declared where lead_id = p_lead_id);
end $function$;

-- ── 7. Busca diária no BCB ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'indices_hook_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'indices_hook_secret',
      'Autentica o pg_cron na Edge Function indices-bcb'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.indices_bcb_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'indices_hook_secret';
  IF v_secret IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := 'https://dczexbzsfdavcrwiungk.supabase.co/functions/v1/indices-bcb',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.indices_bcb_dispatch() FROM PUBLIC, anon, authenticated;

-- Botão "buscar agora" do admin.
CREATE OR REPLACE FUNCTION public.indices_bcb_buscar_agora()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Só o admin pode buscar os índices'; END IF;
  PERFORM public.indices_bcb_dispatch();
END $function$;

REVOKE EXECUTE ON FUNCTION public.indices_bcb_buscar_agora() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.indices_bcb_buscar_agora() TO authenticated;

SELECT cron.unschedule('indices-bcb-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'indices-bcb-diario');

-- 07h10 de Brasília (10h10 UTC): o BCB já publicou o dia anterior.
SELECT cron.schedule('indices-bcb-diario', '10 10 * * *', 'SELECT public.indices_bcb_dispatch()');
