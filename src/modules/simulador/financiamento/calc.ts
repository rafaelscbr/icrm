/**
 * Simulador de financiamento — as contas do repasse (24/11/2026).
 *
 * Lançamento: o cliente paga uma parte à construtora durante a obra (corrigida
 * pelo INCC ou pelo CUB) e, na entrega das chaves, financia o saldo no banco.
 * Aqui ficam só funções puras: o painel ao lado do Simulador de fluxo, a ficha
 * do lead e o comparativo entre bancos usam as mesmas contas.
 *
 * Unidades: todo percentual entra como PERCENTUAL (11,49 = 11,49% a.a.;
 * 0,025 = 0,025% ao mês), exatamente como fica cadastrado no admin. A conversão
 * para fração acontece só aqui dentro.
 *
 * Regras combinadas com o Rafael (implementar exatamente assim):
 *   1. saldo nas chaves = (valor − pago até as chaves) × (1 + índice mensal)^meses; − FGTS
 *   2. limites do banco: cota (SAC ≠ Price), prazo máximo, idade + prazo, teto do SFH
 *   3. taxa mensal = (1 + taxa anual)^(1/12) − 1
 *   4. SAC: amortização constante; Price: parcela fixa
 *   5. encargos: MIP (sobre o financiado, por idade) + DFI (sobre o imóvel) + tarifa
 *   6. renda necessária = parcela total ÷ comprometimento (30%)
 *   7. modo inverso: com a renda do cliente, quanto ela financia e o que falta
 */

export type Sistema = 'sac' | 'price'
export type Indexador = 'TR' | 'IPCA' | 'fixa'
export type IndiceObra = 'incc' | 'cub'

/** Teto do imóvel no SFH. Acima dele o financiamento é SFI, com a taxa SFI do banco. */
export const TETO_SFH = 2_250_000

/** Idade + prazo não passam de 80 anos e 6 meses no padrão do mercado. */
export const IDADE_MAXIMA_PADRAO_MESES = 80 * 12 + 6

/** Faixa da tabela de MIP: vale até `idadeAte` anos (inclusive). `coef` em % ao mês. */
export interface FaixaMip {
  idadeAte: number
  coef: number
}

/** Os parâmetros de um banco, como ficam em `bancos_parametros`. */
export interface ParametrosBanco {
  id: string
  nome: string
  sigla: string
  logoUrl: string | null
  ativo: boolean
  /** % a.a.; null = ainda não cadastrada (não se inventa taxa) */
  taxaSfh: number | null
  taxaSfi: number | null
  indexador: Indexador
  /** % máximo do imóvel que o banco financia */
  cotaSac: number
  cotaPrice: number
  prazoMaximo: number
  /** idade + prazo, em meses (966 = 80 anos e 6 meses) */
  idadeMaximaMeses: number
  /** % da renda bruta que a parcela pode comprometer */
  comprometimento: number
  mip: FaixaMip[]
  /** % ao mês sobre o valor do imóvel */
  dfi: number
  /** R$ por mês */
  tarifa: number
  atualizadoEm: string | null
  atualizadoPor: string | null
  /** 'bcb_media' = taxa provisória pela média do Banco Central (migração 112) */
  taxaOrigem?: 'balcao' | 'bcb_media'
  /** 'YYYY-MM' da média do BCB usada */
  taxaMediaMes?: string | null
}

// ── Peças ────────────────────────────────────────────────────────────────────

/** Taxa anual (%) → fração mensal equivalente. */
export function taxaMensal(anualPct: number): number {
  return Math.pow(1 + anualPct / 100, 1 / 12) - 1
}

/**
 * Variação acumulada em 12 meses (% a.a.) a partir das variações mensais (%).
 * É o "usar média dos últimos 12 meses" do INCC e do CUB.
 */
export function acumulado12Meses(variacoesMensaisPct: number[]): number | null {
  const ultimas = variacoesMensaisPct.slice(-12)
  if (ultimas.length < 12) return null
  const fator = ultimas.reduce((f, v) => f * (1 + v / 100), 1)
  return (fator - 1) * 100
}

