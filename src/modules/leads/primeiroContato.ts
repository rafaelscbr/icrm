/**
 * Primeiro contato com o lead (25/11/2026, migração 114).
 *
 * Quando o corretor chama o lead pela PRIMEIRA vez (Chamar, WhatsApp ou Ligar),
 * um popup pergunta o que aconteceu. Serve para medir os leads (de X que
 * entraram, quantos atendem, em quantos deixamos texto ou áudio, quantos têm
 * número que não existe) e o desempenho do corretor. Combinado com o Rafael:
 *   • só na 1ª chamada — grava uma vez e não muda mais;
 *   • a pergunta de potencial só aparece na LIGAÇÃO ATENDIDA;
 *   • número não existe → descarta como telefone_invalido;
 *   • tem potencial → oferece qualificar (o Meta recebe o aviso).
 *
 * Aqui fica a regra e a fila do popup; o desenho está em PrimeiroContatoModal.
 */

import { create } from 'zustand'
import type { CanalPrimeiroContato, Lead, PotencialLead, ResultadoPrimeiroContato } from '../../types'
import { ORDEM_RESULTADO } from './safra'
import type { ResumoContato } from './safra'

export const NOME_CANAL: Record<CanalPrimeiroContato, string> = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
}

export const RESULTADOS: { valor: ResultadoPrimeiroContato; nome: string; nota: string }[] = [
  { valor: 'atendeu',         nome: 'Atendeu',                   nota: 'conversamos' },
  { valor: 'nao_atendeu',     nome: 'Não atendeu',               nota: 'sem deixar recado' },
  { valor: 'mensagem_texto',  nome: 'Deixei mensagem de texto',  nota: 'não atendeu, mandei texto' },
  { valor: 'mensagem_audio',  nome: 'Deixei áudio',              nota: 'não atendeu, mandei áudio' },
  { valor: 'numero_invalido', nome: 'Número não existe',         nota: 'o lead é descartado' },
]

export const NOME_RESULTADO = Object.fromEntries(RESULTADOS.map(r => [r.valor, r.nome])) as Record<ResultadoPrimeiroContato, string>

export const POTENCIAIS: { valor: PotencialLead; nome: string; nota: string }[] = [
  { valor: 'potencial',     nome: 'Tem potencial', nota: 'pode comprar' },
  { valor: 'curioso',       nome: 'Curioso',       nota: 'só olhando' },
  { valor: 'sem_potencial', nome: 'Sem potencial', nota: 'não tem condição ou perfil' },
]

export const NOME_POTENCIAL = Object.fromEntries(POTENCIAIS.map(p => [p.valor, p.nome])) as Record<PotencialLead, string>

/** A pergunta de potencial: só na ligação atendida. */
export function perguntaPotencial(canal: CanalPrimeiroContato | null, resultado: ResultadoPrimeiroContato | null): boolean {
  return canal === 'ligacao' && resultado === 'atendeu'
}

/**
 * Este clique é a 1ª chamada do lead? Olha o lead ANTES de registrar o clique:
 * ainda em "Novo", sem contato nenhum e sem resultado gravado.
 */
export function ehPrimeiraChamada(lead: Lead): boolean {
  return !lead.firstContactResult && !lead.firstContactAt && lead.funnelStage === 'lead'
    && !lead.discardReason && !lead.closedAt
}

/**
 * A partir de quando o popup existe: 1º contato feito depois disto e sem
 * resultado = pendente (o corretor fechou o popup ou a página caiu) — o popup
 * volta. Leads chamados antes ficam como "sem registro" nas métricas.
 */
export const INICIO_PRIMEIRO_CONTATO = '2026-11-26T00:00:00-03:00'

export function pendentesDoCorretor(leads: Lead[], eu: string | null | undefined): Lead[] {
  if (!eu) return []
  const inicio = new Date(INICIO_PRIMEIRO_CONTATO).getTime()
  return leads.filter(l =>
    l.brokerId === eu && !l.firstContactResult && !l.discardReason && !l.closedAt &&
    !!l.firstContactAt && new Date(l.firstContactAt).getTime() >= inicio)
}

// ── A fila do popup ───────────────────────────────────────────────────────────

interface Pedido { leadId: string; canal: CanalPrimeiroContato }

interface PrimeiroContatoStore {
  atual: Pedido | null
  /** leads que o corretor deixou para responder depois nesta sessão */
  adiados: string[]
  abrir: (leadId: string, canal: CanalPrimeiroContato) => void
  fechar: () => void
  adiar: () => void
}

export const usePrimeiroContatoStore = create<PrimeiroContatoStore>((set, get) => ({
  atual: null,
  adiados: [],
  abrir: (leadId, canal) => set({ atual: { leadId, canal }, adiados: get().adiados.filter(id => id !== leadId) }),
  fechar: () => set({ atual: null }),
  adiar: () => {
    const a = get().atual
    set({ atual: null, adiados: a ? [...get().adiados, a.leadId] : get().adiados })
  },
}))

/** Chame no clique de contato, ANTES de registrar: abre o popup se for a 1ª chamada. */
export function abrirSePrimeiraChamada(lead: Lead, canal: CanalPrimeiroContato) {
  if (ehPrimeiraChamada(lead)) usePrimeiroContatoStore.getState().abrir(lead.id, canal)
}

/** Uma linha para a ficha: "Ligação · Atendeu · Tem potencial". */
export function resumoPrimeiroContato(lead: Lead): string | null {
  if (!lead.firstContactResult) return null
  return [
    lead.firstContactChannel ? NOME_CANAL[lead.firstContactChannel] : null,
    NOME_RESULTADO[lead.firstContactResult],
    lead.firstContactPotential ? NOME_POTENCIAL[lead.firstContactPotential] : null,
  ].filter(Boolean).join(' · ')
}

/** A cor de cada resultado nas barras (aba Conversão, dashboard e Pulse). */
export const COR_RESULTADO: Record<ResultadoPrimeiroContato, string> = {
  atendeu: 'bg-success', nao_atendeu: 'bg-t4', mensagem_texto: 'bg-brand',
  mensagem_audio: 'bg-brand-fill', numero_invalido: 'bg-error',
}

export const totalDoCanal = (r: ResumoContato, canal: CanalPrimeiroContato) =>
  ORDEM_RESULTADO.reduce((a, k) => a + r.porCanal[canal][k], 0)
