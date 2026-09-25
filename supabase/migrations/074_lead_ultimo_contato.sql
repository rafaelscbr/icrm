-- 074: Último contato real com o lead
--
-- O funil precisa responder "há quanto tempo ninguém fala com este lead?" — é
-- o filtro que o corretor mais usa para decidir o dia. Até aqui a resposta
-- saía da última linha de `lead_interactions`, de qualquer tipo, e isso mentia
-- de dois jeitos:
--
--   1. Nota automática contava como contato. "Transferido automaticamente"
--      (o ping-pong do SLA, ~8.500 linhas) deixava o lead que NUNCA foi
--      atendido com cara de recém-contatado. Mover o card de coluna também.
--   2. A tela baixava a tabela inteira (~5,4 MB, 15 mil linhas) para ler uma
--      data por lead — e o PostgREST corta em 1.000 linhas, então o lead
--      antigo caía no "sem interação" pelo motivo errado.
--
-- Agora o banco guarda a data num lugar só, mantida por trigger, e a tela lê
-- do próprio lead. Conta como contato o que o corretor fez EM DIREÇÃO ao
-- cliente e deixou registrado:
--
--   whatsapp  abriu a conversa pelo botão do funil
--   ligacao   ligação registrada
--   tarefa    tarefa do lead concluída (visita, vídeo chamada, retorno)
--
-- Fica de fora: nota (quase toda automática), stage_change e discard. O
-- sistema só sabe que a conversa foi aberta — não que o cliente respondeu —,
-- então a tela diz "último contato", nunca "última conversa".

alter table public.leads
  add column if not exists last_contact_at timestamptz;

comment on column public.leads.last_contact_at is
  'Último contato registrado (whatsapp, ligacao ou tarefa em lead_interactions). Gerenciado por trigger — o front só lê. Ver migração 074.';


create or replace function public.refresh_lead_last_contact()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  tipos constant text[] := array['whatsapp', 'ligacao', 'tarefa'];
BEGIN
  -- Caminho comum: contato novo só avança a data, nunca recua.
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = ANY (tipos) THEN
      UPDATE public.leads
         SET last_contact_at = NEW.interacted_at,
             updated_at      = now()
       WHERE id = NEW.lead_id
         AND (last_contact_at IS NULL OR last_contact_at < NEW.interacted_at);
    END IF;
    RETURN NEW;
  END IF;

  -- Exclusão (ou correção) de um contato: recalcula a partir do que sobrou.
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.type = ANY (tipos) THEN
    UPDATE public.leads
       SET last_contact_at = (
             SELECT max(li.interacted_at) FROM public.lead_interactions li
              WHERE li.lead_id = OLD.lead_id AND li.type = ANY (tipos)
           ),
           updated_at = now()
     WHERE id = OLD.lead_id;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.type = ANY (tipos) THEN
    UPDATE public.leads
       SET last_contact_at = (
             SELECT max(li.interacted_at) FROM public.lead_interactions li
              WHERE li.lead_id = NEW.lead_id AND li.type = ANY (tipos)
           ),
           updated_at = now()
     WHERE id = NEW.lead_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$;

drop trigger if exists trg_lead_last_contact on public.lead_interactions;
create trigger trg_lead_last_contact
  after insert or update or delete on public.lead_interactions
  for each row execute function public.refresh_lead_last_contact();


-- Backfill. NÃO toca updated_at de propósito: o Kanban usa updated_at para
-- ordenar os cards que nunca foram arrastados, e mexer em todos de uma vez
-- embaralharia a ordem manual de quem já organizou o funil.
update public.leads l
   set last_contact_at = s.ultimo
  from (
    select lead_id, max(interacted_at) as ultimo
      from public.lead_interactions
     where type = any (array['whatsapp', 'ligacao', 'tarefa'])
     group by lead_id
  ) s
 where s.lead_id = l.id
   and l.last_contact_at is distinct from s.ultimo;
