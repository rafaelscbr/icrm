-- 062: recupera form_answers dos leads que ficaram para trás
--
-- A migração 061 fechou a torneira: lead novo já entra com as respostas
-- estruturadas. Falta o que entrou entre a estreia dos formulários novos
-- (01/08) e aquela correção — 21 leads cujas respostas existem só como texto
-- em `notes`, mesmo com o payload íntegro guardado em meta_webhook_events.
--
-- ── O que este backfill NÃO faz ─────────────────────────────────────────────
--
-- Não encosta em lead que já tem form_answers. São 477, preenchidos pelo
-- backfill da 059, e 14 deles DIVERGEM do payload do evento que os criou.
-- A divergência não é erro de leitura: a 059 agrupava as respostas por
-- TELEFONE, então quem preencheu vários formulários teve as respostas de todos
-- fundidas num objeto só — mais informação, porém sem saber o que veio de qual
-- formulário nem quando.
--
-- Trocar isso pela resposta de um formulário só seria perder dado. Manter como
-- está é conviver com dado sem origem. Nenhuma das duas é boa, e a saída certa
-- é a fase seguinte: um registro por preenchimento, com data e formulário.
-- Até lá, a regra é a mais conservadora — não destrói nada. Os 14 ficam
-- marcados no log para serem tratados lá.
--
-- Também não há o que recuperar para 326 leads sem evento: 217 vieram do
-- Felicita, 102 são do Meta anteriores ao webhook, e nenhum deles tem
-- "Respostas do formulário" em `notes`. Não existe fonte — inventar resposta
-- para preencher lacuna seria pior que a lacuna.

-- ── Log do backfill: torna a operação auditável e reversível ────────────────
create table if not exists public.form_answers_backfill (
  id         bigserial primary key,
  run_id     uuid        not null,
  lead_id    text        not null,
  event_id   uuid,
  answers_before jsonb,
  answers_after  jsonb,
  action     text        not null,
  created_at timestamptz not null default now(),
  constraint form_answers_backfill_action_check
    check (action = any (array['filled','divergent','skipped_has_data']))
);

create index if not exists idx_form_answers_backfill_run
  on public.form_answers_backfill (run_id, action);

alter table public.form_answers_backfill enable row level security;

drop policy if exists form_answers_backfill_select on public.form_answers_backfill;
create policy form_answers_backfill_select on public.form_answers_backfill
  for select using (is_admin());


-- ── Execução ────────────────────────────────────────────────────────────────
do $$
declare
  v_run   uuid := gen_random_uuid();
  v_fill  int;
  v_div   int;
begin

  -- Respostas do evento que CRIOU cada lead. Um lead pode ter vários eventos
  -- (reentrada); vale o mais antigo — é o que originou o cadastro.
  create temp table _fonte on commit drop as
  select distinct on (e.lead_id)
         e.lead_id,
         e.id as event_id,
         (select jsonb_object_agg(x.chave, x.valores)
            from (
              select lower(replace(f->>'name','_',' ')) as chave,
                     (select jsonb_agg(replace(v,'_',' '))
                        from jsonb_array_elements_text(f->'values') v) as valores,
                     row_number() over (
                       partition by lower(replace(f->>'name','_',' ')) order by ord
                     ) as rn
              from jsonb_array_elements(coalesce(e.lead_payload->'field_data','[]'::jsonb))
                   with ordinality as t(f, ord)
              where f->>'name' not in
                    ('full_name','first_name','last_name','phone_number','phone','whatsapp_number','email')
            ) x
           where x.rn = 1) as respostas
  from meta_webhook_events e
  where e.lead_id is not null
    and e.status = 'processed'
    and e.lead_payload is not null
  order by e.lead_id, e.received_at asc;

  -- 1. Preenche só quem está vazio. `form_answers is null` no WHERE é o que
  --    torna a migração idempotente: rodar de novo não reescreve nada.
  with alvo as (
    select l.id, f.event_id, f.respostas
    from leads l
    join _fonte f on f.lead_id = l.id
    where l.form_answers is null
      and f.respostas is not null
  ), aplicado as (
    update leads l
    set form_answers = a.respostas, updated_at = now()
    from alvo a
    where l.id = a.id
    returning l.id, a.event_id, a.respostas
  )
  insert into public.form_answers_backfill (run_id, lead_id, event_id, answers_before, answers_after, action)
  select v_run, id, event_id, null, respostas, 'filled' from aplicado;

  get diagnostics v_fill = row_count;

  -- 2. Registra os divergentes SEM tocar neles — insumo da próxima fase.
  insert into public.form_answers_backfill (run_id, lead_id, event_id, answers_before, answers_after, action)
  select v_run, l.id, f.event_id, l.form_answers, f.respostas, 'divergent'
  from leads l
  join _fonte f on f.lead_id = l.id
  where l.form_answers is not null
    and f.respostas is not null
    and l.form_answers <> f.respostas;

  get diagnostics v_div = row_count;

  raise notice 'backfill %: % preenchidos, % divergentes registrados', v_run, v_fill, v_div;
end $$;


-- ── Como reverter ───────────────────────────────────────────────────────────
-- Devolve ao estado anterior apenas o que ESTE backfill preencheu:
--
--   update public.leads l
--   set form_answers = b.answers_before, updated_at = now()
--   from public.form_answers_backfill b
--   where b.lead_id = l.id
--     and b.action = 'filled'
--     and b.run_id = '<run_id>';
