-- 098 · Performance do corretor — relatório para gestor e admin
--
-- Nova aba "Performance" na tela de Leads. Todo cálculo mora aqui, uma função
-- por bloco, recebendo os filtros num único jsonb; a tela só exibe.
--
-- ── Quem acessa ─────────────────────────────────────────────────────────────
--   Só admin e gestor (is_manager(): ativo e com is_manager ou papel admin).
--   Toda função pública começa por perf_exige_acesso(), que recusa sem login e
--   recusa corretor comum. Gestor só enxerga corretores (papel broker); o admin
--   pode incluir o próprio usuário. O "E2E Tester" nunca entra em número nenhum.
--   Nada aqui grava em lead, atribuição ou interação: só lê. A única escrita é
--   registrar_presenca(), em activity_logs, do próprio usuário.
--
-- ── Filtros (p_filtros jsonb) ───────────────────────────────────────────────
--   corretores  uuid[] — vazio = todos os corretores ativos
--   de, ate     'AAAA-MM-DD' — dias de São Paulo, inclusive (máx. 400 dias)
--   produtos    text[] — formulário do Meta (meta_form_routing.product_name);
--                        sem formulário, o imóvel do lead
--   origens     text[] — leads.origin
--   anuncios    text[] — meta_webhook_events.ad_id (o evento mais recente do lead)
--   etapas      text[] — leads.funnel_stage (situação atual)
--   situacao    'todos' | 'ativos' | 'descartados'
--   parado_dias int    — limite de "lead parado" (padrão 3)
--   max_tentativas int — tamanho da cadência de followup (padrão 10, a tela manda
--                        o valor de MAX_TENTATIVAS_FOLLOWUP)
--
-- ── Regras ──────────────────────────────────────────────────────────────────
--   • Contato = lead_interactions do tipo whatsapp ou ligacao. Nota, tarefa e
--     mudança de etapa não contam.
--   • Rodízio = atribuição com reason campaign_routing (ou round_robin, o nome
--     antigo, até jun/2026). Transferência manual = manual. Pingue-pongue =
--     sla_recapture. Nada disso é alterado aqui.
--   • Atendido = lead recebido pelo rodízio em que o corretor registrou ao menos
--     um contato. Perdido no pingue-pongue = saiu dele por sla_recapture, ele
--     nunca contatou e hoje está com outro corretor. Recuperado = saiu, voltou
--     para ele e ele contatou (já está dentro dos atendidos).
--   • Tempo até o 1º contato: minutos ÚTEIS pela agenda do rodízio
--     (lead_sla_config.schedule) — a mesma do prazo e da roleta. Não usa
--     business_minutes(), que tem um horário fixo diferente (é a do Pulse).
--     "No prazo" usa lead_sla_config.minutes, não um número escrito à mão.
--   • Lead de prospecção pode ter contato com data anterior à criação: conta
--     como contato normal; o tempo até o contato fica zero.
--   • Agrupamento por dia e hora sempre no fuso America/Sao_Paulo.
--   • Contagens por dia usam interacted_at (a data do contato); "primeira e
--     última ação" e o mapa de calor usam created_at (o momento em que o
--     corretor mexeu no sistema).
--
-- ── Presença ────────────────────────────────────────────────────────────────
--   activity_logs existia e foi esvaziada de uso em 01/08/2026 (gravava cada
--   troca de tela, sem consumidor). Volta só em dois momentos — abrir o
--   sistema e voltar à aba — com no máximo um registro a cada 15 minutos por
--   usuário, garantido aqui, e não na tela.

-- ═══ Índices ════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_li_broker_contato
  ON public.lead_interactions (broker_id, interacted_at) WHERE type IN ('whatsapp', 'ligacao');
