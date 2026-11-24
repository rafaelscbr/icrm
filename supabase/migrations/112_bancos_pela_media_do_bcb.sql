-- ════════════════════════════════════════════════════════════════════════════
-- 112 · Bancos ligados pela média do BCB, provisoriamente (24/11/2026)
--
-- O Rafael pediu para ligar os outros bancos enquanto não há taxa de balcão
-- cadastrada: taxa = a MÉDIA praticada que o Banco Central publica para o banco
-- (taxas de mercado, pós-fixado em TR — a mesma modalidade da Caixa), e as
-- regras (cota, prazo, idade, seguros, tarifa) iguais às da Caixa até ele
-- ajustar no admin.
--
--   • `taxa_origem` diz de onde veio a taxa: 'balcao' (digitada no admin) ou
--     'bcb_media' (provisória). A tela mostra o selo "média BCB".
--   • Enquanto for 'bcb_media', a taxa se atualiza sozinha a cada busca diária
--     (bancos_aplicar_media_bcb, chamada pela Edge Function indices-bcb).
--     Digitar a taxa no admin troca para 'balcao' e para de atualizar.
--   • BRB fica desligado: só aparece no BCB em "taxas reguladas", que não se
--     compara com a taxa de mercado dos outros.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.bancos_parametros
  add column if not exists taxa_origem text not null default 'balcao'
    check (taxa_origem in ('balcao', 'bcb_media')),
  add column if not exists taxa_media_mes text;   -- 'YYYY-MM' da média usada

create or replace function public.bancos_aplicar_media_bcb()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n int;
begin
  with ult as (
    select distinct on (t.cnpj8) t.cnpj8, t.taxa_ano, t.ano_mes
    from taxas_bcb t
    where t.modalidade = 'Financiamento imobiliário com taxas de mercado - Pós-fixado referenciado em TR'
    order by t.cnpj8, t.ano_mes desc
  )
  update bancos_parametros b
     set taxa_sfh = u.taxa_ano, taxa_media_mes = u.ano_mes
    from ult u
   where b.cnpj8 = u.cnpj8
     and b.taxa_origem = 'bcb_media'
     and (b.taxa_sfh is distinct from u.taxa_ano or b.taxa_media_mes is distinct from u.ano_mes);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.bancos_aplicar_media_bcb() from public, anon, authenticated;
grant  execute on function public.bancos_aplicar_media_bcb() to service_role;

-- Regras da Caixa nos bancos provisórios (exceto BRB).
update public.bancos_parametros b
   set taxa_origem = 'bcb_media',
       cota_sac = c.cota_sac, cota_price = c.cota_price, prazo_maximo = c.prazo_maximo,
       idade_maxima_meses = c.idade_maxima_meses, comprometimento = c.comprometimento,
       mip = c.mip, dfi = c.dfi, tarifa = c.tarifa, indexador = 'TR'
  from public.bancos_parametros c
 where c.id = 'caixa'
   and b.id in ('itau', 'bradesco', 'santander', 'bb', 'inter')
   and b.taxa_sfh is null;

select public.bancos_aplicar_media_bcb();

-- Liga só quem ficou com taxa (o check bancos_ativo_completo garante o resto).
update public.bancos_parametros
   set ativo = true
 where taxa_origem = 'bcb_media' and taxa_sfh is not null;
