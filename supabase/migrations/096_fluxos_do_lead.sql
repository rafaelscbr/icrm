-- 096 · Fluxos do lead — simulações guardadas na ficha, com versões
--
-- O simulador não guardava nada: a simulação virava uma imagem ou um texto de
-- WhatsApp e sumia ao sair da tela. Agora o corretor abre o simulador de dentro
-- do lead, salva o fluxo, reabre para editar e marca quando enviou ao cliente.
--
-- Como fica guardado:
--   • Cada linha de lead_fluxos é UMA VERSÃO de um fluxo. Editar não sobrescreve:
--     cria a versão seguinte do mesmo fluxo (fluxo_id agrupa as versões). Assim o
--     histórico mostra o que foi proposto em cada momento.
--   • dados    — o que o corretor preencheu (para reabrir e editar).
--   • resumo   — os números principais, congelados na hora de salvar.
--   • mensagem — o texto do WhatsApp exatamente como foi gerado.
--     resumo e mensagem não são recalculados: se a regra de cálculo mudar, a
--     versão antiga continua mostrando o que o cliente viu.
--   • A imagem não é guardada: com os dados salvos ela é refeita na hora.
--
-- Quem acessa — a mesma regra do histórico (migração 094), sempre por função:
--   • lê:    o dono ATUAL do lead, o admin e o gestor (este só em lead do funil
--            aberto de corretor ativo, como na 095);
--   • grava: o dono atual do lead ou o admin. O gestor não grava.
--   • Transferiu o lead? Os fluxos vão junto, e quem transferiu perde o acesso.
-- A tabela não tem política de acesso direto e sai da API: ninguém lê nem grava
-- nela por fora das funções. Todas as funções testam "sem login" de forma
-- explícita e não são executáveis por quem não está logado.
--
-- "Marcar como enviado" grava uma nota no histórico do lead — é o único momento
-- em que o fluxo aparece na linha do tempo, para não enchê-la de rascunho.

-- ── Tabela ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_fluxos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  fluxo_id      uuid NOT NULL,
  versao        int  NOT NULL CHECK (versao >= 1),
  nome          text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 80),
  modo          text NOT NULL CHECK (modo IN ('pos_chaves', 'direto', 'associativo')),
  dados         jsonb NOT NULL,
  resumo        jsonb NOT NULL DEFAULT '{}'::jsonb,
  mensagem      text,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  enviado_em    timestamptz,
  enviado_por   uuid REFERENCES public.profiles(id),
  arquivado_em  timestamptz,
  arquivado_por uuid REFERENCES public.profiles(id),
  UNIQUE (fluxo_id, versao)
);

CREATE INDEX IF NOT EXISTS lead_fluxos_lead_idx ON public.lead_fluxos (lead_id, created_at DESC);

COMMENT ON TABLE public.lead_fluxos IS
  'Simulações de fluxo de pagamento guardadas por lead. Uma linha por versão; acesso só pelas funções lead_fluxo* (migração 096).';

ALTER TABLE public.lead_fluxos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_fluxos FROM PUBLIC, anon, authenticated;

-- ── Interna: uma versão no formato que a tela lê ────────────────────────────
CREATE OR REPLACE FUNCTION public.lead_fluxo_json(f public.lead_fluxos)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', f.id, 'leadId', f.lead_id, 'fluxoId', f.fluxo_id, 'versao', f.versao,
    'nome', f.nome, 'modo', f.modo, 'dados', f.dados, 'resumo', f.resumo, 'mensagem', f.mensagem,
    'criadoPor', (SELECT p.name FROM profiles p WHERE p.id = f.created_by),
    'criadoEm', f.created_at,
    'enviadoEm', f.enviado_em,
    'enviadoPor', (SELECT p.name FROM profiles p WHERE p.id = f.enviado_por));
$function$;

REVOKE ALL ON FUNCTION public.lead_fluxo_json(public.lead_fluxos) FROM PUBLIC, anon, authenticated;

-- ── Interna: quem pode gravar fluxo neste lead ──────────────────────────────
-- Dono atual ou admin. Lead inexistente e lead de outro respondem igual.
CREATE OR REPLACE FUNCTION public.lead_fluxo_exige_dono(p_lead_id text)
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
  IF NOT EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = p_lead_id AND (coalesce(l.broker_id = auth.uid(), false) OR is_admin())
  ) THEN
    RAISE EXCEPTION 'Lead não encontrado ou sem permissão para mexer nos fluxos dele';
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public.lead_fluxo_exige_dono(text) FROM PUBLIC, anon, authenticated;

-- ── Ler: todas as versões dos fluxos (não arquivados) de um lead ────────────
CREATE OR REPLACE FUNCTION public.lead_fluxos_list(p_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = p_lead_id
      AND (
        coalesce(l.broker_id = auth.uid(), false)
        OR is_admin()
        -- gestor: os mesmos limites do quadro e da ficha de leitura (091, 095)
        OR (is_manager()
            AND l.discard_reason IS NULL AND l.closed_at IS NULL
            AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = l.broker_id AND p.active AND p.role = 'broker'))
      )
  ) THEN
    RAISE EXCEPTION 'Lead não encontrado ou sem permissão para ver os fluxos dele';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(lead_fluxo_json(f) ORDER BY f.created_at DESC, f.versao DESC)
    FROM lead_fluxos f
    WHERE f.lead_id = p_lead_id AND f.arquivado_em IS NULL), '[]'::jsonb);
END $function$;

