-- Renda "Ainda preciso me planejar" passa a contar como Difícil.
--
-- Mesma regra da 080 para a entrada: Possível exige entrada E parcela dentro
-- ou perto da régua. A parcela se mede pela renda (30% do desembolso mensal);
-- sem renda definida não há como medir, então é trava. Antes ela virava
-- 'sem_dados' e o encaixe ficava decidido só pela entrada.

create or replace function public.lead_fit_regua(
  p_profile jsonb, p_income_min numeric, p_income_ideal numeric,
  p_down_min numeric, p_down_ideal numeric,
  p_accepts_resident boolean, p_accepts_investor boolean,
  p_regime text, p_fgts_composes boolean)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  r_renda text := 'sem_dados'; r_entrada text := 'sem_dados';
  objetivo_barra boolean := false;
  motivos jsonb := '[]'::jsonb; v jsonb; objetivo text; financeiro text;
begin
  if p_profile is null then
    return jsonb_build_object('fit','sem_dados','reasons','[]'::jsonb);
  end if;

  v := p_profile -> 'renda';
  if v is not null and coalesce((v->>'unplanned')::boolean,false) = false then
    r_renda := fit_range((v->>'min')::numeric, (v->>'max')::numeric, p_income_min, p_income_ideal);
    motivos := motivos || jsonb_build_object('field','renda','fit',r_renda,
      'text', fit_reason_text(r_renda, coalesce(v->>'label','—'),
                (v->>'min')::numeric, (v->>'max')::numeric, p_income_min, p_income_ideal, 'renda'));
  elsif v is not null then
    -- Sem renda definida não há como medir a parcela: é trava, como a entrada.
    r_renda := 'dificil';
    motivos := motivos || jsonb_build_object('field','renda','fit','dificil',
      'text','Renda indefinida — ainda está se planejando');
  end if;

  v := p_profile -> 'entrada';
  if v is not null and coalesce((v->>'unplanned')::boolean,false) = false then
    r_entrada := fit_range((v->>'min')::numeric, (v->>'max')::numeric, p_down_min, p_down_ideal);
    motivos := motivos || jsonb_build_object('field','entrada','fit',r_entrada,
      'text', fit_reason_text(r_entrada, coalesce(v->>'label','—'),
                (v->>'min')::numeric, (v->>'max')::numeric, p_down_min, p_down_ideal, 'entrada'));
  elsif v is not null then
    -- Sem valor de entrada definido não há como ser Possível: é trava.
    r_entrada := 'dificil';
    motivos := motivos || jsonb_build_object('field','entrada','fit','dificil',
      'text','Entrada indefinida — ainda está se planejando');
  end if;

  v := p_profile -> 'objetivo';
  objetivo := v ->> 'value';
  if objetivo is not null and objetivo <> 'indefinido' then
    if objetivo = 'investir' and not coalesce(p_accepts_investor,true) then
      objetivo_barra := true;
      motivos := motivos || jsonb_build_object('field','objetivo','fit','dificil',
        'text','Quer investir e o produto é só para quem vai morar');
    elsif objetivo = 'morar' and not coalesce(p_accepts_resident,true) then
      objetivo_barra := true;
      motivos := motivos || jsonb_build_object('field','objetivo','fit','dificil',
        'text','Quer morar e o produto é só para investidor');
    else
      motivos := motivos || jsonb_build_object('field','objetivo','fit','info',
        'text', coalesce(v->>'label','') || ' — aceito pelo produto');
    end if;
  end if;

  -- Só `fgts_composes`. O regime não entra mais nesta decisão.
  if coalesce(p_fgts_composes,false) then
    v := p_profile -> 'fgts';
    if v is not null then
      motivos := motivos || jsonb_build_object('field','fgts',
        'fit', case when v->>'value'='sim' then 'ideal' else 'possivel' end,
        'text', case when v->>'value'='sim'
                     then 'Pretende usar FGTS — compõe a entrada neste produto'
                     else 'Não pretende usar FGTS — a entrada sai toda do bolso' end);
    else
      -- Onde o FGTS conta, não saber é lacuna que vale perguntar.
      motivos := motivos || jsonb_build_object('field','fgts','fit','sem_dados',
        'text','FGTS não informado — neste produto ele compõe a entrada, vale descobrir');
    end if;
  end if;

  financeiro := fit_worst(array[r_renda, r_entrada]);

  return jsonb_build_object(
    'fit', case when objetivo_barra then 'dificil' else financeiro end,
    'reasons', motivos);
end $function$;