/** Meses inteiros entre hoje e o mês de entrega ("YYYY-MM"); nunca negativo. */
export function mesesAte(entrega: string, hoje: Date = new Date()): number {
  const [ano, mes] = entrega.split('-').map(Number)
  if (!ano || !mes) return 0
  return Math.max(0, (ano * 12 + mes - 1) - (hoje.getFullYear() * 12 + hoje.getMonth()))
}

export interface SaldoNasChaves {
  saldoHoje: number
  /** fator de correção do índice até as chaves (1 = sem correção) */
  fatorCorrecao: number
  saldoChaves: number
}

/** Regra 1 — o saldo devedor de hoje corrigido pelo índice até a entrega. */
export function saldoNasChaves(valorImovel: number, pagoAteChaves: number, indiceAnualPct: number, meses: number): SaldoNasChaves {
  const saldoHoje = Math.max(0, valorImovel - pagoAteChaves)
  const fatorCorrecao = Math.pow(1 + taxaMensal(indiceAnualPct), Math.max(0, meses))
  return { saldoHoje, fatorCorrecao, saldoChaves: saldoHoje * fatorCorrecao }
}

/** Prazo máximo pelo banco e pela idade do comprador mais velho (em meses de idade). */
export function prazoMaximoPermitido(banco: Pick<ParametrosBanco, 'prazoMaximo' | 'idadeMaximaMeses'>, idadeMeses?: number | null): number {
  if (idadeMeses == null || idadeMeses <= 0) return banco.prazoMaximo
  return Math.max(0, Math.min(banco.prazoMaximo, Math.floor(banco.idadeMaximaMeses - idadeMeses)))
}

/**
 * Coeficiente de MIP (% ao mês) para a idade. Sem idade, usa o maior da tabela
 * (pior cenário). Tabela vazia = 0.
 */
export function coefMip(faixas: FaixaMip[], idadeAnos?: number | null): number {
  if (!faixas.length) return 0
  const ordenadas = [...faixas].sort((a, b) => a.idadeAte - b.idadeAte)
  if (idadeAnos == null) return Math.max(...ordenadas.map(f => f.coef))
  const faixa = ordenadas.find(f => idadeAnos <= f.idadeAte) ?? ordenadas[ordenadas.length - 1]
  return faixa.coef
}

/** Regra 4 — parcela k (1-based) do SAC, sem encargos. */
export function parcelaSac(financiado: number, i: number, n: number, k = 1): number {
  if (n <= 0) return 0
  const amortizacao = financiado / n
  return amortizacao + (financiado - amortizacao * (k - 1)) * i
}

/** Fator da tabela Price: parcela = financiado × fator. */
export function fatorPrice(i: number, n: number): number {
  if (n <= 0) return 0
  if (i === 0) return 1 / n
  return i / (1 - Math.pow(1 + i, -n))
}

/** Regra 4 — parcela fixa da Price, sem encargos. */
export function parcelaPrice(financiado: number, i: number, n: number): number {
  return financiado * fatorPrice(i, n)
}

export interface Totais {
  totalPago: number
  totalJuros: number
}

/** Total pago e total de juros no prazo (só amortização + juros, sem encargos). */
export function totais(sistema: Sistema, financiado: number, i: number, n: number): Totais {
  if (n <= 0 || financiado <= 0) return { totalPago: 0, totalJuros: 0 }
  const totalJuros = sistema === 'sac'
    ? i * financiado * (n + 1) / 2
    : parcelaPrice(financiado, i, n) * n - financiado
  return { totalPago: financiado + totalJuros, totalJuros }
}

/**
 * A parcela ao longo do prazo (sem encargos), amostrada para o gráfico:
 * no máximo `pontos` pontos, sempre com a primeira e a última.
 */
