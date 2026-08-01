-- 058: vínculo direto tarefa → lead
--
-- Até aqui `tasks` só tinha `contact_id`. A ligação com o lead era inferida
-- comparando contact_id (é o que useTasksStore.toggleDone faz para registrar a
-- interação). Isso tem duas falhas:
--   · lead sem contato vinculado NUNCA associava tarefa nenhuma;
--   · dois leads do mesmo contato disputavam a mesma tarefa.
--
-- Com `lead_id` explícito, o Kanban passa a mostrar a tarefa real como próxima
-- ação do card ("Ligar hoje às 14h") em vez de cair no genérico.
--
-- `on delete set null`: apagar um lead não pode apagar a tarefa do corretor.

alter table public.tasks
  add column if not exists lead_id text references public.leads(id) on delete set null;

create index if not exists idx_tasks_lead_id on public.tasks (lead_id) where lead_id is not null;

-- Backfill do que dá para inferir com segurança: tarefa com contato que aponta
-- para EXATAMENTE UM lead não descartado. Havendo ambiguidade, fica nulo —
-- preferimos vazio a vínculo errado.
update public.tasks t
set lead_id = sub.lead_id
from (
  select l.contact_id, min(l.id) as lead_id
  from public.leads l
  where l.contact_id is not null and l.discard_reason is null
  group by l.contact_id
  having count(*) = 1
) sub
where t.contact_id = sub.contact_id
  and t.lead_id is null;
