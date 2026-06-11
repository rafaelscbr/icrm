// Modo Associativo: o cliente paga entrada + parcelas + balões direto ao
// empreendimento durante a obra; o saldo restante é financiado no banco
// (geralmente Caixa) na entrega. Após a assinatura do financiamento, o banco
// cobra a taxa de obra — encargo sobre o crédito já liberado à construtora,
// que cresce com a evolução da obra e termina na entrega das chaves.
// Modelo simplificado: evolução linear da obra entre a assinatura e a entrega,
// partindo do percentual já concluído na assinatura.

export type Indice = 'incc' | 'cub'
export type Sistema = 'sac' | 'price'

export const INDICE_LABELS: Record<Indice, string> = { incc: 'INCC', cub: 'CUB' }
export const SISTEMA_LABELS: Record<Sistema, string> = { sac: 'SAC', price: 'PRICE' }

/** Mês no formato "YYYY-MM" (mesmo formato do input type="month") */
export type MesAno = string

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Converte "YYYY-MM" em índice absoluto de mês (ano*12 + mês) para aritmética */
export function mesIndex(m: MesAno): number {
  const [ano, mes] = m.split('-').map(Number)
  return ano * 12 + (mes - 1)
}

/** Índice absoluto → rótulo curto "dez/27" */
export function idxLabel(idx: number): string {
  return `${MESES_ABREV[idx % 12]}/${String(Math.floor(idx / 12)).slice(-2)}`
}

