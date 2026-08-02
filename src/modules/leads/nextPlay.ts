import { LeadIntel, Temperature, Fit } from '../../lib/intelligence'
import { Lead } from '../../types'

/**
 * A jogada comercial.
 *
 * O `nextAction` que já existe responde "o que é urgente" — SLA vencendo,
 * tarefa atrasada, silêncio de X dias. Aqui a pergunta é outra: "qual é a
 * jogada certa para este lead agora?". Urgência manda no QUANDO; isto manda
 * no O QUÊ.
 *
 * A regra que faz a diferença entre ser usado e ser ignorado: citar o motivo
 * específico. "Faça follow-up" o corretor pula. "A trava é a entrada — ele tem
 * até R$ 10 mil e o produto pede R$ 20 mil; vale testar o Porto Velas" ele usa.
 */

export interface Play {
  title: string
  detail: string
  tone: 'urgent' | 'opportunity' | 'neutral'
}

/** Primeiro motivo de um tipo de trava, para citar o número certo. */
function trava(intel: LeadIntel, campo: string): string | null {
  const r = intel.fitOrigin?.reasons?.find(x => x.field === campo && x.fit === 'dificil')
  return r?.text ?? null
}

export function computeNextPlay(lead: Lead, intel?: LeadIntel): Play | null {
  if (!intel) return null

  const t: Temperature = intel.temperature
  const fit: Fit | undefined = intel.fitOrigin?.fit
  const alt = intel.fitBest && intel.fitBest.developmentId !== intel.fitOrigin?.developmentId
    ? intel.fitBest : undefined
  const etapa = lead.funnelStage

  if (t === 'ganho') return null

  // ── Reaquecendo: o estado mais valioso do funil ──────────────────────────
  if (t === 'reaquecendo') {
    return {
      title: 'Voltou a se mexer — retomar hoje',
      detail: alt
        ? `Deu sinal novo depois de um tempo parado. O ${alt.name} cabe no perfil dele — vale abrir por aí.`
        : 'Deu sinal novo depois de um tempo parado. É o melhor momento de retomar, antes de esfriar de novo.',
      tone: 'opportunity',
    }
  }

  // ── Preencheu outro formulário estando em atendimento ────────────────────
  // Continua procurando — só não com você.
  const outroForm = intel.tempReasons.some(r => /formulários preenchidos/.test(r.text))
  if (outroForm && (etapa === 'followup' || etapa === 'atendimento')) {
    return {
      title: 'Continua procurando — reganhar',
      detail: 'Preencheu outro formulário enquanto estava com você. O interesse não caiu; a conversa é que parou. Retomar com produto novo na mão.',
      tone: 'urgent',
    }
  }

  // ── Sem resposta a 3+ tentativas ─────────────────────────────────────────
  if (lead.followupStep >= 3 && (etapa === 'lead' || etapa === 'followup')) {
    return {
      title: 'Trocar a abordagem, não repetir',
      detail: `${lead.followupStep} tentativas sem resposta. Mais uma mensagem igual não muda o resultado — trocar canal, horário ou motivo do contato.`,
      tone: 'urgent',
    }
  }

  // ── Quente com trava: procurar o produto certo ───────────────────────────
  if ((t === 'quente' || t === 'morno') && fit === 'dificil') {
    const t1 = trava(intel, 'entrada') ?? trava(intel, 'renda') ?? trava(intel, 'objetivo')
    return {
      title: alt ? `Está no produto errado — testar ${alt.name}` : 'Tem trava no produto de origem',
      detail: alt
        ? `${t1 ?? 'Não cabe no produto de origem'}. Mas o ${alt.name} cabe no perfil — apresentar como alternativa.`
        : `${t1 ?? 'Não cabe nas condições atuais'}. Nenhum produto da carteira encaixa hoje — nutrir pela trava.`,
      tone: 'opportunity',
    }
  }

  // ── Visita feita e parou ─────────────────────────────────────────────────
  const fezVisita = intel.tempReasons.some(r => /Compareceu na visita/.test(r.text))
  const parado    = intel.tempReasons.some(r => /dias sem sinal novo/.test(r.text))
  if (fezVisita && parado) {
    return {
      title: 'Visitou e sumiu — achar a trava real',
      detail: 'Quem visita e some quase sempre travou no preço ou na condição. Vale buscar fluxo melhor ou apresentar unidade de outro valor.',
      tone: 'urgent',
    }
  }

  // ── Morno em atendimento: converter em visita ────────────────────────────
  if (etapa === 'atendimento') {
    return {
      title: 'Converter em visita ao decorado',
      detail: 'Atendimento que não vira visita esfria. Criar conexão, entender o que ele procura de verdade e propor o decorado ou uma videochamada.',
      tone: 'neutral',
    }
  }

  // ── Compatível e quente: prioridade máxima ───────────────────────────────
  if (t === 'quente' && (fit === 'ideal' || fit === 'possivel')) {
    return {
      title: 'Prioridade do dia',
      detail: `Está se movendo e cabe no ${intel.fitOrigin?.name ?? 'produto'}. É o lead com mais chance de fechar agora.`,
      tone: 'opportunity',
    }
  }

  // ── Faltam dados e o lead está ativo ─────────────────────────────────────
  if (fit === 'sem_dados' && (t === 'quente' || t === 'morno' || t === 'novo')) {
    return {
      title: 'Descobrir só o que falta',
      detail: 'Sem renda e entrada não dá para saber que produto oferecer. Duas perguntas na conversa resolvem — e dá para anotar aqui no perfil.',
      tone: 'neutral',
    }
  }

  // ── Compatível mas frio: reativar pelo produto ───────────────────────────
  if (t === 'frio' && (fit === 'ideal' || fit === 'possivel')) {
    return {
      title: 'Cabe no produto, mas esfriou',
      detail: `O perfil serve para o ${intel.fitOrigin?.name ?? 'produto'}. Vale uma reativação com novidade concreta: condição, unidade ou lançamento.`,
      tone: 'opportunity',
    }
  }

  return null
}
