-- 051: Miniatura leve para a listagem de imóveis
--
-- Contexto: properties.images guarda fotos em base64 (~142 kB por imóvel em
-- média) e a listagem baixava select * — ~4,4 MB por abertura do app, segundo
-- maior consumidor de egress. A listagem passa a baixar apenas `thumbnail`
-- (JPEG ~480px, ~15-25 kB) e as fotos completas são carregadas sob demanda
-- no detalhe/edição do imóvel.

alter table public.properties add column if not exists thumbnail text;
