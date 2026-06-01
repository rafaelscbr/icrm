-- Habilita realtime na tabela campaign_leads para sincronização
-- entre admin e corretores sem precisar recarregar a página.
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_leads;
