-- ─── Migration 030: Hardening das funções Meta Ads ────────────────────────────
-- As funções SECURITY DEFINER da integração estavam executáveis por anon e
-- authenticated via PostgREST RPC (grant default do Postgres a PUBLIC).
-- Somente a Edge Function (service_role) e o pg_cron (postgres) precisam delas.
-- Verificado: triggers disparam independente do EXECUTE do papel que insere,
-- então trg_first_contact continua funcionando para corretores autenticados.

REVOKE EXECUTE ON FUNCTION public.process_meta_lead(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recapture_overdue_leads()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_first_contact()     FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_meta_lead(uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION public.recapture_overdue_leads() TO service_role;

-- search_path fixo na função usada em índice funcional (advisor 0011)
ALTER FUNCTION public.normalize_phone_br(text) SET search_path = public;
