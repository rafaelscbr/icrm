-- 095 · Gestor abre os detalhes do lead do colega (somente leitura)
--        + fecha cinco portas que respondiam SEM LOGIN (perfil do lead e produtos)
--
-- ═══ PARTE 1 — Segurança (achado ao preparar a parte 2) ═════════════════════
--
-- Três funções do perfil do lead podiam ser chamadas por quem NÃO está logado,
-- bastando informar o código do lead (provado em transação desfeita, 18/11/2026):
--
--   • lead_profile_base(lead)  — não tinha checagem nenhuma. Devolvia telefone,
--     respostas do formulário (renda, entrada, objetivo) e listas.
--   • lead_profile(lead)       — a trava era
--         if not (v_lead.broker_id = auth.uid() or is_admin())
--     Sem login, auth.uid() é nulo, a comparação dá NULO (nem verdadeiro nem
--     falso) e o IF não dispara: a trava "falhava aberta". Corretor logado que
--     não é o dono era barrado normalmente; quem não tinha login passava.
--   • set_lead_profile_field(lead, campo, valor) — mesma trava, e esta GRAVA:
--     sem login dava para alterar o perfil de um lead.
--
-- E duas visões respondiam sem login, porque visão sem "security_invoker" lê
-- as tabelas com o direito do dono e ignora a regra de acesso delas:
--
--   • lead_declared — devolvia o CÓDIGO e o perfil declarado (renda, entrada,
--     objetivo) de 1.256 leads de uma vez. É a pior das cinco: os códigos de
--     lead são longos e aleatórios, impossíveis de adivinhar, e era esta visão
--     que os entregava — com eles, as funções acima davam o telefone. Logado,
--     um corretor também lia por ela o perfil dos leads dos colegas.
--   • development_units_effective — a tabela de unidades e preços dos produtos.
--
-- A chave usada por quem não tem login é a chave pública do site (vai dentro do
-- JavaScript, por desenho). Quem protege os dados é o banco, e aqui não protegia.
--
-- O que muda:
--   • as três funções deixam de ser executáveis por quem não tem login;
--   • lead_profile_base vira função interna (nem usuário logado chama direto;
--     só lead_profile e a função nova do gestor a usam);
--   • a trava passa a testar "sem login" de forma explícita e a tratar o nulo;
--   • lead_declared deixa de ser legível pela API (só as funções internas do
--     banco a usam — o app nunca a consultou direto);
--   • development_units_effective deixa de ser legível sem login.
-- Para o dono do lead e para o admin, nada muda no que eles veem ou gravam.
--
-- ═══ PARTE 2 — Gestor vê os detalhes ════════════════════════════════════════
--
-- Na migração 091 o gestor ganhou o quadro do colega, sem abrir o lead e sem
-- dados de contato. Agora ele abre o lead e lê a ficha inteira: telefone,
-- e-mail, anotações, perfil declarado, formulários, histórico e tarefas em
-- aberto.
--
-- Continua valendo:
--   • SOMENTE LEITURA. Nenhuma permissão de escrita é criada; mover, editar,
--     transferir, registrar contato e qualificar seguem barrados pelas regras
--     das tabelas, que não mudam.
--   • Os mesmos limites do quadro: só lead do funil ABERTO (sem descartados e
--     sem vendidos) de corretor ATIVO. Lead do admin não entra.
--   • O quadro (team_funnel_leads) segue vindo sem telefone: o contato só sai
--     do banco um lead por vez, quando o gestor abre a ficha.
--   • A regra de acesso de leads e de lead_interactions não é afrouxada: a
--     leitura é por função própria, como na 091 e na 094.

-- ── 1.1 lead_profile_base: só uso interno ───────────────────────────────────
REVOKE ALL ON FUNCTION public.lead_profile_base(text) FROM PUBLIC, anon, authenticated;

