-- 075: Sync incremental de leads e lead_interactions
--
-- Contexto: em 29/09/2026 o projeto foi bloqueado de novo por egress. A tela
-- baixava a tabela `leads` inteira (~2,2 MB) a cada volta para a aba e a cada
-- reconexão do realtime — o corretor alterna com o WhatsApp o dia todo — e
-- `lead_interactions` inteira a cada volta também. Os dois stores passam a
-- carregar tudo uma vez por sessão e, depois disso, só o delta.
--
-- O delta por updated_at não enxerga duas coisas, e as duas passam a deixar
-- rastro em deleted_rows (mesma tabela e mesmo trigger da migração 050):
--
--   1. Exclusão — a linha some sem deixar rastro.
--   2. Troca de dono em leads — a RLS é por broker_id, então o corretor que
--      perdeu o lead (transferência, ping-pong do SLA) não recebe mais a
--      linha nem o evento realtime do UPDATE. Sem o registro, o lead ficaria
--      na tela dele até o F5. O cliente só remove quando o registro é MAIS
--      NOVO que a versão local — quem ganhou o lead recebe a linha pelo delta
--      com o mesmo instante (mesma transação) e a mantém.
--
-- Todas as funções que fazem UPDATE em leads já tocam updated_at (conferido
-- em 29/09: refresh_lead_last_contact, handle_first_contact,
-- recapture_overdue_leads, process_meta_lead, transfer_lead,
-- ack_lead_reentry, set_lead_profile_field).

drop trigger if exists log_delete_leads on public.leads;
create trigger log_delete_leads
  after delete on public.leads
  for each row execute function public.log_deleted_row();

drop trigger if exists log_broker_change_leads on public.leads;
create trigger log_broker_change_leads
  after update of broker_id on public.leads
  for each row
  when (old.broker_id is distinct from new.broker_id)
  execute function public.log_deleted_row();

drop trigger if exists log_delete_lead_interactions on public.lead_interactions;
create trigger log_delete_lead_interactions
  after delete on public.lead_interactions
  for each row execute function public.log_deleted_row();

-- Delta de leads: WHERE updated_at > X ORDER BY updated_at, id
create index if not exists idx_leads_updated_at
  on public.leads (updated_at);

-- Delta de interações: WHERE broker_id IS NOT NULL AND created_at > X
create index if not exists idx_lead_interactions_created_at
  on public.lead_interactions (created_at)
  where broker_id is not null;
