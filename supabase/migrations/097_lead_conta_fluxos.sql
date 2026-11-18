-- 097 · O lead sabe quantos fluxos tem — para o sinal no cartão do Kanban
--
-- O cartão do Kanban passa a mostrar um ícone quando o lead tem fluxo de
-- pagamento guardado (migração 096). Para isso o cartão precisa saber, de cada
-- lead, se existe fluxo — sem fazer uma leitura a mais por cartão nem baixar a
-- tabela de fluxos inteira.
--
-- Solução, a mesma do "último contato" (leads.last_contact_at, migração 074):
-- uma coluna no próprio lead, mantida pelo banco.
--
--   • leads.fluxos_count — quantos FLUXOS não arquivados o lead tem (versões do
--     mesmo fluxo contam uma vez).
--   • Um gatilho em lead_fluxos recalcula quando um fluxo é criado ou arquivado.
--     Salvar uma versão nova de um fluxo que já existe não muda a contagem, e
--     nesse caso o lead nem é tocado.
--   • Quando a contagem muda, updated_at do lead é atualizado junto: é o que faz
--     o cartão acender na hora (tempo real) e o sync incremental enxergar.
--
-- Não dispara mais nada: os gatilhos de atualização de leads só reagem a troca
-- de corretor, etapa, descarte, venda e qualificação — nenhum olha esta coluna.
-- A tela só lê a coluna; quem escreve é o gatilho.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fluxos_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.leads.fluxos_count IS
  'Quantos fluxos de pagamento não arquivados o lead tem. Mantido pelo gatilho trg_lead_fluxos_recount (migração 097); a tela só lê.';

CREATE OR REPLACE FUNCTION public.lead_fluxos_recount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n int;
BEGIN
  SELECT count(DISTINCT fluxo_id) INTO v_n
  FROM lead_fluxos
  WHERE lead_id = NEW.lead_id AND arquivado_em IS NULL;

  -- Só toca o lead quando a contagem muda de verdade.
  UPDATE leads
  SET fluxos_count = v_n, updated_at = now()
  WHERE id = NEW.lead_id AND fluxos_count IS DISTINCT FROM v_n;

  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.lead_fluxos_recount() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lead_fluxos_recount ON public.lead_fluxos;
CREATE TRIGGER trg_lead_fluxos_recount
  AFTER INSERT OR UPDATE OF arquivado_em ON public.lead_fluxos
  FOR EACH ROW EXECUTE FUNCTION public.lead_fluxos_recount();

-- Acerta quem já tinha fluxo salvo antes desta migração.
UPDATE public.leads l
SET fluxos_count = x.n, updated_at = now()
FROM (
  SELECT lead_id, count(DISTINCT fluxo_id)::int AS n
  FROM public.lead_fluxos
  WHERE arquivado_em IS NULL
  GROUP BY lead_id
) x
WHERE l.id = x.lead_id AND l.fluxos_count IS DISTINCT FROM x.n;