/** "YYYY-MM" → rótulo "dez/2027" */
export function mesAnoLabel(m: MesAno): string {
  if (!m) return '—'
  const [ano, mes] = m.split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${ano}`
}

export interface AssociativoInput {
  valorTotal: number

  // Composição do pagamento na obra (valores efetivos, já resolvidos do toggle %↔R$)
  entradaQtd: number
  entradaValor: number
  parcelasQtd: number
  parcelaValor: number
  balaoQtd: number          // balões são sempre anuais no associativo
  balaoValor: number

  // Correção monetária projetada
  indice: Indice
  taxaIndiceAnual: number   // % a.a. (ex: 5)
  aplicarCorrecao: boolean  // false = exibir apenas valores base

  // Linha do tempo
  inicioParcelas: MesAno    // mês da 1ª parcela
  financiamento: MesAno     // assinatura do financiamento no banco
  entrega: MesAno           // entrega da obra / chaves

  // Taxa de obra (cobrada do mês seguinte à assinatura até a entrega)
  jurosObraMensal: number   // % a.m. (ex: 0,83)
  taxaAdm: number           // R$ fixo/mês
  seguro: number            // R$ fixo/mês
  pctObraAssinatura: number // % da obra já concluído na assinatura (0–100)

  // Financiamento bancário na entrega (sobre o saldo nominal de hoje)
  taxaBancoAnual: number    // % a.a.
  prazoMeses: number
  sistema: Sistema
}

export interface MesFluxo {
  idx: number               // mês absoluto
  label: string             // "jan/26"
  parcela: number | null
  balao: number | null
  taxaObra: number | null
  total: number
  marco: 'financiamento' | 'entrega' | null
}

export interface AssociativoResult {
  entradaTotal: number
  parcelasTotal: number
  balaoTotal: number
  pagoNaObra: number
  pagoNaObraPct: number
  saldoFinanciar: number
  saldoFinanciarPct: number

  taxaMensalIndice: number        // fração equivalente mensal do índice anual
  primeiraParcelaCorrigida: number
  ultimaParcelaCorrigida: number

  mesesTaxaObra: number
  taxaObraPrimeira: number
  taxaObraUltima: number
  taxaObraTotal: number

  parcelaFinanciamento: number    // PRICE: parcela fixa · SAC: 1ª parcela
  fluxo: MesFluxo[]
  totalNaObra: number             // soma da coluna total do fluxo

  valido: boolean
  erro?: string
  avisos: string[]
}

const VAZIO: Omit<AssociativoResult, 'valido' | 'erro'> = {
  entradaTotal: 0, parcelasTotal: 0, balaoTotal: 0,
  pagoNaObra: 0, pagoNaObraPct: 0, saldoFinanciar: 0, saldoFinanciarPct: 0,
  taxaMensalIndice: 0, primeiraParcelaCorrigida: 0, ultimaParcelaCorrigida: 0,
  mesesTaxaObra: 0, taxaObraPrimeira: 0, taxaObraUltima: 0, taxaObraTotal: 0,
  parcelaFinanciamento: 0, fluxo: [], totalNaObra: 0, avisos: [],
}

export function calcularAssociativo(input: AssociativoInput): AssociativoResult {
  const {
    valorTotal, entradaQtd, entradaValor, parcelasQtd, parcelaValor,
    balaoQtd, balaoValor, taxaIndiceAnual, aplicarCorrecao,
    inicioParcelas, financiamento, entrega,
    jurosObraMensal, taxaAdm, seguro, pctObraAssinatura,
    taxaBancoAnual, prazoMeses, sistema,
  } = input

  const entradaTotal  = entradaQtd * entradaValor
  const parcelasTotal = parcelasQtd * parcelaValor
  const balaoTotal    = balaoQtd * balaoValor
  const pagoNaObra    = entradaTotal + parcelasTotal + balaoTotal
  const saldoFinanciar = valorTotal - pagoNaObra

  const erro = (msg: string): AssociativoResult => ({
    ...VAZIO,
    entradaTotal, parcelasTotal, balaoTotal, pagoNaObra, saldoFinanciar,
    pagoNaObraPct: valorTotal > 0 ? (pagoNaObra / valorTotal) * 100 : 0,
    saldoFinanciarPct: valorTotal > 0 ? (saldoFinanciar / valorTotal) * 100 : 0,
    valido: false, erro: msg,
  })

  if (valorTotal <= 0)   return erro('Informe o valor total do imóvel.')
  if (parcelasQtd <= 0)  return erro('Número de parcelas deve ser maior que zero.')
  if (saldoFinanciar < 0) return erro('Entrada + parcelas + balões superam o valor do imóvel.')
  if (!inicioParcelas || !financiamento || !entrega) return erro('Preencha as três datas da linha do tempo.')

  const ini = mesIndex(inicioParcelas)
  const fin = mesIndex(financiamento)
  const ent = mesIndex(entrega)

  if (fin >= ent) return erro('A assinatura do financiamento precisa acontecer antes da entrega da obra.')
  if (ent <= ini) return erro('A entrega da obra precisa ser depois da 1ª parcela.')
  if (prazoMeses <= 0) return erro('Prazo do financiamento deve ser maior que zero.')

  const avisos: string[] = []
  const fimParcelas = ini + parcelasQtd - 1
  if (fimParcelas > ent) avisos.push('As parcelas continuam após a entrega da obra.')
  if (fin < ini) avisos.push('O financiamento foi assinado antes da 1ª parcela ao empreendimento.')

  // Correção composta mensal equivalente ao índice anual (como na planilha:
  // a 1ª parcela já recebe uma correção)
  const taxaMensalIndice = Math.pow(1 + taxaIndiceAnual / 100, 1 / 12) - 1
  const corr = (k: number) => (aplicarCorrecao ? Math.pow(1 + taxaMensalIndice, k) : 1)

  // Taxa de obra: fração da obra liberada evolui linearmente da assinatura à entrega
  const mesesTaxaObra = ent - fin
  const m0 = Math.min(Math.max(pctObraAssinatura, 0), 100) / 100
  const taxaObraEm = (k: number) => { // k = 1..mesesTaxaObra
    const fracao = m0 + (1 - m0) * (k / mesesTaxaObra)
    return saldoFinanciar * fracao * (jurosObraMensal / 100) + taxaAdm + seguro
  }

  const fim = Math.max(ent, fimParcelas)
  const fluxo: MesFluxo[] = []
  let taxaObraTotal = 0
  let totalNaObra = 0

  for (let idx = ini; idx <= fim; idx++) {
    const k = idx - ini + 1 // nº da parcela (1-based)
    const parcela = k <= parcelasQtd ? parcelaValor * corr(k) : null

    // Balões anuais: a cada 12 meses a partir do início (12ª, 24ª, 36ª…)
    const balao = k % 12 === 0 && k / 12 <= balaoQtd ? balaoValor * corr(k) : null

    let taxaObra: number | null = null
    if (idx > fin && idx <= ent) {
      taxaObra = taxaObraEm(idx - fin)
      taxaObraTotal += taxaObra
    }

    const total = (parcela ?? 0) + (balao ?? 0) + (taxaObra ?? 0)
    totalNaObra += total
    fluxo.push({
      idx,
      label: idxLabel(idx),
      parcela, balao, taxaObra, total,
      marco: idx === fin ? 'financiamento' : idx === ent ? 'entrega' : null,
    })
  }

  // Financiamento estimado sobre o saldo nominal de hoje
  const im = Math.pow(1 + taxaBancoAnual / 100, 1 / 12) - 1
  const parcelaFinanciamento = sistema === 'price'
    ? saldoFinanciar * im / (1 - Math.pow(1 + im, -prazoMeses))
    : saldoFinanciar / prazoMeses + saldoFinanciar * im

  return {
    entradaTotal, parcelasTotal, balaoTotal, pagoNaObra, saldoFinanciar,
    pagoNaObraPct: (pagoNaObra / valorTotal) * 100,
    saldoFinanciarPct: (saldoFinanciar / valorTotal) * 100,
    taxaMensalIndice,
    primeiraParcelaCorrigida: parcelaValor * corr(1),
    ultimaParcelaCorrigida: parcelaValor * corr(parcelasQtd),
    mesesTaxaObra,
    taxaObraPrimeira: taxaObraEm(1),
    taxaObraUltima: taxaObraEm(mesesTaxaObra),
    taxaObraTotal,
    parcelaFinanciamento,
    fluxo,
    totalNaObra,
    valido: true,
    avisos,
  }
}
