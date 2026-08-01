-- 056: busca de contato no banco — pré-requisito para parar de baixar a tabela
--
-- Quatro pontos do app deduplicam contato por TELEFONE varrendo o array local
-- (useLeadsStore.add e .concludeSale, LeadForm, LeadEditModal), e a busca
-- global filtra a lista inteira na memória. Isso obriga toda tela que cria
-- lead ou venda a ter os 12.543 contatos carregados — ~7,7 MB por sessão.
--
-- Além do custo, o dedupe local já era frágil: o array reflete o último sync,
-- então dois corretores cadastrando o mesmo telefone ao mesmo tempo criavam
-- duplicata mesmo com a tabela inteira em memória. Perguntar ao banco corrige
-- as duas coisas.

-- ─── Índice funcional para casar telefone sem máscara ────────────────────────
-- Os telefones são gravados formatados ("(47) 99999-0000"), e o app compara
-- só os dígitos. Sem este índice a busca vira seq scan em 12.543 linhas.
create index if not exists idx_contacts_phone_digits
  on public.contacts ((regexp_replace(phone, '\D', '', 'g')));

-- ─── contact_by_phone: o dedupe ──────────────────────────────────────────────
-- Devolve o contato cujo telefone bate por dígitos, ou nada.
-- SECURITY INVOKER: a RLS decide o que o chamador enxerga.
create or replace function public.contact_by_phone(p_phone text)
returns setof public.contacts
language sql
stable
set search_path = public
as $$
  select *
  from public.contacts
  where regexp_replace(phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
    and regexp_replace(p_phone, '\D', '', 'g') <> ''
  limit 1
$$;

grant execute on function public.contact_by_phone(text) to authenticated;

-- ─── search_contacts: a busca global (⌘K) ────────────────────────────────────
-- Replica exatamente o filtro que o GlobalSearch fazia em memória: nome,
-- telefone ou empresa contendo o termo, case-insensitive. `ilike` já é
-- case-insensitive; o telefone casa tanto formatado quanto só com dígitos.
create or replace function public.search_contacts(p_q text, p_limit int default 20)
returns setof public.contacts
language sql
stable
set search_path = public
as $$
  select *
  from public.contacts
  where btrim(p_q) <> ''
    and (
      name             ilike '%' || btrim(p_q) || '%'
      or coalesce(company, '') ilike '%' || btrim(p_q) || '%'
      or phone         ilike '%' || btrim(p_q) || '%'
      or (
        regexp_replace(p_q, '\D', '', 'g') <> ''
        and regexp_replace(phone, '\D', '', 'g') like '%' || regexp_replace(p_q, '\D', '', 'g') || '%'
      )
    )
  order by name
  limit greatest(1, least(p_limit, 50))
$$;

grant execute on function public.search_contacts(text, int) to authenticated;
