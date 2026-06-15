-- 043: Mudança de etapa do funil principal vira evento estruturado
--
-- Adiciona from_stage/to_stage em lead_interactions (preenchidos só no
-- stage_change) e faz backfill dos eventos históricos a partir da descrição
-- "Movido de {Label} → {Label}". Base para as métricas de conversão de funil.

alter table public.lead_interactions add column if not exists from_stage text;
alter table public.lead_interactions add column if not exists to_stage   text;

-- ── Backfill dos eventos antigos ──────────────────────────────────────────────
update public.lead_interactions li
set from_stage = m.from_slug,
    to_stage   = m.to_slug
from (
  select
    x.id,
    (case x.lbl[1]
       when 'Leads' then 'lead'  when 'Followup' then 'followup'
       when 'Atendimento' then 'atendimento' when 'Visita' then 'visita'
       when 'Proposta' then 'proposta' when 'Venda' then 'venda' end) as from_slug,
    (case x.lbl[2]
       when 'Leads' then 'lead'  when 'Followup' then 'followup'
       when 'Atendimento' then 'atendimento' when 'Visita' then 'visita'
       when 'Proposta' then 'proposta' when 'Venda' then 'venda' end) as to_slug
  from (
    select id, regexp_match(description, '^Movido de (.+) → (.+)$') as lbl
    from public.lead_interactions
    where type = 'stage_change' and description is not null
  ) x
  where x.lbl is not null
) m
where li.id = m.id
  and li.type = 'stage_change'
  and (li.from_stage is null or li.to_stage is null);

-- ── Índice para as consultas de conversão ─────────────────────────────────────
create index if not exists idx_li_stage_events
  on public.lead_interactions (lead_id, to_stage, from_stage)
  where type = 'stage_change';