REVOKE ALL ON FUNCTION public.lead_fluxos_list(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_fluxos_list(text) TO authenticated;

-- ── Salvar: fluxo novo (p_fluxo_id nulo) ou a próxima versão de um existente ─
CREATE OR REPLACE FUNCTION public.lead_fluxo_save(
  p_lead_id text, p_fluxo_id uuid, p_nome text, p_modo text,
  p_dados jsonb, p_resumo jsonb, p_mensagem text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fluxo  uuid := p_fluxo_id;
  v_versao int  := 1;
  v_modo   text;
  v_linha  lead_fluxos%ROWTYPE;
BEGIN
  PERFORM lead_fluxo_exige_dono(p_lead_id);

  IF p_nome IS NULL OR char_length(btrim(p_nome)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Dê um nome ao fluxo (até 80 caracteres)';
  END IF;
  IF p_modo IS NULL OR p_modo NOT IN ('pos_chaves', 'direto', 'associativo') THEN
    RAISE EXCEPTION 'Tipo de simulação inválido';
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object'
     OR jsonb_typeof(p_dados -> 'shared') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_dados -> 'estado') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Os dados do fluxo vieram incompletos — nada foi salvo';
  END IF;
  IF length(p_dados::text) > 60000 OR length(coalesce(p_resumo, '{}'::jsonb)::text) > 4000
     OR length(coalesce(p_mensagem, '')) > 20000 THEN
    RAISE EXCEPTION 'O fluxo ficou grande demais para salvar';
  END IF;

  IF v_fluxo IS NULL THEN
    v_fluxo := gen_random_uuid();
  ELSE
    -- Trava as versões deste fluxo: dois salvamentos ao mesmo tempo não disputam o número.
    PERFORM 1 FROM lead_fluxos WHERE fluxo_id = v_fluxo FOR UPDATE;
    SELECT max(versao) + 1, max(modo) INTO v_versao, v_modo
    FROM lead_fluxos
    WHERE fluxo_id = v_fluxo AND lead_id = p_lead_id AND arquivado_em IS NULL;
    IF v_versao IS NULL THEN
      RAISE EXCEPTION 'Este fluxo não existe mais neste lead — salve como um fluxo novo';
    END IF;
    IF v_modo <> p_modo THEN
      RAISE EXCEPTION 'Um fluxo não muda de tipo de simulação — crie um fluxo novo';
    END IF;
  END IF;

  INSERT INTO lead_fluxos (lead_id, fluxo_id, versao, nome, modo, dados, resumo, mensagem, created_by)
  VALUES (p_lead_id, v_fluxo, v_versao, btrim(p_nome), p_modo, p_dados,
          coalesce(p_resumo, '{}'::jsonb), nullif(p_mensagem, ''), auth.uid())
  RETURNING * INTO v_linha;

  RETURN lead_fluxo_json(v_linha);
END $function$;

REVOKE ALL ON FUNCTION public.lead_fluxo_save(text, uuid, text, text, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_fluxo_save(text, uuid, text, text, jsonb, jsonb, text) TO authenticated;

-- ── Marcar uma versão como enviada ao cliente ───────────────────────────────
-- Grava a nota no histórico do lead. Marcar de novo não duplica a nota.
CREATE OR REPLACE FUNCTION public.lead_fluxo_mark_sent(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linha lead_fluxos%ROWTYPE;
  v_now   timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;

  SELECT * INTO v_linha FROM lead_fluxos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado ou sem permissão para mexer nos fluxos dele';
  END IF;
  PERFORM lead_fluxo_exige_dono(v_linha.lead_id);

  IF v_linha.arquivado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este fluxo foi arquivado';
  END IF;
  IF v_linha.enviado_em IS NOT NULL THEN
    RETURN lead_fluxo_json(v_linha);
  END IF;

  UPDATE lead_fluxos SET enviado_em = v_now, enviado_por = auth.uid()
  WHERE id = p_id
  RETURNING * INTO v_linha;

  INSERT INTO lead_interactions (id, lead_id, type, description, interacted_at, created_at, broker_id)
  VALUES (
    gen_random_uuid()::text, v_linha.lead_id, 'nota',
    format('Fluxo enviado ao cliente: %s · %s · versão %s%s',
      v_linha.nome,
      CASE v_linha.modo WHEN 'pos_chaves' THEN 'Pós-chaves'
                        WHEN 'direto'     THEN 'Direto com a construtora'
                        ELSE 'Associativo' END,
      v_linha.versao,
      coalesce(E'\n' || nullif(left(v_linha.resumo ->> 'linha', 300), ''), '')),
    v_now, v_now, auth.uid());

  RETURN lead_fluxo_json(v_linha);
END $function$;

REVOKE ALL ON FUNCTION public.lead_fluxo_mark_sent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_fluxo_mark_sent(uuid) TO authenticated;

-- ── Arquivar um fluxo (todas as versões) ────────────────────────────────────
-- Não apaga: some da lista e continua no banco, com quem arquivou e quando.
CREATE OR REPLACE FUNCTION public.lead_fluxo_archive(p_fluxo_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead text;
  v_n    int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;

  SELECT lead_id INTO v_lead FROM lead_fluxos WHERE fluxo_id = p_fluxo_id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado ou sem permissão para mexer nos fluxos dele';
  END IF;
  PERFORM lead_fluxo_exige_dono(v_lead);

  UPDATE lead_fluxos SET arquivado_em = now(), arquivado_por = auth.uid()
  WHERE fluxo_id = p_fluxo_id AND arquivado_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

REVOKE ALL ON FUNCTION public.lead_fluxo_archive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_fluxo_archive(uuid) TO authenticated;
