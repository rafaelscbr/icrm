-- 094 · O histórico acompanha o lead (para a transferência entre corretores)
--
-- O corretor já pode transferir um lead seu para um colega: a função
-- transfer_lead (migração 035) aceita o dono do lead ou o admin. Na prática
-- ninguém usava — as 92 transferências manuais registradas são todas do admin —
-- e o ensaio mostrou por quê não serviria: quem RECEBE o lead não vê nada do
-- que aconteceu antes.
--
-- Motivo: a regra de acesso de lead_interactions é "cada um vê o que ele mesmo
-- registrou" (broker_id = auth.uid()). Ela existe para as métricas — o que cada
-- corretor produziu — e está certa para isso. Mas é a mesma tabela que alimenta
-- o histórico na ficha do lead, então o Ryan, ao receber um lead do Dionata,
-- abria a ficha com o histórico vazio: sem as conversas do Dionata, sem as
-- notas automáticas do sistema e sem a própria nota "Transferido por…".
-- (Hoje 122 leads em aberto já estão assim, por causa das transferências feitas
-- pelo admin e do rodízio por prazo.)
--
-- O que muda, e só isso:
--   • Nova função de LEITURA, lead_timeline(lead): devolve o histórico inteiro
--     de um lead para quem é o DONO ATUAL dele (ou admin). A ficha do lead
--     passa a ler por ela.
--
-- O que NÃO muda:
--   • A regra de acesso de lead_interactions fica como está. As métricas
--     (Metas, Corretores, Pulse, dashboard) continuam contando, para cada
--     corretor, só o que ele registrou — receber um lead não "herda" produção.
--   • Ninguém ganha permissão de escrita. Editar ou apagar um registro continua
--     só para quem o criou (ou admin).
--   • Quem transferiu o lead deixa de ser dono e perde o acesso ao histórico
--     pela função; continua vendo, nas métricas dele, o que ele mesmo registrou.
--   • transfer_lead não é alterada.
--
-- Mesmo caminho da migração 091 (gestor): ampliar leitura por função própria,
-- sem afrouxar a regra da tabela.

CREATE OR REPLACE FUNCTION public.lead_timeline(p_lead_id text)
RETURNS SETOF public.lead_interactions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou — entre de novo';
  END IF;

  -- Só o dono atual do lead, ou o admin. Lead inexistente e lead de outro
  -- corretor respondem igual, para a função não revelar que o lead existe.
  IF NOT EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = p_lead_id AND (l.broker_id = auth.uid() OR is_admin())
  ) THEN
    RAISE EXCEPTION 'Lead não encontrado ou sem permissão para ver o histórico';
  END IF;

  RETURN QUERY
  SELECT li.*
  FROM lead_interactions li
  WHERE li.lead_id = p_lead_id
  ORDER BY li.interacted_at DESC, li.id DESC;
END $function$;

REVOKE ALL ON FUNCTION public.lead_timeline(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_timeline(text) TO authenticated;
