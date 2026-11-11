-- 082 · GreenView: a confirmação de renda mínima não pode ocupar o campo renda
--
-- O formulário "GreenView + Perguntas" tem duas perguntas com "renda bruta":
--   • "qual é a renda bruta familiar (...) aproximada?"          → a renda (faixa)
--   • "você confirma está ciente, que precisa pelo menos
--      r$ 15.000 de renda bruta familiar (...)?"               → Sim/Não
-- As duas caíam em `%renda bruta%` → campo renda. Mesmo formulário, mesmo
-- instante: o "Sim" ganhava o desempate e a ficha mostrava renda "Sim / ainda
-- planejando" (e o encaixe virava Difícil). A faixa real sumia.
--
-- 1. Mapeamento: "ciente ... renda" é capacidade (igual ao "Rogga - Renda").
-- 2. Desempate defensivo: quando duas respostas do mesmo formulário caem no
--    mesmo campo, vence a que tem faixa em reais (min/max), depois a que não é
--    "ainda planejando". Vale para lead_profile_base (ficha) e lead_declared
--    (encaixe/temperatura).
--
-- Leads anteriores: o perfil é calculado na leitura a partir de
-- meta_webhook_events / leads.form_answers — corrigem sozinhos, sem backfill.

insert into public.lead_field_map (question_like, field, priority, active, note)
select '%ciente%renda%', 'capacidade', 10, true, 'GreenView: confirma renda mínima de R$ 15.000'
where not exists (select 1 from public.lead_field_map where question_like = '%ciente%renda%');

