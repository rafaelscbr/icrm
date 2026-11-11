-- 083 · Encaixe usa a resposta mais recente, como a ficha
--
-- Antes: lead_declared (base do encaixe, da temperatura e do matching reverso)
-- lia só leads.form_answers — um mapa {pergunta: respostas} SEM data. Dois
-- problemas:
--   1. Reentrada não atualiza form_answers (process_meta_lead só grava quando
--      está vazio). Quem preencheu San Pelegrino em setembro e GreenView em
--      novembro ficava com o encaixe do San Pelegrino.
--   2. Mesmo quando duas perguntas do mesmo campo coexistiam, o desempate era
--      alfabético pela pergunta, não por data.
-- Já a ficha (lead_profile_base) lê os eventos do Meta, que têm data, e pega a
-- mais recente por campo. Ficha e encaixe discordavam.
--
-- Agora lead_declared usa a mesma fonte e a mesma regra da ficha:
--   • eventos do Meta do próprio lead (inclui reentradas) e do mesmo telefone;
--   • por campo, vence a resposta mais recente; empate no mesmo formulário →
--     a que tem faixa em reais, depois a que não é "ainda planejando";
--   • leads.form_answers entra como reserva só para lead sem evento próprio
--     (lead do site, lead anterior ao webhook), sempre atrás de evento;
--   • profile_override (apurado pelo corretor) continua por cima de tudo.
--
-- Índices: lead_id e telefone normalizado do evento, porque leads_intelligence
-- avalia a view para a base inteira de uma vez.

create or replace function public.meta_event_phone(p_payload jsonb)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select nullif(normalize_phone_br(coalesce(
    (select fd->'values'->>0
       from jsonb_array_elements(coalesce(p_payload->'field_data','[]'::jsonb)) fd
      where fd->>'name' in ('whatsapp_number','phone_number','phone')
      limit 1), '')), '');
$function$;

create index if not exists idx_meta_events_lead_id
  on public.meta_webhook_events (lead_id);
create index if not exists idx_meta_events_phone
  on public.meta_webhook_events (public.meta_event_phone(lead_payload));

create or replace view public.lead_declared as
 select l.id as lead_id,
    ((coalesce(d.profile, '{}'::jsonb) ||
        case
            when ((d.profile ? 'tipologia') and (not (coalesce(l.profile_override, '{}'::jsonb) ? 'tipologias')))
            then jsonb_build_object('tipologias', jsonb_build_object(
                   'values', jsonb_build_array(((d.profile -> 'tipologia') ->> 'value')),
                   'labels', jsonb_build_array(((d.profile -> 'tipologia') ->> 'label')),
                   'source', 'formulario'))
            else '{}'::jsonb
        end) || coalesce(l.profile_override, '{}'::jsonb)) as profile,
    d.profile as declared,
    l.profile_override as apurado
   from leads l
     left join lateral (
       select jsonb_object_agg(x.field, x.norm) as profile
       from (
         select distinct on (r.field) r.field, r.norm
         from (
           select c.field, normalize_answer(c.field, c.v) as norm, c.q as pergunta, c.quando, c.fonte
           from (
             -- Preenchimentos do Meta: do lead (inclui reentradas) e do mesmo telefone
             select a.q, a.v, ev.received_at as quando, 1 as fonte
             from (
               select e.id, e.received_at, e.lead_payload
                 from meta_webhook_events e
                where e.lead_id = l.id and e.lead_payload is not null
               union
               select e.id, e.received_at, e.lead_payload
                 from meta_webhook_events e
                where normalize_phone_br(l.phone) <> ''
                  and public.meta_event_phone(e.lead_payload) = normalize_phone_br(l.phone)
             ) ev
             cross join lateral (
               select lower(replace(fd->>'name','_',' ')) as q,
                      (select string_agg(replace(xv,'_',' '), ', ')
                         from jsonb_array_elements_text(fd->'values') xv) as v
               from jsonb_array_elements(coalesce(ev.lead_payload->'field_data','[]'::jsonb)) fd
               where fd->>'name' not in
                     ('full_name','first_name','last_name','phone_number','phone','whatsapp_number','email')
             ) a

             union all

             -- Reserva: form_answers, só para lead sem evento próprio
             -- (lead do site, lead anterior ao webhook)
             select k.key,
                    case when jsonb_typeof(k.value) = 'array'
                         then (select string_agg(y.value, ', ') from jsonb_array_elements_text(k.value) y(value))
                         else (k.value #>> '{}') end,
                    l.created_at, 2
             from jsonb_each(coalesce(l.form_answers, '{}'::jsonb)) k(key, value)
             where not exists (select 1 from meta_webhook_events e2 where e2.lead_id = l.id)
           ) b
           -- OFFSET 0 = barreira: o mapeamento e a normalização rodam uma vez por resposta
           cross join lateral (select b.q, b.v, b.quando, b.fonte, lead_field_of(b.q) as field offset 0) c
           where c.field is not null and c.field <> 'consentimento'
           offset 0
         ) r
         where r.norm is not null
         order by r.field,
                  r.fonte,
                  r.quando desc,
                  (r.norm ? 'min' or r.norm ? 'max') desc,
                  coalesce((r.norm->>'unplanned')::boolean, false) asc,
                  r.pergunta
       ) x
     ) d on true
  where d.profile is not null or l.form_answers is not null or l.profile_override is not null;
