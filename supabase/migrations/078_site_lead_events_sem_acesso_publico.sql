-- 078: site_lead_events é só da Edge Function (service role). O RLS sem política
-- já barrava leitura; aqui tiramos também os privilégios de tabela de anon/authenticated.
revoke all on table public.site_lead_events from anon, authenticated;