-- ── 1.2 Perfil resolvido (formulário + o que o corretor apurou) — interna ───
-- É o corpo que estava em lead_profile, sem a trava: quem chama é que decide
-- quem pode ver (lead_profile para o dono/admin, team_lead_detail para o gestor).
CREATE OR REPLACE FUNCTION public.lead_profile_resolvido(p_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_base   jsonb;
  v_over   jsonb;
  v_perfil jsonb;
  k        text;
begin
  select coalesce(profile_override, '{}'::jsonb) into v_over from leads where id = p_lead_id;
  if not found then return null; end if;

  v_base := public.lead_profile_base(p_lead_id);
  v_perfil := coalesce(v_base -> 'profile', '{}'::jsonb);

  -- Marca o que veio do formulário
  select jsonb_object_agg(key, value || jsonb_build_object('source','formulario'))
  into v_perfil from jsonb_each(v_perfil);

  -- Sobrepõe com o apurado
  for k in select jsonb_object_keys(v_over) loop
    v_perfil := coalesce(v_perfil,'{}'::jsonb) || jsonb_build_object(k,
      (v_over -> k) || jsonb_build_object('source','corretor'));
  end loop;

  return v_base
    || jsonb_build_object('profile', coalesce(v_perfil, '{}'::jsonb))
    -- Recalcula o que falta em cima do perfil já resolvido
    || jsonb_build_object('missing', (
         select coalesce(array_agg(c), '{}'::text[])
         from unnest(array['objetivo','renda','entrada','prazo']) c
         where coalesce(v_perfil,'{}'::jsonb) -> c is null));
end $function$;

REVOKE ALL ON FUNCTION public.lead_profile_resolvido(text) FROM PUBLIC, anon, authenticated;

-- ── 1.3 lead_profile: mesma resposta, trava que não falha aberta ────────────
CREATE OR REPLACE FUNCTION public.lead_profile(p_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_broker uuid;
begin
  if auth.uid() is null then
    raise exception 'Sua sessão expirou — entre de novo';
  end if;

  select broker_id into v_broker from leads where id = p_lead_id;
  if not found then return null; end if;

  if not (coalesce(v_broker = auth.uid(), false) or is_admin()) then
    raise exception 'Sem permissão para ver este lead';
  end if;

  return public.lead_profile_resolvido(p_lead_id);
end $function$;

REVOKE ALL ON FUNCTION public.lead_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_profile(text) TO authenticated;

-- ── 1.4 set_lead_profile_field: troca só a linha da trava ───────────────────
-- Mesmo método das migrações 072 e 093: a função fica como está no banco e
-- troca-se o trecho-alvo. Se o trecho não for encontrado, a migração para e
-- nada é alterado.
do $do$
declare
  v_def  text;
  v_alvo text := 'if not (v_lead.broker_id = auth.uid() or is_admin()) then';
  v_novo text := 'if auth.uid() is null or not (coalesce(v_lead.broker_id = auth.uid(), false) or is_admin()) then';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_lead_profile_field';

  if v_def is null or position(v_alvo in v_def) = 0 then
    raise exception 'Trava de set_lead_profile_field não encontrada — nada foi alterado';
  end if;

  execute replace(v_def, v_alvo, v_novo);
end $do$;

REVOKE ALL ON FUNCTION public.set_lead_profile_field(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lead_profile_field(text, text, jsonb) TO authenticated;

-- ── 1.5 Visões: fora da API ─────────────────────────────────────────────────
-- lead_declared só é lida por funções internas (leads_intelligence,
-- development_matches, set_lead_profile_field), que rodam com o direito do
-- dono e não dependem destas permissões.
REVOKE ALL ON public.lead_declared FROM PUBLIC, anon, authenticated;
-- A tabela de unidades continua legível para quem está logado.
REVOKE ALL ON public.development_units_effective FROM PUBLIC, anon;

-- ── 2. A ficha do lead do colega, para o gestor ─────────────────────────────
-- Uma chamada só devolve tudo que a ficha de leitura mostra.
CREATE OR REPLACE FUNCTION public.team_lead_detail(p_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

  -- Mesmos limites do quadro (team_funnel_leads): funil aberto de corretor
  -- ativo. Fora disso a resposta é uma só, para não revelar que o lead existe.
  select l.* into v_lead
  from leads l
  join profiles p on p.id = l.broker_id
  where l.id = p_lead_id
    and p.active and p.role = 'broker'
    and l.discard_reason is null
    and l.closed_at is null;
  if not found then
    raise exception 'Lead não encontrado no funil aberto de um corretor ativo';
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
