-- 093 · Pulse: "% dentro do prazo" usa o prazo configurado, não 5 min fixos
--
-- O prazo de 1º contato deixou de ser fixo na migração 085: o admin escolhe os
-- minutos em Configurações de leads (tabela lead_sla_config). O Pulse, porém,
-- continuou medindo "atendidos dentro do SLA" com 5 minutos escritos à mão na
-- função pulse_snapshot — hoje o prazo é outro e o percentual do painel mede
-- uma régua que não existe mais.
--
-- O que muda, e só isso:
--   1. O filtro "m <= 5" passa a comparar com lead_sla_config.minutes.
--   2. A resposta ganha o campo tempos.primeiroContato.slaMin, com os minutos
--      que o banco usou na conta. A tela escreve "dentro do prazo de X min" com
--      esse número — o texto e a conta saem do mesmo lugar e não descasam.
--
-- O que NÃO muda: a janela (últimos 30 dias), a medida em minutos úteis, média,
-- mediana e todos os outros blocos do snapshot. Continua uma leitura só.
--
-- Limite conhecido: o percentual julga os 30 dias inteiros pelo prazo de HOJE.
-- O prazo que valia quando cada lead entrou não fica guardado no lead, então
-- um lead de quando o prazo era 5 min é medido pela régua atual.
--
-- Mesmo método da migração 072: a função tem ~400 linhas, então troca-se só o
-- trecho-alvo na definição que está no banco. Se algum trecho não for
-- encontrado, a migração para e nada é alterado.

do $do$
declare
  v_def text;
  v_alvos text[] := array[
    'count(*) filter (where m <= 5)',
    $t$'pctDentroSla', (select pct_sla from tempo_1o)$t$
  ];
  v_novos text[] := array[
    'count(*) filter (where m <= (select minutes from lead_sla_config where id = 1))',
    $t$'pctDentroSla', (select pct_sla from tempo_1o), 'slaMin', (select minutes from lead_sla_config where id = 1)$t$
  ];
  i int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'pulse_snapshot';

  if v_def is null then
    raise exception 'Função pulse_snapshot não encontrada — nada foi alterado';
  end if;

  for i in 1..array_length(v_alvos, 1) loop
    if position(v_alvos[i] in v_def) = 0 then
      raise exception 'Trecho alvo % não encontrado em pulse_snapshot — nada foi alterado', i;
    end if;
    v_def := replace(v_def, v_alvos[i], v_novos[i]);
  end loop;

  execute v_def;
end $do$;
