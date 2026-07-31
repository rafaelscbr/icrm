-- 053: sales e tasks entram na publication de realtime
--
-- Motivação dupla:
--
-- 1. iCRM Pulse — venda lançada direto pela tela de Vendas (sem lead) e visita
--    agendada não geravam evento nenhum. Duas das métricas centrais do painel
--    ("vendas hoje" e "visitas marcadas") ficariam parcialmente cegas.
--
-- 2. Correção de um gap pré-existente — App.tsx já chama subscribeSales() e
--    subscribeTasks() desde a migração multiusuário, mas as tabelas nunca
--    entraram na publication. Os canais subiam e nunca recebiam nada. A partir
--    daqui tarefa criada por um corretor aparece na tela do outro na hora.
--
-- Custo em realtime: ~50 mudanças de tarefa/dia × nº de clientes conectados.
-- Ordem de 8 mil mensagens/mês contra um teto de 2 milhões no plano free.
--
-- Sem REPLICA IDENTITY FULL de propósito: o payload de UPDATE/DELETE traz só a
-- PK, que é o que os stores usam. FULL dobraria o tamanho de cada mensagem.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table public.sales;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
