-- Adiciona valor default ao campo id de contacts para evitar erro de NOT NULL
-- quando o frontend não envia o id (comportamento padrão igual ao lead_list_members)
ALTER TABLE public.contacts
ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
