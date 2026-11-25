-- 114 · Resultado do primeiro contato com o lead (25/11/2026)
--
-- Pedido do Rafael: quando o corretor chama o lead pela PRIMEIRA vez, um popup
-- pergunta o que aconteceu, para medir os leads (de X que entraram, quantos
-- atendem, em quantos deixamos texto ou áudio, quantos têm número que não
-- existe) e o desempenho do corretor. Combinado:
--   • só na 1ª chamada — grava uma vez e não muda mais;
--   • canal: ligação ou WhatsApp (mensagem);
--   • resultado: atendeu · não atendeu · deixei mensagem de texto · deixei
--     áudio · número não existe;
--   • só na LIGAÇÃO ATENDIDA: tem potencial · sem potencial · curioso;
--   • número não existe → a tela descarta como telefone_invalido;
--   • tem potencial → a tela oferece qualificar (set_lead_qualified, avisa o Meta).
--
-- Também: a ligação passa a contar como 1º contato (first_contact_at e fim do
-- relógio do SLA). Até aqui só o WhatsApp contava, e o corretor que ligava
-- continuava com o lead "sem contato".

-- ── Colunas ───────────────────────────────────────────────────────────────────
alter table public.leads
  add column if not exists first_contact_channel   text check (first_contact_channel in ('ligacao', 'whatsapp')),
  add column if not exists first_contact_result    text check (first_contact_result in
    ('atendeu', 'nao_atendeu', 'mensagem_texto', 'mensagem_audio', 'numero_invalido')),
  add column if not exists first_contact_potential text check (first_contact_potential in ('potencial', 'sem_potencial', 'curioso')),
  add column if not exists first_contact_result_at timestamptz,
  add column if not exists first_contact_result_by uuid references public.profiles(id) on delete set null;

-- ── A ligação também é 1º contato ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_first_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.type IN ('whatsapp', 'ligacao') THEN
    UPDATE public.leads
    SET first_contact_at = COALESCE(first_contact_at, NEW.interacted_at),
        sla_due_at       = NULL,
        updated_at       = now()
    WHERE id = NEW.lead_id
      AND first_contact_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_first_contact() FROM public, anon, authenticated;

