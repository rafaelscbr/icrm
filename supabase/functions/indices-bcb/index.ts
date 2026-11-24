// Busca no Banco Central (dados abertos, sem chave) o que o Simulador de
// financiamento usa como referência, e grava no banco com data:
//
//   • SGS — variação mensal do INCC-DI (192), do INCC-M (7456) e da TR (7811)
//     → indices_mensais
//   • Olinda — taxa média praticada por banco nas modalidades de financiamento
//     imobiliário (cerca de 1 a 2 meses de atraso) → taxas_bcb
//
// Chamada pelo pg_cron uma vez por dia, via pg_net (migração 111), e pelo botão
// "buscar agora" do admin (RPC indices_bcb_buscar_agora). Implantar com
// verify_jwt = false: a autenticação é o segredo do gancho, como na send-push.
//
// Se o BCB falhar, nada é apagado: a calculadora segue com o último valor salvo
// e o admin vê o erro em indices_sync.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const SERIES: { codigo: number; serie: 'incc_di' | 'incc_m' | 'tr' }[] = [
  { codigo: 192,  serie: 'incc_di' },
  { codigo: 7456, serie: 'incc_m'  },
  { codigo: 7811, serie: 'tr'      },
]

const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosMensalPorMes'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${new URL(url).host}`)
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}

async function marcar(fonte: 'sgs' | 'olinda', erro: string | null): Promise<void> {
  const agora = new Date().toISOString()
  const linha: Record<string, unknown> = { fonte, tentado_em: agora, erro }
  if (!erro) linha.ok_em = agora
  const { error } = await supabase.from('indices_sync').upsert(linha, { onConflict: 'fonte' })
  if (error) console.error('[indices] indices_sync:', error.message)
}

/** "01/10/2026" → "2026-10-01" */
function dataSgs(d: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d)
  return m ? `${m[3]}-${m[2]}-01` : null
}

/** Date → "dd/mm/aaaa" */
function br(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

async function buscarSgs(): Promise<string | null> {
  const erros: string[] = []
  // Janela de 25 meses por data. O atalho /ultimos/N responde 400 a chamadas
  // vindas do servidor (testado em 24/11/2026); a janela por data não.
  const fim = new Date()
  const inicio = new Date(Date.UTC(fim.getUTCFullYear() - 2, fim.getUTCMonth() - 1, 1))
  for (const s of SERIES) {
    try {
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s.codigo}/dados?formato=json&dataInicial=${br(inicio)}&dataFinal=${br(fim)}`
      const dados = await getJson(url) as { data: string; valor: string }[]
      // Uma linha por mês (a última que vier), senão o upsert recusa o lote.
      const porMes = new Map<string, { serie: string; mes: string; variacao: number; fonte: string }>()
      for (const d of dados) {
        const mes = dataSgs(d.data)
        const variacao = Number(d.valor)
        if (mes && Number.isFinite(variacao)) porMes.set(mes, { serie: s.serie, mes, variacao, fonte: `bcb_sgs_${s.codigo}` })
      }
      const linhas = [...porMes.values()]
      if (!linhas.length) throw new Error('série vazia')
      const { error } = await supabase.from('indices_mensais').upsert(
        linhas.map(l => ({ ...l, atualizado_em: new Date().toISOString() })),
        { onConflict: 'serie,mes' },
      )
      if (error) throw new Error(error.message)
    } catch (e) {
      erros.push(`SGS ${s.codigo}: ${(e as Error).message}`)
    }
  }
  return erros.length ? erros.join(' · ') : null
}

interface OlindaLinha {
  Modalidade: string
  InstituicaoFinanceira: string
  TaxaJurosAoMes: number | null
  TaxaJurosAoAno: number | null
  cnpj8: string
  anoMes: string
}

async function buscarOlinda(): Promise<string | null> {
  const { data: bancos, error } = await supabase.from('bancos_parametros').select('cnpj8').not('cnpj8', 'is', null)
  if (error) return error.message
  const erros: string[] = []
  for (const b of bancos ?? []) {
    try {
      const filtro = `cnpj8 eq '${b.cnpj8}' and startswith(Modalidade,'Financiamento imobili')`
      const url = `${OLINDA}?$top=60&$orderby=anoMes%20desc&$format=json&$filter=${encodeURIComponent(filtro)}`
      const r = await getJson(url) as { value: OlindaLinha[] }
      const linhas = (r.value ?? [])
        .filter(l => l.TaxaJurosAoAno != null)
        .map(l => ({
          cnpj8: l.cnpj8, ano_mes: l.anoMes, modalidade: l.Modalidade, instituicao: l.InstituicaoFinanceira,
          taxa_mes: l.TaxaJurosAoMes, taxa_ano: l.TaxaJurosAoAno, buscado_em: new Date().toISOString(),
        }))
      if (!linhas.length) continue // banco sem dado na modalidade (ex.: BRB) não é erro
      const { error: e2 } = await supabase.from('taxas_bcb').upsert(linhas, { onConflict: 'cnpj8,ano_mes,modalidade' })
      if (e2) throw new Error(e2.message)
    } catch (e) {
      erros.push(`Olinda ${b.cnpj8}: ${(e as Error).message}`)
    }
  }
  return erros.length ? erros.join(' · ') : null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { erro: 'use POST' })

  const { data: segredo, error } = await supabase.rpc('get_secret', { p_name: 'indices_hook_secret' })
  if (error || !segredo) return json(500, { erro: 'segredo do gancho indisponível' })
  if (!timingSafeEqual(req.headers.get('x-hook-secret') ?? '', segredo as string)) return json(401, { erro: 'não autorizado' })

  const erroSgs = await buscarSgs()
  await marcar('sgs', erroSgs)
  const erroOlinda = await buscarOlinda()
  await marcar('olinda', erroOlinda)

  return json(200, { sgs: erroSgs ?? 'ok', olinda: erroOlinda ?? 'ok' })
})
