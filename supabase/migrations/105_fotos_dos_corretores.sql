-- 105 · Fotos oficiais dos corretores (22/11/2026, enviadas pelo Rafael)
-- As imagens moram no próprio app (public/corretores/, 256×256). O Kanban
-- mostra a foto redonda do responsável em cada cartão.
UPDATE public.profiles SET avatar_url = '/corretores/dionata.jpg', updated_at = now() WHERE name = 'Dionata Alves' AND role = 'broker';
UPDATE public.profiles SET avatar_url = '/corretores/ryan.jpg',    updated_at = now() WHERE name = 'Ryan Maciel'   AND role = 'broker';
