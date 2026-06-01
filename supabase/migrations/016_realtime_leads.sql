-- Habilita realtime na tabela leads para sincronização
-- instantânea entre corretores sem recarregar a página.
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
