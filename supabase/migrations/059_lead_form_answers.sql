-- 059: respostas do formulário Meta em coluna estruturada
--
-- Até aqui as perguntas personalizadas do formulário só existiam como texto
-- livre dentro de `leads.notes` ("• renda familiar: r$ 5.000 - r$ 10.000").
-- Serve para ler, não serve para decidir: qualquer regra teria que fazer
-- LIKE em texto, e mudar o rótulo da pergunta na Meta quebraria tudo.
--
-- `form_answers` guarda o mesmo conteúdo como objeto { pergunta: [respostas] },
-- com a chave normalizada (minúscula, sem underscore). É sobre isso que as
-- regras de qualificação vão casar.
--
-- `notes` continua sendo preenchido como antes — nada na UI muda por causa
-- desta migração. Ela só cria a base.

alter table public.leads
  add column if not exists form_answers jsonb;

create index if not exists idx_leads_form_answers
  on public.leads using gin (form_answers)
  where form_answers is not null;

-- ── Backfill a partir dos eventos já recebidos ───────────────────────────────
-- Reconstrói as respostas dos leads que vieram da Meta, casando pelo telefone
-- normalizado. Só preenche quem ainda está nulo.
with parsed as (
  select
    normalize_phone_br(coalesce(
      (select f->'values'->>0 from jsonb_array_elements(e.lead_payload->'field_data') f
        where f->>'name' in ('phone_number','phone','whatsapp_number') limit 1), '')) as phone_norm,
    jsonb_object_agg(
      lower(replace(f.value->>'name', '_', ' ')),
      (select jsonb_agg(replace(v, '_', ' ')) from jsonb_array_elements_text(f.value->'values') v)
    ) as answers
  from public.meta_webhook_events e
  cross join lateral jsonb_array_elements(coalesce(e.lead_payload->'field_data', '[]'::jsonb)) f
  where f.value->>'name' not in
        ('full_name','first_name','last_name','phone_number','phone','whatsapp_number','email')
  group by 1
)
update public.leads l
set form_answers = p.answers
from parsed p
where p.phone_norm <> ''
  and normalize_phone_br(l.phone) = p.phone_norm
  and l.form_answers is null
  and p.answers is not null;
