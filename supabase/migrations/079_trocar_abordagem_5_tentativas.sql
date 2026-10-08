-- 079 — "Trocar a abordagem" passa a valer a partir da 5ª tentativa sem resposta.
--
-- A cadência de followup subiu de 5 para 10 tentativas (MAX_TENTATIVAS_FOLLOWUP
-- no front). Com 10 tentativas, esfriar o lead já na 3ª tirava ponto cedo
-- demais, com 7 tentativas ainda pela frente. O desconto de -25 e o
-- motivo "Sem resposta após N tentativas" agora entram na 5ª — o mesmo limite
-- que dispara o aviso "Trocar a abordagem, não repetir" em nextPlay.ts.
--
-- Só essa linha muda. O resto da função é idêntico à 070.

create or replace function public.lead_temperature(
  p_lead              leads,
  p_ultima_interacao  timestamptz,
  p_avancos           integer,
  p_regressoes        integer,
  p_visitas_agendadas integer,
  p_visitas_feitas    integer,
  p_formularios       integer,
  p_ultimo_form       timestamptz,
  p_era_da_base       boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
declare
  agora     timestamptz := now();
  ref       timestamptz := greatest(coalesce(p_ultima_interacao, p_lead.created_at),
                                    coalesce(p_ultimo_form,      p_lead.created_at));
  dias      int := extract(day from agora - ref)::int;
  idade     int := extract(day from agora - p_lead.created_at)::int;
  estado    text;
  motivos   jsonb := '[]'::jsonb;
  score     int := 0;
  respondeu boolean;
begin
  -- O lead "respondeu" quando alguém o moveu para Atendimento ou além. O
  -- corretor só faz esse movimento depois que a pessoa deu sinal — é o proxy
  -- mais honesto que existe hoje. first_contact_at NÃO serve: ele marca o
  -- corretor abrindo o WhatsApp, não a pessoa respondendo.
  respondeu := p_lead.funnel_stage in ('atendimento','visita','proposta','venda');

  -- ── Venda fechada sai da régua ───────────────────────────────────────────
  if p_lead.closed_at is not null then
    return jsonb_build_object('state','ganho','score',100,
      'reasons', jsonb_build_array(jsonb_build_object('sign','+','text','Venda concluída')));
  end if;

  -- ── Descarte: frio, com o motivo à mostra ───────────────────────────────
  if p_lead.discard_reason is not null then
    return jsonb_build_object('state','frio','score',0,
      'reasons', jsonb_build_array(jsonb_build_object(
        'sign','-','text','Descartado: ' || replace(p_lead.discard_reason,'_',' '))));
  end if;

  -- ── Sinais que somam (só coisas que partiram do lead) ───────────────────
  if p_visitas_feitas > 0 then
    score := score + 45;
    motivos := motivos || jsonb_build_object('sign','+','text','Compareceu na visita');
  elsif p_visitas_agendadas > 0 then
    -- Aceitar agendar já conta, mesmo sem comparecer: a pessoa disse sim.
    score := score + 30;
    motivos := motivos || jsonb_build_object('sign','+','text','Aceitou agendar visita');
  end if;

  if respondeu then
    score := score + 20;
    motivos := motivos || jsonb_build_object('sign','+','text','Respondeu e avançou para atendimento');
  end if;

  if p_avancos > 0 then
    score := score + least(p_avancos * 8, 24);
    motivos := motivos || jsonb_build_object('sign','+',
      'text', p_avancos || ' avanço(s) real(is) no funil');
  end if;

  -- Teto de 3: lead ansioso que preenche oito vezes não pode ficar mais quente
  -- que lead que fez visita.
  if p_formularios > 1 then
    score := score + least(p_formularios - 1, 2) * 12;
    motivos := motivos || jsonb_build_object('sign','+',
      'text', p_formularios || ' formulários preenchidos');
  end if;

  if p_era_da_base then
    score := score + 12;
    motivos := motivos || jsonb_build_object('sign','+','text','Já procurava imóvel na nossa base');
  end if;

  -- ── Sinais que descontam ────────────────────────────────────────────────
  -- Regressão esfria na hora. Avanço aquece devagar (precisa de sinal do lead),
  -- recuo esfria rápido: sistema de vendas honesto é pessimista.
  if p_regressoes > 0 then
    score := score - p_regressoes * 20;
    motivos := motivos || jsonb_build_object('sign','-',
      'text', p_regressoes || ' volta(s) atrás no funil');
  end if;

  -- Não respondeu a 5+ tentativas: o próprio contador de follow-up do CRM.
  if not respondeu and p_lead.followup_step >= 5 then
    score := score - 25;
    motivos := motivos || jsonb_build_object('sign','-',
      'text','Sem resposta após ' || p_lead.followup_step || ' tentativas');
  end if;

  -- ── Decaimento por tempo ────────────────────────────────────────────────
  -- Todo sinal perde força. O lead esfria sozinho, sem ninguém mexer.
  if dias > 7 then
    score := score - least((dias - 7) * 2, 40);
    motivos := motivos || jsonb_build_object('sign','-',
      'text', dias || ' dias sem sinal novo');
  end if;

  -- ── Estado ──────────────────────────────────────────────────────────────
  -- Reaquecendo tem precedência: é o estado mais valioso do funil e sumiria
  -- dentro de "morno" se fosse decidido só pelo score.
  if dias <= 7 and idade > 30 and (p_formularios > 1 or p_avancos > 0) then
    estado := 'reaquecendo';
    motivos := jsonb_build_object('sign','+','text','Voltou a dar sinal depois de um tempo parado') || motivos;
  elsif score >= 45 then estado := 'quente';
  elsif score >= 15 then estado := 'morno';
  elsif idade <= 3 and score = 0 and p_lead.followup_step <= 1 then
    -- Corretor mover para Follow-up não muda nada: ainda é lead novo.
    estado := 'novo';
    motivos := jsonb_build_array(jsonb_build_object('sign','=','text','Entrou agora, ainda sem sinal'));
  else estado := 'frio';
  end if;

  -- ── Reentrada recente tem piso morno ────────────────────────────────────
  -- Regra de negócio, não ajuste de pontos: quem preenche de novo por conta
  -- própria não é lead frio, mesmo que a régua comportamental ainda não tenha
  -- ponto suficiente para dizer isso. Só vale para reentrada RECENTE (7 dias) —
  -- sinal também envelhece, e um formulário repetido em maio não pode manter o
  -- lead morno em agosto. O score sobe junto para o piso da faixa: estado e
  -- número dizendo coisas diferentes é como o painel começa a mentir.
  if p_formularios > 1
     and p_ultimo_form is not null
     and p_ultimo_form > agora - interval '7 days'
     and estado in ('frio','novo')
  then
    estado  := 'morno';
    score   := greatest(score, 15);
    motivos := jsonb_build_object('sign','+','text','Voltou a se cadastrar — piso morno') || motivos;
  end if;

  return jsonb_build_object('state', estado, 'score', greatest(score, 0), 'reasons', motivos);
end $function$;