-- ── Registrar o resultado ─────────────────────────────────────────────────────
-- Uma vez por lead: o dono do lead (ou o admin) grava; a segunda tentativa
-- falha com mensagem clara. Deixa a nota no histórico do lead.
CREATE OR REPLACE FUNCTION public.registrar_primeiro_contato(
  p_lead_id   text,
  p_canal     text,
  p_resultado text,
  p_potencial text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eu   uuid := auth.uid();
  v_lead leads%ROWTYPE;
  v_now  timestamptz := now();
  v_desc text;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'Entre no sistema para registrar o contato';
  END IF;
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;
  IF NOT (is_admin() OR v_lead.broker_id = v_eu) THEN
    RAISE EXCEPTION 'Só o corretor do lead registra o primeiro contato';
  END IF;
  IF v_lead.first_contact_result IS NOT NULL THEN
    RAISE EXCEPTION 'O primeiro contato deste lead já foi registrado';
  END IF;
  IF p_canal NOT IN ('ligacao', 'whatsapp') THEN
    RAISE EXCEPTION 'Canal inválido';
  END IF;
  IF p_resultado NOT IN ('atendeu', 'nao_atendeu', 'mensagem_texto', 'mensagem_audio', 'numero_invalido') THEN
    RAISE EXCEPTION 'Resultado inválido';
  END IF;
  IF p_canal = 'ligacao' AND p_resultado = 'atendeu' THEN
    IF p_potencial IS NULL OR p_potencial NOT IN ('potencial', 'sem_potencial', 'curioso') THEN
      RAISE EXCEPTION 'Diga se o lead tem potencial';
    END IF;
  ELSIF p_potencial IS NOT NULL THEN
    RAISE EXCEPTION 'O potencial só vale para ligação atendida';
  END IF;

  UPDATE leads
     SET first_contact_channel   = p_canal,
         first_contact_result    = p_resultado,
         first_contact_potential = p_potencial,
         first_contact_result_at = v_now,
         first_contact_result_by = v_eu,
         first_contact_at        = coalesce(first_contact_at, v_now),
         sla_due_at              = NULL,
         updated_at              = v_now
   WHERE id = p_lead_id;

  v_desc := '1º contato · ' ||
    CASE p_canal WHEN 'ligacao' THEN 'ligação' ELSE 'WhatsApp' END || ' · ' ||
    CASE p_resultado
      WHEN 'atendeu'         THEN 'atendeu'
      WHEN 'nao_atendeu'     THEN 'não atendeu'
      WHEN 'mensagem_texto'  THEN 'deixei mensagem de texto'
      WHEN 'mensagem_audio'  THEN 'deixei áudio'
      WHEN 'numero_invalido' THEN 'número não existe'
    END ||
    CASE p_potencial
      WHEN 'potencial'     THEN ' · tem potencial'
      WHEN 'sem_potencial' THEN ' · sem potencial'
      WHEN 'curioso'       THEN ' · curioso'
      ELSE ''
    END;
  INSERT INTO lead_interactions (id, lead_id, type, description, interacted_at, broker_id)
  VALUES (gen_random_uuid()::text, p_lead_id, 'nota', v_desc, v_now, v_eu);

  RETURN jsonb_build_object(
    'canal', p_canal, 'resultado', p_resultado, 'potencial', p_potencial,
    'em', v_now, 'por', v_eu
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_primeiro_contato(text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.registrar_primeiro_contato(text, text, text, text) TO authenticated;

-- ── Funil por safra com o 1º contato ──────────────────────────────────────────
-- Igual à 113, mais o bloco `contatos` com os mesmos índices de corretor e
-- produto do cubo (a tela recorta com os mesmos filtros).

CREATE OR REPLACE FUNCTION public.funil_por_safra(
  p_start  date DEFAULT NULL,
  p_end    date DEFAULT NULL,
  p_bucket text DEFAULT 'week'
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
with
  sc as (select is_admin() as admin, auth.uid() as eu),
  st(stage, ord) as (
    values ('lead',0),('followup',1),('atendimento',2),('visita',3),('proposta',4),('venda',5)
  ),

  -- Leads da safra
  rec as (
    select l.id, l.broker_id as owner, l.created_at, l.closed_at, l.discard_reason,
           (l.created_at at time zone 'America/Sao_Paulo')::date as cdate,
           cs.ord as cur_ord,
           nullif(btrim(coalesce(de.name, nullif(btrim(l.entry_property_name), ''),
                                 nullif(btrim(l.property_name), ''), pr.name)), '') as pnome,
           nullif(btrim(coalesce(ds.name, sp.name, nullif(btrim(l.property_name), ''), pr.name)), '') as fnome,
           l.first_contact_channel as canal, l.first_contact_result as resultado,
           l.first_contact_potential as potencial
    from leads l
    join st cs on cs.stage = l.funnel_stage
    left join properties   pr on pr.id = l.property_id
    left join developments de on de.id = l.entry_development_id
    left join sales        s  on s.id  = l.sale_id
    left join developments ds on ds.id = s.development_id
    left join properties   sp on sp.id = s.property_id
    cross join sc
    where (sc.admin or l.broker_id = sc.eu)
      and (p_start is null or (l.created_at at time zone 'America/Sao_Paulo')::date >= p_start)
      and (p_end   is null or (l.created_at at time zone 'America/Sao_Paulo')::date <= p_end)
  ),

  -- Mudanças de etapa só dos leads da safra
  ev as (
    select row_number() over () as k, li.lead_id, li.interacted_at as at, f.ord as from_ord, t.ord as to_ord
    from lead_interactions li
    join rec r on r.id = li.lead_id
    join st f on f.stage = li.from_stage
    join st t on t.stage = li.to_stage
    where li.type = 'stage_change'
  ),
  -- Avanço, descontado o que foi desfeito em até 30 min
  adv as (
    select e.lead_id, e.at, e.from_ord,
           least(e.to_ord, coalesce(min(u.to_ord), e.to_ord)) as to_ord
    from ev e
    left join ev u on u.lead_id = e.lead_id and u.at > e.at and u.at <= e.at + interval '30 minutes'
    where e.to_ord > e.from_ord
    group by e.k, e.lead_id, e.at, e.from_ord, e.to_ord
  ),
  cmax as (select lead_id, max(to_ord) as ord from adv group by lead_id),
  -- Etapa em que o lead nasceu: a origem da 1ª mudança gravada
  prim as (select distinct on (lead_id) lead_id, from_ord from ev order by lead_id, at),
  -- 1ª vez que cruzou Visita (para o tempo até a visita)
  vis as (select lead_id, min(at) as at from adv where from_ord < 3 and to_ord >= 3 group by lead_id),

  lead_final0 as (
    select r.*,
           greatest(r.cur_ord, least(coalesce(c.ord, 0), 4), least(coalesce(p.from_ord, 0), 4),
                    case when r.closed_at is not null then 5 else 0 end) as alc,
           case when coalesce(p.from_ord, r.cur_ord) >= 3 and v.at is null then r.created_at else v.at end as visita_at,
           lower(r.pnome) as pkey,
           case p_bucket when 'day'   then r.cdate
                         when 'month' then date_trunc('month', r.cdate)::date
                         else r.cdate - extract(dow from r.cdate)::int end as b
    from rec r
    left join cmax c on c.lead_id = r.id
    left join prim p on p.lead_id = r.id
    left join vis  v on v.lead_id = r.id
  ),
  -- Produto fechado só para quem chegou a Venda
  lead_final as (
    select f.*, case when f.alc >= 5 then lower(coalesce(f.fnome, f.pnome)) end as fkey,
                case when f.alc >= 5 then coalesce(f.fnome, f.pnome) end as fnome_ok
    from lead_final0 f
  ),

  -- Dicionários: índices curtos no cubo em vez de repetir uuid e nome
  cor as (
    select k.owner, (row_number() over (order by coalesce(pf.name, 'zzz'), k.owner) - 1)::int as i,
           coalesce(pf.name, 'Sem corretor') as nome
    from (select distinct owner from lead_final) k
    left join profiles pf on pf.id = k.owner
  ),
  pro as (
    select q.pkey, (row_number() over (order by (q.pkey is null), q.n desc, q.pkey) - 1)::int as i, q.nome
    from (select pkey, sum(e)::int as n, coalesce(mode() within group (order by pnome), 'Sem produto') as nome
          from (select pkey, pnome, 1 as e from lead_final
                union all
                select fkey, fnome_ok, 0 from lead_final where alc >= 5) u
          group by pkey) q
  ),
  lf as (
    select f.*, c.i as ci, p.i as pi, coalesce(pf.i, -1) as fi
    from lead_final f
    join cor c on c.owner is not distinct from f.owner
    join pro p on p.pkey  is not distinct from f.pkey
    left join pro pf on f.alc >= 5 and pf.pkey is not distinct from f.fkey
  )

select jsonb_build_object(
  'start',  p_start,
  'end',    p_end,
  'bucket', p_bucket,
  'corretores', (select coalesce(jsonb_agg(jsonb_build_object('id', owner, 'nome', nome) order by i), '[]'::jsonb) from cor),
  'produtos',   (select coalesce(jsonb_agg(jsonb_build_object('chave', pkey, 'nome', nome) order by i), '[]'::jsonb) from pro),
  -- [corretor, produto de entrada, balde, etapa mais alta (0–5), descartado (0/1), leads, produto fechado (-1 = sem venda)]
  'cubo', (
    select coalesce(jsonb_agg(jsonb_build_array(ci, pi, b, alc, d, n, fi)), '[]'::jsonb)
    from (select ci, pi, b, alc, (discard_reason is not null)::int as d, count(*)::int as n, fi
          from lf group by 1, 2, 3, 4, 5, 7) x
  ),
  -- 1º contato (migração 114): [corretor, produto, canal, resultado, potencial, leads]
  -- só os leads com o resultado registrado; quem não tem registro = recebidos − soma.
  'contatos', (
    select coalesce(jsonb_agg(jsonb_build_array(ci, pi, canal, resultado, potencial, n)), '[]'::jsonb)
    from (select ci, pi, canal, resultado, potencial, count(*)::int as n
          from lf where resultado is not null group by 1, 2, 3, 4, 5) x
  ),
  -- [corretor, produto, motivo, leads]
  'motivos', (
    select coalesce(jsonb_agg(jsonb_build_array(ci, pi, discard_reason, n)), '[]'::jsonb)
    from (select ci, pi, discard_reason, count(*)::int as n
          from lf where discard_reason is not null group by 1, 2, 3) x
  ),
  -- [corretor, produto, dias entre a chegada e a 1ª visita] — só quem visitou
  'visitas', (
    select coalesce(jsonb_agg(jsonb_build_array(ci, pi,
             round((extract(epoch from (visita_at - created_at)) / 86400.0)::numeric, 1))), '[]'::jsonb)
    from lf where alc >= 3 and visita_at is not null and visita_at >= created_at
  ),
  'historySince', (select (min(interacted_at) at time zone 'America/Sao_Paulo')::date
                   from lead_interactions where type = 'stage_change')
)
$function$;

REVOKE ALL ON FUNCTION public.funil_por_safra(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funil_por_safra(date, date, text) TO authenticated;
