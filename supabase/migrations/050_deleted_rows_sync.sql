-- 050: Log de exclusões para o sync incremental
--
-- Contexto: o delta sync (updated_at > marca d'água) não enxerga linhas
-- removidas — a linha some do banco sem deixar rastro. A solução anterior era
-- um carregamento completo periódico (5 min) que baixava a tabela inteira só
-- para reconciliar exclusões, o principal consumidor de egress do projeto.
--
-- Esta tabela registra cada DELETE via trigger; o cliente consulta o delta de
-- exclusões junto com o delta de alterações e remove as linhas do estado local.
-- Cobre todos os caminhos de exclusão: app, SQL direto e cascatas
-- (campaigns -> campaign_leads).

create table if not exists public.deleted_rows (
  table_name text not null,
  row_id     text not null,
  deleted_at timestamptz not null default now(),
  primary key (table_name, row_id)
);

-- Índice para a consulta do delta: WHERE table_name = X AND deleted_at > Y
create index if not exists deleted_rows_table_deleted_at_idx
  on public.deleted_rows (table_name, deleted_at);

-- SECURITY DEFINER: o trigger grava independentemente das permissões de quem
-- deletou (authenticated não tem INSERT em deleted_rows).
create or replace function public.log_deleted_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.deleted_rows (table_name, row_id, deleted_at)
  values (tg_table_name, old.id::text, now())
  on conflict (table_name, row_id) do update set deleted_at = now();
  return old;
end;
$$;

drop trigger if exists log_delete_campaign_leads on public.campaign_leads;
create trigger log_delete_campaign_leads
  after delete on public.campaign_leads
  for each row execute function public.log_deleted_row();

drop trigger if exists log_delete_contacts on public.contacts;
create trigger log_delete_contacts
  after delete on public.contacts
  for each row execute function public.log_deleted_row();

-- Clientes autenticados apenas leem; escrita é exclusiva do trigger.
alter table public.deleted_rows enable row level security;

drop policy if exists "authenticated_read_deleted_rows" on public.deleted_rows;
create policy "authenticated_read_deleted_rows"
  on public.deleted_rows for select
  to authenticated
  using (true);

revoke insert, update, delete on public.deleted_rows from anon, authenticated;

-- Limpeza diária: exclusões com mais de 30 dias não interessam a nenhum
-- cliente (qualquer sessão mais antiga que isso refaz o carregamento completo).
select cron.schedule(
  'cleanup-deleted-rows',
  '30 4 * * *',
  $$delete from public.deleted_rows where deleted_at < now() - interval '30 days'$$
);