export function evolucaoParcela(sistema: Sistema, financiado: number, i: number, n: number, pontos = 60): { mes: number; parcela: number }[] {
  if (n <= 0 || financiado <= 0) return []
  const passo = Math.max(1, Math.ceil(n / pontos))
  const meses: number[] = []
  for (let k = 1; k <= n; k += passo) meses.push(k)
  if (meses[meses.length - 1] !== n) meses.push(n)
  const fixa = parcelaPrice(financiado, i, n)
  return meses.map(k => ({ mes: k, parcela: sistema === 'sac' ? parcelaSac(financiado, i, n, k) : fixa }))
}

// ── Simulação completa ──────────────────────────────────────────────────────

export interface EntradaSimulacao {
  valorImovel: number
  pagoAteChaves: number
  mesesAteEntrega: number
  /** % a.a. do índice da obra (INCC ou CUB) */
  indiceAnual: number
  /** idade do comprador mais velho, em anos; ausente = não informada */
  idade?: number | null
  sistema: Sistema
  /** meses; ausente ou acima do máximo = o maior permitido */
  prazo?: number | null
  /** % a.a.; ausente = a taxa do banco (SFH ou SFI conforme o teto) */
  taxaAnual?: number | null
  fgts?: number
  /** renda bruta familiar já somada; ausente = sem modo inverso */
  rendaCliente?: number | null
}

export interface Sugestao {
  tipo: 'entrada' | 'renda' | 'fgts' | 'prazo'
  valor: number
  texto: string
}

export interface ResultadoInverso {
  rendaCliente: number
  /** fração (0,32 = 32%) */
  comprometimentoAtual: number
  /** quanto essa renda financia, nas chaves */
  saldoMaximo: number
  /** saldoMaximo − financiado: positivo = sobra, negativo = falta */
  diferenca: number
  passa: boolean
  sugestoes: Sugestao[]
}

export interface ResultadoSimulacao {
  valido: boolean
  erro?: string
  avisos: string[]

  saldoHoje: number
  fatorCorrecao: number
  saldoChaves: number
  financiado: number

  sfi: boolean
  taxaAnual: number
  taxaBanco: number | null
  i: number

  prazo: number
  prazoMaximo: number

  cotaPct: number
  cotaEstourada: boolean
  /** quanto passa da cota, nas chaves — o que falta de entrada */
  faltaEntradaCota: number

  amortizacao: number
  juros1: number
  parcela1: number
  mip: number
  dfi: number
  tarifa: number
  parcelaTotal: number
  /** fração (0,30) */
  comprometimento: number
  rendaNecessaria: number

  sac: Totais
  price: Totais
  inverso: ResultadoInverso | null
}

const VAZIO: Omit<ResultadoSimulacao, 'valido' | 'erro' | 'avisos'> = {
  saldoHoje: 0, fatorCorrecao: 1, saldoChaves: 0, financiado: 0,
  sfi: false, taxaAnual: 0, taxaBanco: null, i: 0, prazo: 0, prazoMaximo: 0,
  cotaPct: 0, cotaEstourada: false, faltaEntradaCota: 0,
  amortizacao: 0, juros1: 0, parcela1: 0, mip: 0, dfi: 0, tarifa: 0, parcelaTotal: 0,
  comprometimento: 0.3, rendaNecessaria: 0,
  sac: { totalPago: 0, totalJuros: 0 }, price: { totalPago: 0, totalJuros: 0 }, inverso: null,
}

/** Parcela total (1ª) para um financiado, já com MIP, DFI e tarifa. */
function parcelaTotalPara(sistema: Sistema, financiado: number, i: number, n: number, mipCoef: number, dfi: number, tarifa: number): number {
  const p = sistema === 'sac' ? parcelaSac(financiado, i, n, 1) : parcelaPrice(financiado, i, n)
  return p + financiado * mipCoef + dfi + tarifa
}