CREATE INDEX IF NOT EXISTS idx_li_broker_created
  ON public.lead_interactions (broker_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_to
  ON public.lead_assignments (to_broker_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_from
  ON public.lead_assignments (from_broker_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_presenca
  ON public.activity_logs (broker_id, created_at DESC) WHERE action IN ('abriu', 'voltou');

-- ═══ Peças internas (ninguém chama de fora) ═════════════════════════════════

CREATE OR REPLACE FUNCTION public.perf_exige_acesso()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;
  IF NOT coalesce(is_manager(), false) THEN
    RAISE EXCEPTION 'O relatório de performance é só para gestor ou admin';
  END IF;
END $function$;

-- Uma chave do filtro como lista de texto; qualquer coisa que não seja lista vira vazio.
CREATE OR REPLACE FUNCTION public.perf_lista(f jsonb, k text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN jsonb_typeof(f -> k) = 'array'
              THEN ARRAY(SELECT jsonb_array_elements_text(f -> k))
              ELSE '{}'::text[] END
$function$;

CREATE OR REPLACE FUNCTION public.perf_ordem_etapa(p text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT array_position(ARRAY['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda'], p)
$function$;

-- O período do filtro: dias de São Paulo, inclusive, convertidos em instantes.
CREATE OR REPLACE FUNCTION public.perf_periodo(f jsonb)
RETURNS TABLE (de date, ate date, ini timestamptz, fim timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de   date;
  v_ate  date;
BEGIN
  BEGIN
    v_de  := coalesce(nullif(f ->> 'de', '')::date, v_hoje);
    v_ate := coalesce(nullif(f ->> 'ate', '')::date, v_de);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Datas do período inválidas — use AAAA-MM-DD';
  END;
  IF v_ate < v_de THEN
    RAISE EXCEPTION 'O fim do período é antes do início';
  END IF;
  IF v_ate - v_de > 400 THEN
    RAISE EXCEPTION 'Período longo demais — o máximo é de 400 dias';
  END IF;
  RETURN QUERY SELECT v_de, v_ate,
    (v_de::timestamp AT TIME ZONE 'America/Sao_Paulo'),
    ((v_ate + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
END $function$;

-- Minutos úteis entre dois instantes, pela agenda do rodízio.
CREATE OR REPLACE FUNCTION public.perf_minutos_uteis(p_de timestamptz, p_ate timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH lim AS (
    SELECT p_de AT TIME ZONE 'America/Sao_Paulo' AS f, p_ate AT TIME ZONE 'America/Sao_Paulo' AS t
  ),
  cfg AS (SELECT schedule FROM lead_sla_config WHERE id = 1),
  jan AS (
    SELECT d::date + (x.s ->> 'start')::time AS ini, d::date + (x.s ->> 'end')::time AS fim
    FROM lim, cfg,
         generate_series(date_trunc('day', lim.f), date_trunc('day', lim.t), interval '1 day') d,
         LATERAL (SELECT cfg.schedule -> extract(dow FROM d)::int AS s) x
    WHERE lim.t > lim.f AND coalesce((x.s ->> 'on')::boolean, false)
  )
  SELECT coalesce(sum(greatest(0, extract(epoch FROM (least(jan.fim, lim.t) - greatest(jan.ini, lim.f))) / 60.0)), 0)::numeric
  FROM jan, lim
$function$;

-- O instante cai dentro do horário de atendimento (agenda do rodízio)?
CREATE OR REPLACE FUNCTION public.perf_em_expediente(p_em timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT coalesce((
    SELECT coalesce((x.s ->> 'on')::boolean, false)
       AND (p_em AT TIME ZONE 'America/Sao_Paulo')::time >= (x.s ->> 'start')::time
       AND (p_em AT TIME ZONE 'America/Sao_Paulo')::time <  (x.s ->> 'end')::time
    FROM (SELECT schedule -> extract(dow FROM p_em AT TIME ZONE 'America/Sao_Paulo')::int AS s
          FROM lead_sla_config WHERE id = 1) x), false)
$function$;

-- Os corretores do relatório. Vazio = corretores ativos. Gestor só vê papel broker.
CREATE OR REPLACE FUNCTION public.perf_corretores(f jsonb)
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name
  FROM profiles p
  WHERE p.name <> 'E2E Tester'
    AND (is_admin() OR p.role = 'broker')
    AND CASE WHEN cardinality(perf_lista(f, 'corretores')) = 0
             THEN p.active AND p.role = 'broker'
             ELSE p.id::text = ANY (perf_lista(f, 'corretores')) END
$function$;

-- Os leads que passam nos filtros de produto, origem, anúncio, etapa e situação.
CREATE OR REPLACE FUNCTION public.perf_leads_filtrados(f jsonb, p_com_situacao boolean)
RETURNS TABLE (
  lead_id text, nome text, origem text, produto text, anuncio_id text, anuncio_nome text,
  etapa text, descartado_em timestamptz, motivo text, fechado_em timestamptz, dono uuid,
  criado_em timestamptz, followup_step int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH b AS (
    SELECT l.id, l.name, l.origin,
           coalesce(nullif(r.product_name, ''), pr.name, nullif(l.property_name, '')) AS produto,
           ad.ad_id, ad.ad_name, l.funnel_stage, l.discarded_at, l.discard_reason, l.closed_at,
           l.broker_id, l.created_at, l.followup_step
    FROM leads l
    LEFT JOIN meta_form_routing r ON r.form_id = l.meta_form_id
    LEFT JOIN properties pr ON pr.id = l.property_id
    LEFT JOIN LATERAL (
      SELECT e.ad_id, e.ad_name FROM meta_webhook_events e
      WHERE e.lead_id = l.id AND e.ad_id IS NOT NULL
      ORDER BY e.received_at DESC LIMIT 1) ad ON true
  )
  SELECT b.id, b.name, b.origin, b.produto, b.ad_id, b.ad_name, b.funnel_stage, b.discarded_at,
         b.discard_reason, b.closed_at, b.broker_id, b.created_at, b.followup_step
  FROM b
  WHERE (cardinality(perf_lista(f, 'produtos')) = 0 OR b.produto = ANY (perf_lista(f, 'produtos')))
    AND (cardinality(perf_lista(f, 'origens'))  = 0 OR b.origin  = ANY (perf_lista(f, 'origens')))
    AND (cardinality(perf_lista(f, 'anuncios')) = 0 OR b.ad_id   = ANY (perf_lista(f, 'anuncios')))
    AND (cardinality(perf_lista(f, 'etapas'))   = 0 OR b.funnel_stage = ANY (perf_lista(f, 'etapas')))
    AND (NOT p_com_situacao
         OR coalesce(f ->> 'situacao', 'todos') = 'todos'
         OR (f ->> 'situacao' = 'ativos' AND b.discarded_at IS NULL)
         OR (f ->> 'situacao' = 'descartados' AND b.discarded_at IS NOT NULL))
$function$;

REVOKE ALL ON FUNCTION public.perf_exige_acesso()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perf_lista(jsonb, text)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perf_ordem_etapa(text)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perf_periodo(jsonb)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perf_minutos_uteis(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perf_em_expediente(timestamptz)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perf_corretores(jsonb)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perf_leads_filtrados(jsonb, boolean)      FROM PUBLIC, anon, authenticated;

-- ═══ 1. Resumo (e comparação lado a lado) ═══════════════════════════════════
CREATE OR REPLACE FUNCTION public.perf_resumo(p_filtros jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  PERFORM perf_exige_acesso();

  WITH per AS (SELECT * FROM perf_periodo(p_filtros)),
  cor AS (SELECT * FROM perf_corretores(p_filtros)),
  dim AS (SELECT * FROM perf_leads_filtrados(p_filtros, true)),
  dim_todos AS (SELECT * FROM perf_leads_filtrados(p_filtros, false)),
  prazo AS (SELECT coalesce((SELECT minutes FROM lead_sla_config WHERE id = 1), 10) AS min),
  rec AS (
    SELECT a.lead_id, a.to_broker_id AS corretor, a.reason, a.created_at
    FROM lead_assignments a JOIN dim ON dim.lead_id = a.lead_id, per
    WHERE a.to_broker_id IN (SELECT id FROM cor) AND a.created_at >= per.ini AND a.created_at < per.fim),
  sai AS (
    SELECT a.lead_id, a.from_broker_id AS corretor, a.reason, a.created_at
    FROM lead_assignments a JOIN dim ON dim.lead_id = a.lead_id, per
    WHERE a.from_broker_id IN (SELECT id FROM cor) AND a.created_at >= per.ini AND a.created_at < per.fim),
  cont AS (
    SELECT li.broker_id AS corretor, li.lead_id, li.type, li.interacted_at
    FROM lead_interactions li JOIN dim ON dim.lead_id = li.lead_id
    WHERE li.type IN ('whatsapp', 'ligacao') AND li.broker_id IN (SELECT id FROM cor)),
  rod AS (
    SELECT corretor, lead_id, min(created_at) AS recebido_em
    FROM rec WHERE reason IN ('campaign_routing', 'round_robin') GROUP BY 1, 2),
  rod_det AS (
    SELECT r.corretor, r.lead_id, r.recebido_em, dim.dono,
      (SELECT min(c.interacted_at) FROM cont c WHERE c.corretor = r.corretor AND c.lead_id = r.lead_id) AS primeiro_contato,
      (SELECT min(a.created_at) FROM lead_assignments a
        WHERE a.lead_id = r.lead_id AND a.from_broker_id = r.corretor AND a.reason = 'sla_recapture'
          AND a.created_at >= r.recebido_em) AS saiu_em
    FROM rod r JOIN dim ON dim.lead_id = r.lead_id),
  rod_cls AS (
    SELECT d.*,
      d.primeiro_contato IS NOT NULL AS atendido,
      (d.saiu_em IS NOT NULL AND d.primeiro_contato IS NULL AND d.dono IS DISTINCT FROM d.corretor) AS perdido,
      (d.saiu_em IS NOT NULL AND d.primeiro_contato IS NOT NULL
        AND EXISTS (SELECT 1 FROM lead_assignments a
                    WHERE a.lead_id = d.lead_id AND a.to_broker_id = d.corretor AND a.created_at > d.saiu_em)) AS recuperado,
      CASE WHEN d.primeiro_contato IS NULL THEN NULL
           WHEN d.primeiro_contato <= d.recebido_em THEN 0
           ELSE perf_minutos_uteis(d.recebido_em, d.primeiro_contato) END AS minutos,
      perf_em_expediente(d.recebido_em) AS no_expediente
    FROM rod_det d),
  linha AS (
    SELECT cor.nome, jsonb_build_object(
      'id', cor.id,
      'nome', cor.nome,
      'recebidos', jsonb_build_object(
        'rodizio',        (SELECT count(*) FROM rod WHERE corretor = cor.id),
        'manual_eventos', (SELECT count(*) FROM rec WHERE corretor = cor.id AND reason = 'manual'),
        'manual_leads',   (SELECT count(DISTINCT lead_id) FROM rec WHERE corretor = cor.id AND reason = 'manual'),
        'pingue_eventos', (SELECT count(*) FROM rec WHERE corretor = cor.id AND reason = 'sla_recapture'),
        'pingue_leads',   (SELECT count(DISTINCT lead_id) FROM rec WHERE corretor = cor.id AND reason = 'sla_recapture')),
      'enviados', jsonb_build_object(
        'manual',         (SELECT count(*) FROM sai WHERE corretor = cor.id AND reason = 'manual'),
        'pingue_eventos', (SELECT count(*) FROM sai WHERE corretor = cor.id AND reason = 'sla_recapture'),
        'pingue_leads',   (SELECT count(DISTINCT lead_id) FROM sai WHERE corretor = cor.id AND reason = 'sla_recapture')),
      'atendidos',        (SELECT count(*) FROM rod_cls WHERE corretor = cor.id AND atendido),
      'perdidos_pingue',  (SELECT count(*) FROM rod_cls WHERE corretor = cor.id AND perdido),
      'recuperados',      (SELECT count(*) FROM rod_cls WHERE corretor = cor.id AND recuperado),
      'contatos', (
        SELECT jsonb_build_object(
          'total', count(*),
          'whatsapp', count(*) FILTER (WHERE c.type = 'whatsapp'),
          'ligacao', count(*) FILTER (WHERE c.type = 'ligacao'),
          'leads', count(DISTINCT c.lead_id))
        FROM cont c, per WHERE c.corretor = cor.id AND c.interacted_at >= per.ini AND c.interacted_at < per.fim),
      'carteira', (
        SELECT coalesce(jsonb_object_agg(x.etapa, x.n), '{}'::jsonb)
        FROM (SELECT etapa, count(*) AS n FROM dim
              WHERE dono = cor.id AND descartado_em IS NULL AND fechado_em IS NULL GROUP BY etapa) x),
      'avancos', (
        SELECT count(*) FROM lead_interactions li JOIN dim ON dim.lead_id = li.lead_id, per
        WHERE li.broker_id = cor.id AND li.type = 'stage_change'
          AND li.interacted_at >= per.ini AND li.interacted_at < per.fim
          AND perf_ordem_etapa(li.to_stage) > perf_ordem_etapa(li.from_stage)),
      'descartes', (
        SELECT count(DISTINCT li.lead_id) FROM lead_interactions li JOIN dim_todos d ON d.lead_id = li.lead_id, per
        WHERE li.broker_id = cor.id AND li.type = 'discard'
          AND li.interacted_at >= per.ini AND li.interacted_at < per.fim),
      'primeiro_contato', jsonb_build_object(
        'dentro', (
          SELECT jsonb_build_object(
            'recebidos', count(*), 'contatados', count(minutos),
            'mediana_min', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY minutos))::numeric, 1),
            'no_prazo', count(*) FILTER (WHERE minutos <= (SELECT min FROM prazo)))
          FROM rod_cls WHERE corretor = cor.id AND no_expediente),
        'fora', (
          SELECT jsonb_build_object(
            'recebidos', count(*), 'contatados', count(minutos),
            'mediana_min', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY minutos))::numeric, 1),
            'no_prazo', count(*) FILTER (WHERE minutos <= (SELECT min FROM prazo)))
          FROM rod_cls WHERE corretor = cor.id AND NOT no_expediente))
    ) AS j
    FROM cor)
  SELECT jsonb_build_object(
    'periodo', (SELECT jsonb_build_object('de', de, 'ate', ate) FROM per),
    'prazo_min', (SELECT min FROM prazo),
    'corretores', coalesce((SELECT jsonb_agg(j ORDER BY nome) FROM linha), '[]'::jsonb))
  INTO v;

  RETURN v;
END $function$;

-- ═══ 2. Atividade por dia e mapa de calor ═══════════════════════════════════
CREATE OR REPLACE FUNCTION public.perf_atividade(p_filtros jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  PERFORM perf_exige_acesso();

  WITH per AS (SELECT * FROM perf_periodo(p_filtros)),
  cor AS (SELECT * FROM perf_corretores(p_filtros)),
  dim AS (SELECT * FROM perf_leads_filtrados(p_filtros, true)),
  dias AS (
    SELECT cor.id AS corretor, d::date AS dia
    FROM cor, per, generate_series(per.de::timestamp, per.ate::timestamp, interval '1 day') d),
  acao AS (
    SELECT li.broker_id AS corretor, li.type, li.lead_id, li.interacted_at, li.created_at
    FROM lead_interactions li JOIN dim ON dim.lead_id = li.lead_id, per
    WHERE li.broker_id IN (SELECT id FROM cor)
      AND ((li.interacted_at >= per.ini AND li.interacted_at < per.fim)
        OR (li.created_at    >= per.ini AND li.created_at    < per.fim))),
  conta AS (
    SELECT a.corretor, (a.interacted_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      count(*) FILTER (WHERE a.type IN ('whatsapp', 'ligacao')) AS contatos,
      count(*) FILTER (WHERE a.type = 'whatsapp') AS whatsapp,
      count(*) FILTER (WHERE a.type = 'ligacao') AS ligacoes,
      count(DISTINCT a.lead_id) FILTER (WHERE a.type IN ('whatsapp', 'ligacao')) AS leads,
      count(*) FILTER (WHERE a.type = 'stage_change') AS etapas,
      count(DISTINCT a.lead_id) FILTER (WHERE a.type = 'discard') AS descartes
    FROM acao a GROUP BY 1, 2),
  hora AS (
    SELECT a.corretor, (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      min(a.created_at) AS primeira, max(a.created_at) AS ultima, count(*) AS acoes
    FROM acao a GROUP BY 1, 2),
  calor AS (
    SELECT a.corretor,
      extract(dow  FROM a.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
      extract(hour FROM a.created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
      count(*) AS n
    FROM acao a, per WHERE a.created_at >= per.ini AND a.created_at < per.fim
    GROUP BY 1, 2, 3)
  SELECT jsonb_build_object(
    'dias', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', d.corretor, 'dia', d.dia,
        'contatos', coalesce(c.contatos, 0), 'whatsapp', coalesce(c.whatsapp, 0),
        'ligacoes', coalesce(c.ligacoes, 0), 'leads', coalesce(c.leads, 0),
        'etapas', coalesce(c.etapas, 0), 'descartes', coalesce(c.descartes, 0),
        'acoes', coalesce(h.acoes, 0), 'primeira', h.primeira, 'ultima', h.ultima)
        ORDER BY d.corretor, d.dia)
      FROM dias d
      LEFT JOIN conta c ON c.corretor = d.corretor AND c.dia = d.dia
      LEFT JOIN hora  h ON h.corretor = d.corretor AND h.dia = d.dia), '[]'::jsonb),
    'calor', coalesce((
      SELECT jsonb_agg(jsonb_build_object('corretor', corretor, 'dow', dow, 'hora', hora, 'n', n))
      FROM calor), '[]'::jsonb))
  INTO v;

  RETURN v;
END $function$;

-- ═══ 3. Leads recebidos (lista) ═════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.perf_leads(p_filtros jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  PERFORM perf_exige_acesso();

  WITH per AS (SELECT * FROM perf_periodo(p_filtros)),
  cor AS (SELECT * FROM perf_corretores(p_filtros)),
  dim AS (SELECT * FROM perf_leads_filtrados(p_filtros, true)),
  rec AS (
    SELECT a.to_broker_id AS corretor, a.lead_id, a.reason, a.created_at,
      row_number() OVER (PARTITION BY a.to_broker_id, a.lead_id ORDER BY a.created_at) AS rn
    FROM lead_assignments a JOIN dim ON dim.lead_id = a.lead_id, per
    WHERE a.to_broker_id IN (SELECT id FROM cor) AND a.created_at >= per.ini AND a.created_at < per.fim),
  lin AS (
    SELECT r.corretor, cor.nome AS corretor_nome, r.lead_id, dim.nome, dim.origem, dim.produto,
      dim.anuncio_id, dim.anuncio_nome, r.created_at AS recebido_em, r.reason AS motivo,
      (SELECT min(li.interacted_at) FROM lead_interactions li
        WHERE li.lead_id = r.lead_id AND li.broker_id = r.corretor AND li.type IN ('whatsapp', 'ligacao')) AS primeiro_contato,
      (SELECT count(*) FROM lead_assignments a
        WHERE a.lead_id = r.lead_id AND a.reason IN ('sla_recapture', 'manual')) AS transferencias,
      dim.etapa, dim.descartado_em, dim.fechado_em, dim.dono,
      (SELECT p.name FROM profiles p WHERE p.id = dim.dono) AS dono_nome
    FROM rec r JOIN dim ON dim.lead_id = r.lead_id JOIN cor ON cor.id = r.corretor
    WHERE r.rn = 1),
  ord AS (SELECT * FROM lin ORDER BY recebido_em DESC LIMIT 2000)
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM lin),
    'truncado', (SELECT count(*) FROM lin) > 2000,
    'linhas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', o.corretor, 'corretor_nome', o.corretor_nome,
        'lead_id', o.lead_id, 'nome', o.nome, 'origem', o.origem, 'produto', o.produto,
        'anuncio_id', o.anuncio_id, 'anuncio_nome', o.anuncio_nome,
        'recebido_em', o.recebido_em, 'motivo', o.motivo,
        'primeiro_contato', o.primeiro_contato,
        'contato_antes', o.primeiro_contato < o.recebido_em,
        'minutos', CASE WHEN o.primeiro_contato IS NULL THEN NULL
                        WHEN o.primeiro_contato <= o.recebido_em THEN 0
                        ELSE round(perf_minutos_uteis(o.recebido_em, o.primeiro_contato), 1) END,
        'transferencias', o.transferencias,
        'etapa', o.etapa,
        'situacao', CASE WHEN o.fechado_em IS NOT NULL THEN 'vendido'
                         WHEN o.descartado_em IS NOT NULL THEN 'descartado' ELSE 'ativo' END,
        'dono_nome', o.dono_nome, 'com_ele', o.dono IS NOT DISTINCT FROM o.corretor)
        ORDER BY o.recebido_em DESC)
      FROM ord o), '[]'::jsonb))
  INTO v;

  RETURN v;
END $function$;

-- ═══ 4. Pingue-pongue e transferências ══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.perf_transferencias(p_filtros jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  PERFORM perf_exige_acesso();

  WITH per AS (SELECT * FROM perf_periodo(p_filtros)),
  cor AS (SELECT * FROM perf_corretores(p_filtros)),
  dim AS (SELECT * FROM perf_leads_filtrados(p_filtros, true)),
  ev AS (
    SELECT a.lead_id, a.from_broker_id, a.to_broker_id, a.reason, a.created_at
    FROM lead_assignments a JOIN dim ON dim.lead_id = a.lead_id, per
    WHERE a.created_at >= per.ini AND a.created_at < per.fim
      AND (a.from_broker_id IN (SELECT id FROM cor) OR a.to_broker_id IN (SELECT id FROM cor))),
  pingue AS (
    SELECT cor.id AS corretor, e.lead_id, e.created_at,
           CASE WHEN e.from_broker_id = cor.id THEN 'saida' ELSE 'entrada' END AS sentido
    FROM ev e JOIN cor ON cor.id IN (e.from_broker_id, e.to_broker_id)
    WHERE e.reason = 'sla_recapture'),
  rod AS (
    SELECT a.to_broker_id AS corretor, a.lead_id, min(a.created_at) AS recebido_em
    FROM ev a WHERE a.to_broker_id IN (SELECT id FROM cor) AND a.reason IN ('campaign_routing', 'round_robin')
    GROUP BY 1, 2),
  perdidos AS (
    SELECT r.corretor, r.lead_id, dim.nome, r.recebido_em, x.saiu_em, x.para, dim.dono, dim.etapa,
           dim.descartado_em, dim.fechado_em
    FROM rod r
    JOIN dim ON dim.lead_id = r.lead_id
    JOIN LATERAL (
      SELECT a.created_at AS saiu_em, a.to_broker_id AS para FROM lead_assignments a
      WHERE a.lead_id = r.lead_id AND a.from_broker_id = r.corretor AND a.reason = 'sla_recapture'
        AND a.created_at >= r.recebido_em
      ORDER BY a.created_at LIMIT 1) x ON true
    WHERE dim.dono IS DISTINCT FROM r.corretor
      AND NOT EXISTS (SELECT 1 FROM lead_interactions li
                      WHERE li.lead_id = r.lead_id AND li.broker_id = r.corretor AND li.type IN ('whatsapp', 'ligacao'))),
  vaivem AS (
    SELECT p.corretor, p.lead_id, count(*) AS do_corretor
    FROM pingue p GROUP BY 1, 2),
  vaivem_det AS (
    SELECT v.corretor, v.lead_id, dim.nome, dim.etapa, dim.dono, dim.descartado_em,
      (SELECT count(*) FROM lead_assignments a WHERE a.lead_id = v.lead_id AND a.reason = 'sla_recapture') AS total,
      (SELECT min(li.interacted_at) FROM lead_interactions li
        WHERE li.lead_id = v.lead_id AND li.type IN ('whatsapp', 'ligacao')) AS primeiro_contato,
      (SELECT string_agg(DISTINCT pf.name, ', ') FROM lead_assignments a JOIN profiles pf ON pf.id = a.to_broker_id
        WHERE a.lead_id = v.lead_id AND a.reason = 'sla_recapture') AS passou_por
    FROM vaivem v JOIN dim ON dim.lead_id = v.lead_id),
  manuais AS (
    SELECT cor.id AS corretor, e.lead_id, e.created_at, e.from_broker_id, e.to_broker_id,
           CASE WHEN e.to_broker_id = cor.id THEN 'recebida' ELSE 'enviada' END AS direcao
    FROM ev e JOIN cor ON cor.id IN (e.from_broker_id, e.to_broker_id)
    WHERE e.reason = 'manual')
  SELECT jsonb_build_object(
    'por_dia', coalesce((
      SELECT jsonb_agg(jsonb_build_object('corretor', corretor, 'dia', dia,
        'saidas', saidas, 'saidas_leads', saidas_leads, 'entradas', entradas, 'entradas_leads', entradas_leads)
        ORDER BY corretor, dia)
      FROM (SELECT corretor, (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
              count(*) FILTER (WHERE sentido = 'saida') AS saidas,
              count(DISTINCT lead_id) FILTER (WHERE sentido = 'saida') AS saidas_leads,
              count(*) FILTER (WHERE sentido = 'entrada') AS entradas,
              count(DISTINCT lead_id) FILTER (WHERE sentido = 'entrada') AS entradas_leads
            FROM pingue GROUP BY 1, 2) x), '[]'::jsonb),
    'por_hora', coalesce((
      SELECT jsonb_agg(jsonb_build_object('corretor', corretor, 'hora', hora, 'saidas', saidas, 'entradas', entradas)
        ORDER BY corretor, hora)
      FROM (SELECT corretor, extract(hour FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
              count(*) FILTER (WHERE sentido = 'saida') AS saidas,
              count(*) FILTER (WHERE sentido = 'entrada') AS entradas
            FROM pingue GROUP BY 1, 2) x), '[]'::jsonb),
    'totais', coalesce((
      SELECT jsonb_agg(jsonb_build_object('corretor', corretor, 'saidas', saidas, 'saidas_leads', saidas_leads,
        'entradas', entradas, 'entradas_leads', entradas_leads))
      FROM (SELECT corretor,
              count(*) FILTER (WHERE sentido = 'saida') AS saidas,
              count(DISTINCT lead_id) FILTER (WHERE sentido = 'saida') AS saidas_leads,
              count(*) FILTER (WHERE sentido = 'entrada') AS entradas,
              count(DISTINCT lead_id) FILTER (WHERE sentido = 'entrada') AS entradas_leads
            FROM pingue GROUP BY corretor) x), '[]'::jsonb),
    'perdidos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', p.corretor, 'lead_id', p.lead_id, 'nome', p.nome,
        'recebido_em', p.recebido_em, 'saiu_em', p.saiu_em,
        'para', (SELECT name FROM profiles WHERE id = p.para),
        'dono_hoje', (SELECT name FROM profiles WHERE id = p.dono),
        'etapa', p.etapa,
        'situacao', CASE WHEN p.fechado_em IS NOT NULL THEN 'vendido'
                         WHEN p.descartado_em IS NOT NULL THEN 'descartado' ELSE 'ativo' END,
        'avancou', EXISTS (
          SELECT 1 FROM lead_interactions li
          WHERE li.lead_id = p.lead_id AND li.type = 'stage_change' AND li.interacted_at > p.saiu_em
            AND li.broker_id IS DISTINCT FROM p.corretor
            AND perf_ordem_etapa(li.to_stage) > perf_ordem_etapa(li.from_stage)))
        ORDER BY p.saiu_em DESC)
      FROM perdidos p), '[]'::jsonb),
    'ida_e_volta', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', d.corretor, 'lead_id', d.lead_id, 'nome', d.nome, 'transferencias', d.total,
        'passou_por', d.passou_por, 'primeiro_contato', d.primeiro_contato,
        'dono_hoje', (SELECT name FROM profiles WHERE id = d.dono), 'etapa', d.etapa,
        'descartado', d.descartado_em IS NOT NULL)
        ORDER BY d.total DESC)
      FROM vaivem_det d WHERE d.total > 2), '[]'::jsonb),
    'manuais', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', m.corretor, 'lead_id', m.lead_id,
        'nome', (SELECT nome FROM dim WHERE dim.lead_id = m.lead_id),
        'quando', m.created_at, 'direcao', m.direcao,
        'de', (SELECT name FROM profiles WHERE id = m.from_broker_id),
        'para', (SELECT name FROM profiles WHERE id = m.to_broker_id))
        ORDER BY m.created_at DESC)
      FROM manuais m), '[]'::jsonb))
  INTO v;

  RETURN v;
