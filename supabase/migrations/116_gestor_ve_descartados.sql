-- 116 · Gestor vê os descartados do corretor (somente leitura)
--
-- Pedido do Rafael (26/11/2026): "colocar para o gestor poder visualizar os
-- descartados do corretor". Até aqui o gestor via só o funil ABERTO do colega
-- (091) e abria a ficha só desses leads (095).
--
-- O que muda:
--   • team_discarded_leads(corretor) — nova. Os leads descartados do corretor,
--     do mais recente para o mais antigo, no mesmo formato do quadro
--     (team_funnel_leads): sem telefone, e-mail, anotações e respostas do
--     formulário. O motivo, a data e a etapa em que parou vêm junto.
--   • team_lead_detail(lead) — passa a abrir também o lead DESCARTADO do
--     colega. Vendido (closed_at) continua fora.
--
-- Continua valendo:
--   • SOMENTE LEITURA. Nenhuma permissão de escrita é criada: reabrir o lead,
--     mudar o motivo ou transferir segue barrado pelas regras das tabelas.
--   • Só gestor (ou admin) chama; só corretor ATIVO; lead do admin não entra.
--   • A regra de acesso de leads não é afrouxada: a leitura é por função
--     própria, como na 091 e na 095.

-- ── 1. Os descartados do colega ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.team_discarded_leads(p_broker_id uuid)
RETURNS SETOF leads
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;
  IF NOT is_manager() THEN
    RAISE EXCEPTION 'Só gestor ou admin pode ver os descartados de outro corretor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_broker_id AND active AND role = 'broker') THEN
    RAISE EXCEPTION 'Corretor não encontrado ou inativo';
  END IF;

  RETURN QUERY
  SELECT (jsonb_populate_record(l, jsonb_build_object(
            'phone', '', 'email', NULL, 'notes', NULL, 'form_answers', NULL))).*
  FROM leads l
  WHERE l.broker_id = p_broker_id
    AND l.discard_reason IS NOT NULL
    AND l.closed_at IS NULL
  ORDER BY l.discarded_at DESC NULLS LAST, l.created_at DESC;
END $function$;

REVOKE ALL ON FUNCTION public.team_discarded_leads(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_discarded_leads(uuid) TO authenticated;

-- ── 2. A ficha de leitura abre também o descartado ──────────────────────────
CREATE OR REPLACE FUNCTION public.team_lead_detail(p_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_lead leads%ROWTYPE;
begin
  if auth.uid() is null then
    raise exception 'Sua sessão expirou — entre de novo';
  end if;
  if not is_manager() then
    raise exception 'Só gestor ou admin pode ver o lead de outro corretor';
  end if;

  -- Lead aberto OU descartado (116) de corretor ativo. Vendido fica fora.
  -- Fora disso a resposta é uma só, para não revelar que o lead existe.
  select l.* into v_lead
  from leads l
  join profiles p on p.id = l.broker_id
  where l.id = p_lead_id
    and p.active and p.role = 'broker'
    and l.closed_at is null;
  if not found then
    raise exception 'Lead não encontrado no funil ou nos descartados de um corretor ativo';
  end if;

  return jsonb_build_object(
    'lead',     to_jsonb(v_lead),
    'profile',  public.lead_profile_resolvido(p_lead_id),
    'timeline', coalesce((
                  select jsonb_agg(to_jsonb(li) order by li.interacted_at desc, li.id desc)
                  from lead_interactions li
                  where li.lead_id = p_lead_id), '[]'::jsonb),
    'tasks',    coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id', t.id, 'title', t.title, 'category', t.category,
                           'dueDate', t.due_date, 'dueTime', t.due_time, 'priority', t.priority)
                         order by t.due_date nulls last, t.due_time nulls last)
                  from tasks t
                  where t.lead_id = p_lead_id and t.status <> 'done'), '[]'::jsonb)
  );
end $function$;

REVOKE ALL ON FUNCTION public.team_lead_detail(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_lead_detail(text) TO authenticated;