/** A taxa que vale para o imóvel: SFH até o teto, SFI acima. */
export function taxaDoBanco(banco: ParametrosBanco, valorImovel: number): { taxa: number | null; sfi: boolean } {
  const sfi = valorImovel > TETO_SFH
  return { taxa: sfi ? (banco.taxaSfi ?? null) : banco.taxaSfh, sfi }
}

export function simular(e: EntradaSimulacao, banco: ParametrosBanco): ResultadoSimulacao {
  const avisos: string[] = []
  const falha = (erro: string): ResultadoSimulacao => ({ ...VAZIO, valido: false, erro, avisos })

  if (!(e.valorImovel > 0)) return falha('Informe o valor do imóvel.')
  if (e.pagoAteChaves < 0) return falha('O valor pago até as chaves não pode ser negativo.')
  if (e.pagoAteChaves >= e.valorImovel) return falha('O pago até as chaves cobre o imóvel inteiro: não há saldo para financiar.')

  // 1. Saldo nas chaves
  const s = saldoNasChaves(e.valorImovel, e.pagoAteChaves, e.indiceAnual, e.mesesAteEntrega)
  const financiado = Math.max(0, s.saldoChaves - Math.max(0, e.fgts ?? 0))

  // 2. Teto do SFH e taxa
  const { taxa: taxaBanco, sfi } = taxaDoBanco(banco, e.valorImovel)
  if (sfi) {
    avisos.push('Imóvel acima do teto do SFH (R$ 2,25 milhões): financiamento pelo SFI.')
    if (banco.taxaSfi == null) avisos.push(`${banco.nome} sem taxa SFI cadastrada.`)
  }
  const taxaAnual = e.taxaAnual ?? taxaBanco
  if (taxaAnual == null) return { ...falha(`${banco.nome} ainda não tem taxa cadastrada.`), saldoHoje: s.saldoHoje, fatorCorrecao: s.fatorCorrecao, saldoChaves: s.saldoChaves, financiado, sfi }
  const i = taxaMensal(taxaAnual)

  // 2. Prazo pela idade e pelo banco
  const idadeMeses = e.idade != null && e.idade > 0 ? e.idade * 12 : null
  const prazoMaximo = prazoMaximoPermitido(banco, idadeMeses)
  if (prazoMaximo <= 0) return falha('Pela idade informada, o banco não financia: idade + prazo passa do limite.')
  const prazo = e.prazo != null && e.prazo > 0 ? Math.min(Math.round(e.prazo), prazoMaximo) : prazoMaximo

  // 2. Cota
  const cotaPct = e.sistema === 'sac' ? banco.cotaSac : banco.cotaPrice
  const limiteCota = e.valorImovel * cotaPct / 100
  const cotaEstourada = financiado > limiteCota + 0.005
  const faltaEntradaCota = cotaEstourada ? financiado - limiteCota : 0
  if (cotaEstourada) avisos.push(`Financiamento acima da cota de ${fmtPct(cotaPct)} do ${e.sistema === 'sac' ? 'SAC' : 'Price'}.`)

  // 4–6. Parcela, encargos e renda
  const mipCoef = coefMip(banco.mip, e.idade) / 100
  const amortizacao = e.sistema === 'sac' ? financiado / prazo : parcelaPrice(financiado, i, prazo) - financiado * i
  const juros1 = financiado * i
  const parcela1 = e.sistema === 'sac' ? parcelaSac(financiado, i, prazo, 1) : parcelaPrice(financiado, i, prazo)
  const mip = financiado * mipCoef
  const dfi = e.valorImovel * banco.dfi / 100
  const tarifa = banco.tarifa
  const parcelaTotal = parcela1 + mip + dfi + tarifa
  const comprometimento = banco.comprometimento / 100
  const rendaNecessaria = parcelaTotal / comprometimento

  // 7. Modo inverso
  let inverso: ResultadoInverso | null = null
  const renda = e.rendaCliente ?? 0
  if (renda > 0) {
    const fator = e.sistema === 'sac' ? 1 / prazo + i : fatorPrice(i, prazo)
    const saldoMaximo = Math.max(0, (comprometimento * renda - dfi - tarifa) / (fator + mipCoef))
    const diferenca = saldoMaximo - financiado
    const passa = diferenca >= -0.005
    const sugestoes: Sugestao[] = []
    if (!passa) {
      const excesso = -diferenca
      // Entrada a mais paga até as chaves reduz o saldo de HOJE, que depois é corrigido.
      const entrada = excesso / s.fatorCorrecao
      sugestoes.push({ tipo: 'entrada', valor: entrada, texto: `Aumentar o pago até as chaves em ${fmtBRL(entrada)}` })
      sugestoes.push({ tipo: 'renda', valor: rendaNecessaria - renda, texto: `Compor renda de mais ${fmtBRL(rendaNecessaria - renda)}` })
      sugestoes.push({ tipo: 'fgts', valor: excesso, texto: `Usar ${fmtBRL(excesso)} de FGTS nas chaves` })
      const n = menorPrazoQuePassa(e.sistema, financiado, i, prazo, prazoMaximo, mipCoef, dfi, tarifa, comprometimento * renda)
      if (n != null) sugestoes.push({ tipo: 'prazo', valor: n, texto: `Estender o prazo para ${n} meses` })
    }
    inverso = { rendaCliente: renda, comprometimentoAtual: parcelaTotal / renda, saldoMaximo, diferenca, passa, sugestoes }
  }

  return {
    valido: true, avisos,
    saldoHoje: s.saldoHoje, fatorCorrecao: s.fatorCorrecao, saldoChaves: s.saldoChaves, financiado,
    sfi, taxaAnual, taxaBanco, i, prazo, prazoMaximo,
    cotaPct, cotaEstourada, faltaEntradaCota,
    amortizacao, juros1, parcela1, mip, dfi, tarifa, parcelaTotal, comprometimento, rendaNecessaria,
    sac: totais('sac', financiado, i, prazo),
    price: totais('price', financiado, i, prazo),
    inverso,
  }
}