-- ── Ficha: lead_profile_base ────────────────────────────────────────────────
create or replace function public.lead_profile_base(p_lead_id text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_lead   leads%ROWTYPE;
  v_norm   text;
  v_forms  jsonb;
  v_perfil jsonb;
  v_listas jsonb;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then return null; end if;

  v_norm := normalize_phone_br(v_lead.phone);

  select jsonb_agg(f order by f->>'at' desc) into v_forms
  from (
    select jsonb_build_object(
      'eventId',  e.id,
      'formId',   e.form_id,
      'formName', coalesce(e.lead_payload->>'form_name', r.form_name, 'Formulário'),
      'product',  r.product_name,
      'at',       e.received_at,
      'answers',  (
        select jsonb_agg(jsonb_build_object(
                 'question', a.q,
                 'field',    lead_field_of(a.q),
                 'raw',      a.v,
                 'norm',     normalize_answer(lead_field_of(a.q), a.v))
               order by a.ord)
        from (
          select lower(replace(fd->>'name','_',' ')) as q,
                 (select string_agg(replace(x,'_',' '), ', ')
                    from jsonb_array_elements_text(fd->'values') x) as v,
                 ord
          from jsonb_array_elements(coalesce(e.lead_payload->'field_data','[]'::jsonb))
               with ordinality as t(fd, ord)
          where fd->>'name' not in
                ('full_name','first_name','last_name','phone_number','phone','whatsapp_number','email')
        ) a
      )
    ) as f
    from meta_webhook_events e
    left join meta_form_routing r on r.form_id = e.form_id
    where e.lead_payload is not null
      and (e.lead_id = p_lead_id
           or (v_norm <> '' and normalize_phone_br(coalesce(
                (select fd->'values'->>0 from jsonb_array_elements(e.lead_payload->'field_data') fd
                  where fd->>'name' in ('whatsapp_number','phone_number','phone') limit 1), '')) = v_norm))
  ) s;

  -- Por campo, vale a resposta mais recente — campo a campo, não o último
  -- formulário inteiro. Empate no mesmo formulário: vence a resposta com faixa
  -- em reais, depois a que não é "ainda planejando".
  select jsonb_object_agg(campo, dado) into v_perfil
  from (
    select distinct on (campo) campo, dado
    from (
      select ans->>'field' as campo,
             jsonb_build_object(
               'value',    ans->'norm'->>'value',
               'label',    ans->'norm'->>'label',
               'min',      (ans->'norm'->>'min')::numeric,
               'max',      (ans->'norm'->>'max')::numeric,
               'rank',     (ans->'norm'->>'rank')::int,
               'unplanned',coalesce((ans->'norm'->>'unplanned')::boolean, false),
               'question', ans->>'question',
               'formName', f->>'formName',
               'at',       f->>'at'
             ) as dado,
             (f->>'at')::timestamptz as quando,
             (ans->'norm' ? 'min' or ans->'norm' ? 'max') as tem_faixa,
             coalesce((ans->'norm'->>'unplanned')::boolean, false) as sem_plano
      from jsonb_array_elements(coalesce(v_forms,'[]'::jsonb)) f
      cross join lateral jsonb_array_elements(coalesce(f->'answers','[]'::jsonb)) ans
      where ans->>'field' is not null
        and ans->'norm' is not null
        and ans->>'field' <> 'consentimento'
    ) x
    order by campo, quando desc, tem_faixa desc, sem_plano asc
  ) y;

  -- Lead anterior ao webhook: sem evento, mas com form_answers gravado.
  if v_perfil is null and v_lead.form_answers is not null then
    select jsonb_object_agg(campo, dado) into v_perfil
    from (
      select distinct on (campo) campo, dado from (
        select lead_field_of(k.q) as campo,
               jsonb_build_object(
                 'value', n->>'value',
                 'label', n->>'label',
                 'min',  (n->>'min')::numeric,
                 'max',  (n->>'max')::numeric,
                 'rank', (n->>'rank')::int,
                 'unplanned', coalesce((n->>'unplanned')::boolean,false),
                 'question', k.q, 'formName', null, 'at', v_lead.created_at
               ) as dado,
               (n ? 'min' or n ? 'max') as tem_faixa,
               coalesce((n->>'unplanned')::boolean, false) as sem_plano
        from (
          select key as q,
                 case when jsonb_typeof(value)='array'
                      then (select string_agg(x, ', ') from jsonb_array_elements_text(value) x)
                      else value #>> '{}' end as v
          from jsonb_each(v_lead.form_answers)
        ) k
        cross join lateral (select normalize_answer(lead_field_of(k.q), k.v) as n) nn
        where lead_field_of(k.q) is not null and lead_field_of(k.q) <> 'consentimento'
          and n is not null
      ) z order by campo, tem_faixa desc, sem_plano asc
    ) w;
  end if;

  if v_norm <> '' then
    select jsonb_agg(jsonb_build_object(
             'listId', ll.id, 'name', ll.name,
             'profile', ll.product_profile, 'at', m.imported_at)
           order by m.imported_at desc)
    into v_listas
    from lead_list_members m
    join contacts c  on c.id = m.contact_id
    join lead_lists ll on ll.id = m.list_id
    where normalize_phone_br(c.phone) = v_norm;
  end if;

  return jsonb_build_object(
    'leadId',    p_lead_id,
    'phone',     v_lead.phone,
    'profile',   coalesce(v_perfil, '{}'::jsonb),
    'forms',     coalesce(v_forms,  '[]'::jsonb),
    'lists',     coalesce(v_listas, '[]'::jsonb),
    'missing',   '{}'::text[],
    'formCount', jsonb_array_length(coalesce(v_forms,'[]'::jsonb)),
    'isKnown',   coalesce(jsonb_array_length(v_listas), 0) > 0
  );
end $function$;

-- ── Encaixe/temperatura: view lead_declared ─────────────────────────────────
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
         select distinct on (f.field) f.field, f.norm
         from (
           select lead_field_of(k.key) as field,
                  normalize_answer(lead_field_of(k.key),
                    case when jsonb_typeof(k.value) = 'array'
                         then (select string_agg(y.value, ', ') from jsonb_array_elements_text(k.value) y(value))
                         else (k.value #>> '{}')
                    end) as norm,
                  k.key as pergunta
           from jsonb_each(coalesce(l.form_answers, '{}'::jsonb)) k(key, value)
         ) f
         where f.field is not null and f.field <> 'consentimento' and f.norm is not null
         order by f.field,
                  (f.norm ? 'min' or f.norm ? 'max') desc,
                  coalesce((f.norm->>'unplanned')::boolean, false) asc,
                  f.pergunta
       ) x
     ) d on true
  where l.form_answers is not null or l.profile_override is not null;
