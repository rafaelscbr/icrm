-- 049: encerramento de lead ganho (venda concluída)
--
-- Quando um lead chega à etapa 'venda' e o negócio é fechado, ele é ENCERRADO:
-- registra a data (closed_at) e o valor real (won_value), gera um registro em
-- sales (sale_id) e sai do funil ativo. Antes, leads ganhos ficavam para sempre
-- na coluna Venda, contaminando pipeline e conversão "atuais".
--
-- Colunas aditivas e nullable — não afetam dados existentes.

alter table public.leads add column if not exists closed_at timestamptz;
alter table public.leads add column if not exists won_value numeric;
alter table public.leads add column if not exists sale_id   text references public.sales(id) on delete set null;

create index if not exists idx_leads_closed_at on public.leads (closed_at) where closed_at is not null;