/** O menor prazo (acima do atual, até o máximo) em que a parcela cabe na renda. */
function menorPrazoQuePassa(sistema: Sistema, financiado: number, i: number, atual: number, maximo: number, mipCoef: number, dfi: number, tarifa: number, limite: number): number | null {
  if (atual >= maximo) return null
  if (parcelaTotalPara(sistema, financiado, i, maximo, mipCoef, dfi, tarifa) > limite) return null
  let lo = atual + 1, hi = maximo
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (parcelaTotalPara(sistema, financiado, i, mid, mipCoef, dfi, tarifa) <= limite) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** Mesma simulação em todos os bancos ativos com taxa, da menor renda exigida para a maior. */
export function compararBancos(e: EntradaSimulacao, bancos: ParametrosBanco[]): { banco: ParametrosBanco; r: ResultadoSimulacao }[] {
  return bancos
    .filter(b => b.ativo)
    .map(banco => ({ banco, r: simular({ ...e, taxaAnual: null }, banco) }))
    .filter(x => x.r.valido)
    .sort((a, b) => a.r.rendaNecessaria - b.r.rendaNecessaria)
}

/** Idade hoje a partir da idade informada numa data — a idade "envelhece sozinha". */
export function idadeHoje(idade: number | null | undefined, informadaEm: string | null | undefined, hoje: Date = new Date()): number | null {
  if (idade == null || idade <= 0) return null
  if (!informadaEm) return idade
  const d = new Date(informadaEm)
  if (isNaN(d.getTime())) return idade
  let anos = hoje.getFullYear() - d.getFullYear()
  if (hoje.getMonth() < d.getMonth() || (hoje.getMonth() === d.getMonth() && hoje.getDate() < d.getDate())) anos--
  return idade + Math.max(0, anos)
}

// ── Formatação local (as mensagens das sugestões precisam dela) ─────────────

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(v: number): string {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}
