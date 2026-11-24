import type { IndiceObra, Sistema } from './calc'

/**
 * O que o Simulador de fluxo conta ao Simulador de financiamento.
 * Só leitura: a calculadora nunca escreve no simulador de fluxo.
 */
export interface RepasseDoFluxo {
  valorImovel: number
  /** tudo o que o cliente paga à construtora até as chaves (valor de hoje) */
  pagoAteChaves: number
  /** 'YYYY-MM' — ausente no pós-chaves, que não tem data de entrega */
  entrega?: string
  indice?: IndiceObra
  /** % a.a. projetado no simulador de fluxo */
  indiceAnual?: number
}

/**
 * O estado do Simulador de financiamento, como é guardado na versão do fluxo.
 * Campo ausente = segue o Simulador de fluxo (ou o padrão). Campo presente = o
 * corretor mexeu e ele se soltou do simulador.
 */
export interface EstadoFinanciamento {
  bancoId: string | null
  sistema: Sistema
  valorImovel?: number
  pagoAteChaves?: number
  meses?: number
  indice?: IndiceObra
  indiceAnual?: number
  idade?: number | null
  prazo?: number | null
  taxaAnual?: number | null
  /** até 4 rendas brutas que se somam */
  rendas: number[]
  fgts: number
}

export const ESTADO_INICIAL: EstadoFinanciamento = {
  bancoId: null, sistema: 'sac', rendas: [0], fgts: 0,
}

/** Os números do financiamento congelados junto com a versão do fluxo. */
export interface ResumoFinanciamento {
  banco: string
  sistema: Sistema
  prazo: number
  taxaAnual: number
  saldoChaves: number
  financiado: number
  parcelaTotal: number
  rendaNecessaria: number
  rendaCliente?: number
  passa?: boolean
}