END $function$;

-- ═══ 5. Cadência de follow-up ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.perf_cadencia(p_filtros jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_max int := coalesce(nullif(p_filtros ->> 'max_tentativas', '')::int, 10);
BEGIN
  PERFORM perf_exige_acesso();

  WITH per AS (SELECT * FROM perf_periodo(p_filtros)),
  ref AS (
    SELECT least(per.ate, (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS dia, per.de, per.ini, per.fim FROM per),
  grade_lim AS (SELECT greatest(ref.de, ref.dia - 30) AS ini, ref.dia AS fim FROM ref),
  grade AS (
    SELECT d::date AS dia FROM grade_lim, generate_series(grade_lim.ini::timestamp, grade_lim.fim::timestamp, interval '1 day') d),
  cor AS (SELECT * FROM perf_corretores(p_filtros)),
  cart AS (
    SELECT dim.* FROM perf_leads_filtrados(p_filtros, false) dim
    WHERE dim.dono IN (SELECT id FROM cor) AND dim.descartado_em IS NULL AND dim.fechado_em IS NULL),
  cont AS (
    SELECT li.lead_id, li.broker_id, li.interacted_at, (li.interacted_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM lead_interactions li JOIN cart ON cart.lead_id = li.lead_id
    WHERE li.type IN ('whatsapp', 'ligacao')),
  lin AS (
    SELECT c.lead_id, c.nome, c.dono, cor.nome AS corretor_nome, c.etapa, coalesce(c.followup_step, 0) AS passo,
      (SELECT max(t.interacted_at) FROM cont t WHERE t.lead_id = c.lead_id) AS ultimo_contato,
      (SELECT array_agg(DISTINCT t.dia ORDER BY t.dia) FROM cont t, grade_lim g
        WHERE t.lead_id = c.lead_id AND t.broker_id = c.dono AND t.dia BETWEEN g.ini AND g.fim) AS dias,
      (SELECT count(*) FROM cont t, ref WHERE t.lead_id = c.lead_id AND t.broker_id = c.dono
        AND t.interacted_at >= ref.ini AND t.interacted_at < ref.fim) AS contatos_periodo,
      EXISTS (SELECT 1 FROM cont t, ref WHERE t.lead_id = c.lead_id AND t.broker_id = c.dono AND t.dia = ref.dia) AS contato_ref,
      EXISTS (SELECT 1 FROM cont t WHERE t.lead_id = c.lead_id AND t.broker_id = c.dono) AS teve_contato_dele,
      c.criado_em
    FROM cart c JOIN cor ON cor.id = c.dono),
  emcad AS (SELECT * FROM lin WHERE etapa = 'followup' AND passo < v_max)
  SELECT jsonb_build_object(
    'dia_ref', (SELECT dia FROM ref),
    'grade', coalesce((SELECT jsonb_agg(dia ORDER BY dia) FROM grade), '[]'::jsonb),
    'max_tentativas', v_max,
    'leads', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'lead_id', l.lead_id, 'nome', l.nome, 'corretor', l.dono, 'corretor_nome', l.corretor_nome,
        'etapa', l.etapa, 'passo', l.passo, 'ultimo_contato', l.ultimo_contato,
        'dias_sem_contato', (SELECT ref.dia FROM ref) - (coalesce(l.ultimo_contato, l.criado_em) AT TIME ZONE 'America/Sao_Paulo')::date,
        'dias', coalesce(to_jsonb(l.dias), '[]'::jsonb), 'contatos_periodo', l.contatos_periodo,
        'contato_ref', l.contato_ref, 'teve_contato_dele', l.teve_contato_dele,
        'grupo', CASE WHEN l.contato_ref THEN 'diario'
                      WHEN l.teve_contato_dele THEN 'sem_contato_hoje'
                      ELSE 'nunca_contatou' END)
        ORDER BY l.corretor_nome, l.contato_ref, l.ultimo_contato NULLS FIRST)
      FROM (SELECT * FROM lin ORDER BY ultimo_contato NULLS FIRST LIMIT 1500) l), '[]'::jsonb),
    'total_leads', (SELECT count(*) FROM lin),
    'aderencia', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', cor.id, 'base', (SELECT count(*) FROM emcad WHERE emcad.dono = cor.id),
        'feitos', (SELECT count(*) FROM emcad WHERE emcad.dono = cor.id AND emcad.contato_ref),
        'por_dia', (
          SELECT coalesce(jsonb_agg(jsonb_build_object('dia', g.dia,
            'feitos', (SELECT count(*) FROM emcad e WHERE e.dono = cor.id AND g.dia = ANY (e.dias))) ORDER BY g.dia), '[]'::jsonb)
          FROM grade g)))
      FROM cor), '[]'::jsonb))
  INTO v;

  RETURN v;
