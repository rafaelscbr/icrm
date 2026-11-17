-- 092 · O admin é avisado de todo lead novo
--
-- Até aqui o aviso de lead novo ia só para o corretor que recebeu o lead. O
-- admin que não está nas roletas (desde 16/11/2026) deixou de saber quando
-- entra lead. Agora, toda vez que um lead novo é gravado — Meta Ads, site,
-- cadastro manual, ligação ativa ou transferência de campanha — cada admin
-- ativo recebe um aviso (sino, som e push):
--
--   "Lead novo: Fulano de Tal"
--   "Greenview · Meta Ads · com Dionata"
--
-- É um gatilho na tabela `leads`, e não um trecho dentro de cada função de
-- entrada: assim nenhum caminho de entrada, atual ou futuro, fica de fora.
--
-- Quem NÃO recebe:
--   • o admin que é o dono do lead — ele já recebe o aviso de corretor;
--   • o admin que acabou de cadastrar o lead — ele sabe que cadastrou.
--
-- O que não é "lead novo": a pessoa que já está no funil e preenche o
-- formulário de novo. Isso não cria lead; o dono é avisado como reentrada.
--
-- Segurança de operação: se o aviso falhar por qualquer motivo, o lead ENTRA
-- do mesmo jeito. Aviso nunca pode derrubar a entrada de um lead.

CREATE OR REPLACE FUNCTION public.notify_admins_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_corretor text;
  v_origem   text;
BEGIN
  SELECT name INTO v_corretor FROM profiles WHERE id = NEW.broker_id;

  v_origem := CASE NEW.origin
    WHEN 'meta_ads'           THEN 'Meta Ads'
    WHEN 'site'               THEN 'Site'
    WHEN 'prospeccao_ligacao' THEN 'Ligação ativa'
    WHEN 'campanha'           THEN 'Campanha'
    WHEN 'indicacao'          THEN 'Indicação'
    WHEN 'portal'             THEN 'Portal'
    WHEN 'offline'            THEN 'Offline'
    WHEN 'felicita'           THEN 'Felicità'
    ELSE NEW.origin
  END;

  INSERT INTO notifications
    (user_id, type, title, body, resource_id, resource_type, read)
  SELECT p.id, 'lead_new_admin',
         'Lead novo: ' || COALESCE(NULLIF(trim(NEW.name), ''), 'sem nome'),
         concat_ws(' · ',
           NULLIF(trim(COALESCE(NEW.property_name, '')), ''),
           v_origem,
           CASE WHEN v_corretor IS NOT NULL THEN 'com ' || split_part(v_corretor, ' ', 1) ELSE 'sem corretor' END),
         NEW.id, 'lead', false
  FROM profiles p
  WHERE p.role = 'admin' AND p.active
    AND p.id IS DISTINCT FROM NEW.broker_id
    AND p.id IS DISTINCT FROM auth.uid();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_admins_new_lead: aviso não gerado para o lead % (%)', NEW.id, SQLERRM;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.notify_admins_new_lead() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_admins_new_lead ON public.leads;
CREATE TRIGGER trg_notify_admins_new_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_lead();
