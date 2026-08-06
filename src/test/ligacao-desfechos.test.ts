import { describe, it, expect } from 'vitest'
import {
  CALL_OUTCOMES, OUTCOMES_DISCADOR, OUTCOMES_POR_GRUPO, OUTCOME_BY_VALUE,
  contaParaMeta,
} from '../modules/prospeccao/ligacoes/config'
import type { CallOutcome } from '../types'

/**
 * Os grupos de desfecho da ligação.
 *
 * Vale teste porque a tela e o banco precisam concordar sobre a MESMA regra em
 * dois lugares: a coluna gerada `call_logs.conta_meta` (migração 072) e o
 * `contaParaMeta` daqui. Se divergirem, o corretor vê 9 de 10 na meta enquanto
 * o relatório do gestor diz 12 — e aí ninguém acredita em nenhum dos dois.
 */

/** Espelho literal do que o banco calcula em `conta_meta`. */
const FORA_DA_META: CallOutcome[] = ['numero_invalido', 'sem_whatsapp', 'telefone_desligado']

describe('grupos de desfecho', () => {
  it('todo desfecho da botoeira pertence a um grupo mostrado na tela', () => {
    const nosGrupos = OUTCOMES_POR_GRUPO.flatMap(g => g.opcoes.map(o => o.value))
    expect([...nosGrupos].sort()).toEqual([...OUTCOMES_DISCADOR.map(o => o.value)].sort())
  })

  it('nenhum grupo fica vazio — título sem botão é ruído', () => {
    for (const g of OUTCOMES_POR_GRUPO) {
      expect(g.opcoes.length, `grupo ${g.value}`).toBeGreaterThan(0)
    }
  })

  it('`discou` nunca é botão: é a tentativa esperando desfecho', () => {
    expect(OUTCOME_BY_VALUE.discou.noDiscador).toBe(false)
  })
})

describe('o que conta para a meta do dia', () => {
  it('só o grupo "não foi possível ligar" fica de fora', () => {
    const fora = CALL_OUTCOMES.filter(o => !contaParaMeta(o.value)).map(o => o.value)
    expect([...fora].sort()).toEqual([...FORA_DA_META].sort())
  })

  it('tentativa que virou ligação conta, mesmo sem ninguém atender', () => {
    expect(contaParaMeta('nao_atendeu')).toBe(true)
    expect(contaParaMeta('caixa_postal')).toBe(true)
    // Alcançou a pessoa: o esforço valeu, a conversa é que não houve.
    expect(contaParaMeta('atendeu_desligou')).toBe(true)
  })

  it('número morto não vira meta batida', () => {
    expect(contaParaMeta('numero_invalido')).toBe(false)
    expect(contaParaMeta('sem_whatsapp')).toBe(false)
    expect(contaParaMeta('telefone_desligado')).toBe(false)
  })
})

describe('quem é "falou"', () => {
  it('exige conversa — atendeu e desligou não entra', () => {
    const falou = CALL_OUTCOMES.filter(o => o.falou).map(o => o.value)
    expect([...falou].sort()).toEqual(
      ['interessado', 'nao_perturbe', 'pediu_retorno', 'sem_interesse'],
    )
    expect(OUTCOME_BY_VALUE.atendeu_desligou.falou).toBe(false)
  })

  it('todo desfecho de conversa está no grupo "falou"', () => {
    for (const o of CALL_OUTCOMES.filter(x => x.falou)) {
      expect(o.grupo, o.value).toBe('falou')
    }
  })
})