END $function$;

-- ═══ 6. Funil do corretor ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.perf_funil(p_filtros jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_parado int := greatest(1, coalesce(nullif(p_filtros ->> 'parado_dias', '')::int, 3));
BEGIN
  PERFORM perf_exige_acesso();

  WITH per AS (SELECT * FROM perf_periodo(p_filtros)),
  cor AS (SELECT * FROM perf_corretores(p_filtros)),
  dim AS (SELECT * FROM perf_leads_filtrados(p_filtros, true)),
  etapas AS (
    SELECT e AS etapa, perf_ordem_etapa(e) AS ordem
    FROM unnest(ARRAY['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']) e),
  mov AS (
    SELECT li.broker_id AS corretor, li.lead_id, li.from_stage, li.to_stage, li.interacted_at,
      extract(epoch FROM li.interacted_at - coalesce(
        (SELECT max(p.interacted_at) FROM lead_interactions p
          WHERE p.lead_id = li.lead_id AND p.type = 'stage_change'
            AND p.to_stage = li.from_stage AND p.interacted_at < li.interacted_at),
        (SELECT l.created_at FROM leads l WHERE l.id = li.lead_id))) / 86400.0 AS dias_na_etapa
    FROM lead_interactions li JOIN dim ON dim.lead_id = li.lead_id, per
    WHERE li.type = 'stage_change' AND li.broker_id IN (SELECT id FROM cor)
      AND li.interacted_at >= per.ini AND li.interacted_at < per.fim),
  recebidos AS (
    SELECT a.to_broker_id AS corretor, count(DISTINCT a.lead_id) AS n
    FROM lead_assignments a JOIN dim ON dim.lead_id = a.lead_id, per
    WHERE a.to_broker_id IN (SELECT id FROM cor) AND a.created_at >= per.ini AND a.created_at < per.fim
    GROUP BY 1),
  ultimo AS (
    SELECT li.lead_id, max(li.interacted_at) AS em
    FROM lead_interactions li JOIN dim ON dim.lead_id = li.lead_id
    WHERE li.type IN ('whatsapp', 'ligacao') GROUP BY 1),
  parados AS (
    SELECT dim.lead_id, dim.nome, dim.dono, dim.etapa, u.em AS ultimo_contato,
      ((now() AT TIME ZONE 'America/Sao_Paulo')::date
        - (coalesce(u.em, dim.criado_em) AT TIME ZONE 'America/Sao_Paulo')::date) AS dias
    FROM dim LEFT JOIN ultimo u ON u.lead_id = dim.lead_id
    WHERE dim.dono IN (SELECT id FROM cor) AND dim.descartado_em IS NULL AND dim.fechado_em IS NULL)
  SELECT jsonb_build_object(
    'parado_dias', v_parado,
    'etapas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', cor.id, 'etapa', e.etapa,
        'entraram', CASE WHEN e.etapa = 'lead'
                         THEN coalesce((SELECT n FROM recebidos r WHERE r.corretor = cor.id), 0)
                         ELSE (SELECT count(*) FROM mov m WHERE m.corretor = cor.id AND m.to_stage = e.etapa) END,
        'avancaram', (SELECT count(*) FROM mov m WHERE m.corretor = cor.id AND m.from_stage = e.etapa
                        AND perf_ordem_etapa(m.to_stage) > e.ordem),
        'voltaram', (SELECT count(*) FROM mov m WHERE m.corretor = cor.id AND m.from_stage = e.etapa
                        AND perf_ordem_etapa(m.to_stage) < e.ordem),
        'tempo_medio_dias', (SELECT round(avg(m.dias_na_etapa)::numeric, 1) FROM mov m
                              WHERE m.corretor = cor.id AND m.from_stage = e.etapa),
        'na_carteira', (SELECT count(*) FROM dim WHERE dim.dono = cor.id AND dim.etapa = e.etapa
                          AND dim.descartado_em IS NULL AND dim.fechado_em IS NULL))
        ORDER BY cor.nome, e.ordem)
      FROM cor, etapas e), '[]'::jsonb),
    'parados', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', p.dono, 'lead_id', p.lead_id, 'nome', p.nome, 'etapa', p.etapa,
        'ultimo_contato', p.ultimo_contato, 'dias', p.dias)
        ORDER BY p.dias DESC)
      FROM (SELECT * FROM parados WHERE dias > v_parado ORDER BY dias DESC LIMIT 1000) p), '[]'::jsonb),
    'total_parados', (SELECT count(*) FROM parados WHERE dias > v_parado))
  INTO v;

  RETURN v;
