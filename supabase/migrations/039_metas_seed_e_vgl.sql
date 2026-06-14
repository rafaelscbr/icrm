-- 039: Categoria VGL nas metas + meta central da imobiliária + seed de metas por corretor
--
-- 1. Adiciona 'vgl' ao check constraint de goals.category
-- 2. Atualiza a política RLS de goals para incluir broker_id IS NULL
--    (necessário para que todos leiam a meta central da empresa)
-- 3. Insere a meta central de VGL (broker_id NULL, target 500000)
-- 4. Upsert das metas-padrão por corretor ativo — corrige histórico de
--    corretores que nunca tiveram acionamento e/ou proposta mensal semeados

-- ── 1. Constraint ──────────────────────────────────────────────────────────────
alter table public.goals drop constraint if exists goals_category_check;
alter table public.goals add constraint goals_category_check
  check (category = any (array['acionamento', 'visita', 'agenciamento', 'proposta', 'venda', 'vgl']));

-- ── 2. RLS: permitir leitura da meta empresa (broker_id IS NULL) ───────────────
drop policy if exists "goals_policy" on public.goals;
create policy "goals_policy" on public.goals
  for all using (broker_id is null or broker_id = auth.uid() or public.is_admin());

-- ── 3. Meta central da imobiliária ────────────────────────────────────────────
insert into public.goals (id, name, category, target, period, active, broker_id, created_at, updated_at)
values (
  'meta-vgl-empresa',
  'VGL mensal da imobiliária',
  'vgl',
  500000,
  'monthly',
  true,
  null,
  now(),
  now()
)
on conflict (id) do update
  set target     = excluded.target,
      active     = excluded.active,
      updated_at = now();

-- ── 4. Upsert metas-padrão por corretor ativo ─────────────────────────────────
-- Usa IDs determinísticos para suportar idempotência (on conflict do nothing).
-- Só insere se ainda não existe — nunca sobrescreve meta já personalizada pelo corretor.
do $$
declare
  p   record;
  gid text;
begin
  for p in
    select id from public.profiles where active = true
  loop

    -- Acionamentos semanais (250 = 50/dia × 5 dias úteis)
    gid := 'def-acion-w-' || p.id;
    insert into public.goals (id, name, category, target, period, active, broker_id, created_at, updated_at)
    values (gid, 'Acionamentos semanais', 'acionamento', 250, 'weekly', true, p.id, now(), now())
    on conflict (id) do nothing;

    -- Acionamentos mensais (1000 = 50/dia × 20 dias úteis)
    gid := 'def-acion-m-' || p.id;
    insert into public.goals (id, name, category, target, period, active, broker_id, created_at, updated_at)
    values (gid, 'Acionamentos mensais', 'acionamento', 1000, 'monthly', true, p.id, now(), now())
    on conflict (id) do nothing;

    -- Atendimentos semanais (slug banco = 'visita', label UI = 'Atendimento')
    gid := 'def-visita-w-' || p.id;
    insert into public.goals (id, name, category, target, period, active, broker_id, created_at, updated_at)
    values (gid, 'Atendimentos semanais', 'visita', 2, 'weekly', true, p.id, now(), now())
    on conflict (id) do nothing;

    -- Atendimentos mensais
    gid := 'def-visita-m-' || p.id;
    insert into public.goals (id, name, category, target, period, active, broker_id, created_at, updated_at)
    values (gid, 'Atendimentos mensais', 'visita', 8, 'monthly', true, p.id, now(), now())
    on conflict (id) do nothing;

    -- Propostas semanais
    gid := 'def-prop-w-' || p.id;
    insert into public.goals (id, name, category, target, period, active, broker_id, created_at, updated_at)
    values (gid, 'Propostas semanais', 'proposta', 1, 'weekly', true, p.id, now(), now())
    on conflict (id) do nothing;

    -- Propostas mensais
    gid := 'def-prop-m-' || p.id;
    insert into public.goals (id, name, category, target, period, active, broker_id, created_at, updated_at)
    values (gid, 'Propostas mensais', 'proposta', 4, 'monthly', true, p.id, now(), now())
    on conflict (id) do nothing;

    -- Vendas mensais
    gid := 'def-venda-m-' || p.id;
    insert into public.goals (id, name, category, target, period, active, broker_id, created_at, updated_at)
    values (gid, 'Vendas mensais', 'venda', 1, 'monthly', true, p.id, now(), now())
    on conflict (id) do nothing;

  end loop;
end;
$$;
