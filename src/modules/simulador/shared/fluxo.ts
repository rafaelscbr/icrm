import { useEffect } from 'react'
import type { PagamentoBase, ReforcoAvulso, ReforcoModo, SharedFields, SimuladorModo } from './types'
import type { Indice, Sistema, MesAno } from '../associativo/calc'

/**
 * Fluxo salvo — o formato em que uma simulação é guardada e reaberta.
 *
 * Até 19/11/2026 o simulador não guardava nada: cada modo mantinha os valores
 * em estado local e a simulação sumia ao sair da tela. Para salvar um fluxo no
 * lead, cada modo passou a aceitar um `inicial` (o estado com que nasce) e a
 * relatar o estado atual por `onRelato`. Na tela do Simulador nenhum dos dois é
 * passado e tudo funciona como antes.
 *
 * O que se guarda de cada versão:
 *   • `dados`    — o que o corretor preencheu (para reabrir e editar);
 *   • `resumo`   — os números principais, congelados na hora de salvar;
 *   • `mensagem` — o texto do WhatsApp exatamente como foi gerado.
 * `resumo` e `mensagem` não são recalculados depois: se a regra de cálculo
 * mudar, o histórico continua mostrando o que foi proposto ao cliente.
 */

type EntradaModo = 'valor' | 'pct'

export interface EstadoPosChaves {
  pctChaves: number
  base: PagamentoBase
  entradaModo: EntradaModo
  entradaPct: number
}

export interface EstadoDireto {
  base: PagamentoBase
  entradaModo: EntradaModo
  entradaPct: number
}

/** O formulário inteiro do modo associativo (era o tipo interno `Cfg`). */
export interface EstadoAssociativo {
  entradaQtd: number; entradaModo: EntradaModo; entradaValor: number; entradaPct: number
  parcelasQtd: number; parcelasModo: EntradaModo; parcelaValor: number; parcelasPct: number
  balaoQtd: number; balaoModo: EntradaModo; balaoValor: number; balaoPct: number
  balaoForma: ReforcoModo; baloesAvulsos: ReforcoAvulso[]
  indice: Indice; taxaIndiceAnual: number; aplicarCorrecao: boolean
  inicioParcelas: MesAno; financiamento: MesAno; entrega: MesAno
  jurosObraMensal: number; taxaAdm: number; seguro: number; pctObraAssinatura: number
  taxaBancoAnual: number; prazoMeses: number; sistema: Sistema
}

export interface EstadoPorModo {
  pos_chaves: EstadoPosChaves
  direto: EstadoDireto
  associativo: EstadoAssociativo
}

/** Os números que aparecem na lista de fluxos do lead — congelados ao salvar. */
export interface ResumoFluxo {
  valorTotal: number
  entradaTotal: number
  parcelasQtd: number
  parcelaValor: number
  /** só no associativo: o que sobra para financiar no banco */
  saldoFinanciar?: number
  /** a frase pronta da lista: "R$ 600.000,00 · entrada R$ 60.000,00 · 36× de R$ 2.500,00" */
  linha: string
}

/** O que um modo do simulador conta a quem o hospeda, a cada mudança. */
export interface RelatoDoSimulador<E> {
  estado: E
  valido: boolean
  /** texto do WhatsApp; vazio enquanto a simulação não fecha */
  mensagem: string
  resumo: ResumoFluxo
}

export interface DadosDoFluxo<M extends SimuladorModo = SimuladorModo> {
  shared: SharedFields
  estado: EstadoPorModo[M]
}

/** Uma versão salva de um fluxo, como o banco devolve (lead_fluxos_list). */
export interface LeadFluxo {
  id: string
  leadId: string
  /** agrupa as versões do mesmo fluxo */
  fluxoId: string
  versao: number
  nome: string
  modo: SimuladorModo
  dados: DadosDoFluxo
  resumo: ResumoFluxo
  mensagem: string | null
  criadoPor: string | null
  criadoEm: string
  enviadoEm: string | null
  enviadoPor: string | null
}

export const ROTULO_DO_MODO: Record<SimuladorModo, string> = {
  pos_chaves: 'Pós-chaves',
  direto: 'Direto com a construtora',
  associativo: 'Associativo',
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

/** Monta o resumo congelado a partir dos números do modo. */
export function montarResumo(n: Omit<ResumoFluxo, 'linha'>): ResumoFluxo {
  const partes = [brl(n.valorTotal)]
  if (n.entradaTotal > 0) partes.push(`entrada ${brl(n.entradaTotal)}`)
  if (n.parcelasQtd > 0 && n.parcelaValor > 0) partes.push(`${n.parcelasQtd}× de ${brl(n.parcelaValor)}`)
  if (n.saldoFinanciar && n.saldoFinanciar > 0) partes.push(`financia ${brl(n.saldoFinanciar)}`)
  return { ...n, linha: partes.join(' · ') }
}

/**
 * Avisa o hospedeiro sempre que o conteúdo do relato muda — e só então.
 * A comparação é pelo conteúdo (texto), não pela identidade do objeto, que é
 * novo a cada renderização: sem isso o aviso dispararia em laço.
 */
export function useRelato<E>(
  onRelato: ((r: RelatoDoSimulador<E>) => void) | undefined,
  relato: RelatoDoSimulador<E>,
) {
  const assinatura = JSON.stringify(relato)
  useEffect(() => {
    if (onRelato) onRelato(JSON.parse(assinatura) as RelatoDoSimulador<E>)
  }, [assinatura, onRelato])
}