END $function$;

-- ═══ 7. Descartes ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.perf_descartes(p_filtros jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  PERFORM perf_exige_acesso();

  WITH per AS (SELECT * FROM perf_periodo(p_filtros)),
  cor AS (SELECT * FROM perf_corretores(p_filtros)),
  dim AS (SELECT * FROM perf_leads_filtrados(p_filtros, false)),
  d AS (
    SELECT DISTINCT ON (li.lead_id, li.broker_id)
      li.broker_id AS corretor, li.lead_id, li.interacted_at AS quando, li.description
    FROM lead_interactions li JOIN dim ON dim.lead_id = li.lead_id, per
    WHERE li.type = 'discard' AND li.broker_id IN (SELECT id FROM cor)
      AND li.interacted_at >= per.ini AND li.interacted_at < per.fim
    ORDER BY li.lead_id, li.broker_id, li.interacted_at DESC),
  lin AS (
    SELECT d.corretor, cor.nome AS corretor_nome, d.lead_id, dim.nome, d.quando,
      coalesce(
        CASE lower(trim(substring(d.description FROM '^Descartado em (.+?) —')))
          WHEN 'lead' THEN 'lead' WHEN 'leads' THEN 'lead' WHEN 'followup' THEN 'followup'
          WHEN 'atendimento' THEN 'atendimento' WHEN 'visita' THEN 'visita'
          WHEN 'proposta' THEN 'proposta' WHEN 'venda' THEN 'venda' END,
        dim.etapa) AS etapa,
      CASE WHEN dim.descartado_em IS NOT NULL THEN dim.motivo
           ELSE nullif(trim(substring(d.description FROM '— (.*)$')), '') END AS motivo,
      (SELECT count(*) FROM lead_interactions c
        WHERE c.lead_id = d.lead_id AND c.type IN ('whatsapp', 'ligacao') AND c.interacted_at < d.quando) AS contatos_antes,
      (SELECT count(*) FROM lead_interactions c
        WHERE c.lead_id = d.lead_id AND c.broker_id = d.corretor AND c.type IN ('whatsapp', 'ligacao')
          AND c.interacted_at < d.quando) AS contatos_dele_antes,
      dim.origem, dim.anuncio_id, dim.anuncio_nome, dim.produto,
      dim.descartado_em IS NOT NULL AS ainda_descartado
    FROM d JOIN dim ON dim.lead_id = d.lead_id JOIN cor ON cor.id = d.corretor)
  SELECT jsonb_build_object(
    'linhas', coalesce((
      SELECT jsonb_agg(to_jsonb(lin) ORDER BY lin.quando DESC) FROM lin), '[]'::jsonb),
    'por_motivo', coalesce((
      SELECT jsonb_agg(jsonb_build_object('corretor', corretor, 'motivo', motivo, 'n', n, 'poucos_contatos', poucos)
        ORDER BY corretor, n DESC)
      FROM (SELECT corretor, coalesce(motivo, 'sem_motivo') AS motivo, count(*) AS n,
                   count(*) FILTER (WHERE contatos_antes < 3) AS poucos
            FROM lin GROUP BY 1, 2) x), '[]'::jsonb))
  INTO v;

  RETURN v;
END $function$;

-- ═══ Presença: linha do tempo do dia ════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.perf_presenca(p_filtros jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  PERFORM perf_exige_acesso();

  -- Linha do tempo só faz sentido dia a dia: no máximo os últimos 31 dias do período.
  WITH per AS (SELECT * FROM perf_periodo(p_filtros)),
  lim AS (
    SELECT greatest(per.de, per.ate - 30) AS de, per.ate,
      (greatest(per.de, per.ate - 30)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS ini, per.fim
    FROM per),
  cor AS (SELECT * FROM perf_corretores(p_filtros)),
  dias AS (
    SELECT cor.id AS corretor, d::date AS dia
    FROM cor, lim, generate_series(lim.de::timestamp, lim.ate::timestamp, interval '1 day') d),
  acesso AS (
    SELECT a.broker_id AS corretor, (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      min(a.created_at) AS primeiro, count(*) AS n,
      jsonb_agg(a.created_at ORDER BY a.created_at) AS horarios
    FROM activity_logs a, lim
    WHERE a.broker_id IN (SELECT id FROM cor) AND a.action IN ('abriu', 'voltou')
      AND a.created_at >= lim.ini AND a.created_at < lim.fim
    GROUP BY 1, 2),
  acao AS (
    SELECT li.broker_id AS corretor, (li.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      min(li.created_at) AS primeira, max(li.created_at) AS ultima
    FROM lead_interactions li, lim
    WHERE li.broker_id IN (SELECT id FROM cor) AND li.created_at >= lim.ini AND li.created_at < lim.fim
    GROUP BY 1, 2),
  perda AS (
    SELECT a.from_broker_id AS corretor, (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      jsonb_agg(a.created_at ORDER BY a.created_at) AS horarios
    FROM lead_assignments a, lim
    WHERE a.from_broker_id IN (SELECT id FROM cor) AND a.reason = 'sla_recapture'
      AND a.created_at >= lim.ini AND a.created_at < lim.fim
    GROUP BY 1, 2)
  SELECT jsonb_build_object(
    'dias', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'corretor', d.corretor, 'dia', d.dia,
        'primeiro_acesso', ac.primeiro, 'acessos', coalesce(ac.n, 0), 'acessos_em', coalesce(ac.horarios, '[]'::jsonb),
        'primeira_acao', ax.primeira, 'ultima_acao', ax.ultima,
        'perdas', coalesce(pe.horarios, '[]'::jsonb))
        ORDER BY d.corretor, d.dia DESC)
      FROM dias d
      LEFT JOIN acesso ac ON ac.corretor = d.corretor AND ac.dia = d.dia
      LEFT JOIN acao   ax ON ax.corretor = d.corretor AND ax.dia = d.dia
      LEFT JOIN perda  pe ON pe.corretor = d.corretor AND pe.dia = d.dia), '[]'::jsonb),
    'registro_desde', (SELECT min(created_at) FROM activity_logs WHERE action IN ('abriu', 'voltou')))
  INTO v;

  RETURN v;
END $function$;

-- ═══ Opções dos filtros ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.perf_opcoes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  PERFORM perf_exige_acesso();

  WITH base AS (SELECT * FROM perf_leads_filtrados('{}'::jsonb, false))
  SELECT jsonb_build_object(
    'corretores', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.name, 'ativo', p.active, 'papel', p.role)
        ORDER BY p.active DESC, p.name)
      FROM profiles p
      WHERE p.name <> 'E2E Tester' AND (is_admin() OR p.role = 'broker')), '[]'::jsonb),
    'produtos', coalesce((
      SELECT jsonb_agg(produto ORDER BY produto) FROM (SELECT DISTINCT produto FROM base WHERE produto IS NOT NULL) x), '[]'::jsonb),
    'origens', coalesce((
      SELECT jsonb_agg(origem ORDER BY origem) FROM (SELECT DISTINCT origem FROM base WHERE origem IS NOT NULL) x), '[]'::jsonb),
    'anuncios', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', ad_id, 'nome', nome, 'leads', leads) ORDER BY ultimo DESC)
      FROM (SELECT e.ad_id, max(e.ad_name) AS nome, count(DISTINCT e.lead_id) AS leads, max(e.received_at) AS ultimo
            FROM meta_webhook_events e
            WHERE e.ad_id IS NOT NULL AND e.lead_id IS NOT NULL
            GROUP BY e.ad_id ORDER BY max(e.received_at) DESC LIMIT 300) x), '[]'::jsonb))
  INTO v;

  RETURN v;
