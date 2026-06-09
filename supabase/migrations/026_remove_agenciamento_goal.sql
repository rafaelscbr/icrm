-- ─── Migration 026: Remove metas de agenciamento ─────────────────────────────
-- Agenciamento foi removido como categoria de meta.
-- Exclui todas as metas existentes (global + por corretor) com category='agenciamento'.

DELETE FROM public.goals WHERE category = 'agenciamento';