END $function$;

-- ═══ Registrar presença (abrir o sistema / voltar à aba) ════════════════════
CREATE OR REPLACE FUNCTION public.registrar_presenca(p_acao text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;
  IF p_acao IS NULL OR p_acao NOT IN ('abriu', 'voltou') THEN
    RAISE EXCEPTION 'Tipo de presença inválido';
  END IF;

  -- Duas abas abrindo juntas não gravam dois registros.
  PERFORM pg_advisory_xact_lock(hashtext('registrar_presenca:' || auth.uid()::text));

  IF EXISTS (
    SELECT 1 FROM activity_logs
    WHERE broker_id = auth.uid() AND action IN ('abriu', 'voltou')
      AND created_at > now() - interval '15 minutes'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO activity_logs (broker_id, action, page, details)
  VALUES (auth.uid(), p_acao, NULL, '{}'::jsonb);
  RETURN true;
END $function$;

-- ═══ Permissões das funções públicas ════════════════════════════════════════
REVOKE ALL ON FUNCTION public.perf_resumo(jsonb)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perf_atividade(jsonb)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perf_leads(jsonb)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perf_transferencias(jsonb)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perf_cadencia(jsonb)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perf_funil(jsonb)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perf_descartes(jsonb)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perf_presenca(jsonb)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perf_opcoes()               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_presenca(text)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.perf_resumo(jsonb)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_atividade(jsonb)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_leads(jsonb)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_transferencias(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_cadencia(jsonb)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_funil(jsonb)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_descartes(jsonb)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_presenca(jsonb)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_opcoes()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_presenca(text)   TO authenticated;
