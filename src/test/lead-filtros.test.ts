import { describe, it, expect } from 'vitest'
import {
  FILTROS_VAZIOS, FiltrosLead, ContextoFiltro,
  aplicarFiltros, passa, contarFiltros, intervaloEntrada, ordenar, normalizar,
} from '../modules/leads/leadFiltros'
import { diasSemContato, nivelContato, fraseContato } from '../modules/leads/contato'
import { computeNextAction } from '../modules/leads/nextAction'
import { Lead } from '../types'

/**
 * Filtros do funil e a régua de "tempo sem contato".
 *
 * O erro aqui é silencioso: filtro que esconde lead a mais faz o corretor
 * achar que o funil está limpo, e contagem que não bate com o resultado
 * ensina a desconfiar da tela. Todas as datas são locais, e o "agora" é fixo.
 */

// Sexta-feira, 25/09/2026, 10h (horário local).
const AGORA = new Date(2026, 8, 25, 10, 0).getTime()
const dia = (d: number, h = 12) => new Date(2026, 8, d, h, 0).toISOString()

function lead(extra: Partial<Lead> = {}): Lead {
  return {
    id: extra.id ?? 'l1',
    name: 'Fulano de Tal',
    phone: '+5547999123456',
    origin: 'meta_ads',
    funnelStage: 'followup',
    followupStep: 1,
    createdAt: dia(1),
    updatedAt: dia(1),
    ...extra,
  }
}

const ctx: ContextoFiltro = { intel: {}, agora: AGORA }
const f = (extra: Partial<FiltrosLead>): FiltrosLead => ({ ...FILTROS_VAZIOS, ...extra })

describe('tempo sem contato', () => {
  it('conta a partir do último contato registrado', () => {
    const l = lead({ lastContactAt: dia(22, 9) })
    expect(diasSemContato(l, AGORA)).toBe(3)
    expect(nivelContato(l, AGORA)).toBe('esfriando')
    expect(fraseContato(l, AGORA)).toBe('Último contato há 3 dias')
  })

  it('sem contato nenhum, o relógio corre desde a entrada — e a frase diz isso', () => {
    const l = lead({ createdAt: dia(10) })
    expect(nivelContato(l, AGORA)).toBe('parado')
    expect(fraseContato(l, AGORA)).toBe('Nenhum contato em 14 dias')
  })

  it('contato recente está em dia', () => {
    expect(nivelContato(lead({ lastContactAt: dia(24, 18) }), AGORA)).toBe('em_dia')
  })

  it('a linha de próxima ação usa a mesma régua — não a última nota do lead', () => {
    const l = lead({ createdAt: dia(1), lastContactAt: dia(20) })
    const next = computeNextAction(l, [])
    // Janela real de tempo: o teste roda "agora", então só confere o tom e a frase
    expect(next.text.startsWith('Último contato')).toBe(true)
    expect(['attention', 'critical']).toContain(next.urgency)
  })
})

describe('período de entrada', () => {
  it('semana vai de domingo a sábado', () => {
    const iv = intervaloEntrada({ entrada: 'semana', entradaDe: '', entradaAte: '' }, AGORA)!
    expect(new Date(iv.de).getDay()).toBe(0)
    expect(new Date(iv.de).getDate()).toBe(20)
    expect(new Date(iv.ate).getDate()).toBe(27)
  })

  it('"últimos 30 dias" e "há mais de 30 dias" cobrem o funil sem sobrepor', () => {
    const leads = [1, 5, 20, 24].map(d => lead({ id: `d${d}`, createdAt: dia(d) }))
      .concat(lead({ id: 'hoje', createdAt: dia(25, 8) }))
      .concat(lead({ id: 'limite', createdAt: new Date(2026, 7, 27, 0, 0).toISOString() }))
      .concat(lead({ id: 'ago', createdAt: new Date(2026, 7, 20).toISOString() }))
    const recentes = aplicarFiltros(leads, f({ entrada: '30d' }), ctx).map(l => l.id)
    const antigos  = aplicarFiltros(leads, f({ entrada: 'mais30' }), ctx).map(l => l.id)
    expect(recentes.length + antigos.length).toBe(leads.length)
    expect(recentes.filter(id => antigos.includes(id))).toEqual([])
    expect(antigos).toEqual(['ago'])
    expect(recentes).toContain('limite')
  })

  it('período personalizado inclui o dia final inteiro', () => {
    const l = lead({ createdAt: dia(15, 23) })
    expect(passa(l, f({ entrada: 'personalizado', entradaDe: '2026-09-10', entradaAte: '2026-09-15' }), ctx)).toBe(true)
    expect(passa(l, f({ entrada: 'personalizado', entradaDe: '2026-09-16', entradaAte: '' }), ctx)).toBe(false)
  })

  it('hoje pega só quem entrou hoje', () => {
    expect(passa(lead({ createdAt: dia(25, 8) }), f({ entrada: 'hoje' }), ctx)).toBe(true)
    expect(passa(lead({ createdAt: dia(24, 23) }), f({ entrada: 'hoje' }), ctx)).toBe(false)
  })
})

describe('facetas', () => {
  const base = [
    lead({ id: 'a', flagged: true, lastContactAt: dia(24) }),
    lead({ id: 'b', lastContactAt: dia(10), funnelStage: 'visita' }),
    lead({ id: 'c', createdAt: dia(20) }), // nunca contatado
    lead({ id: 'd', flagged: true, lastContactAt: dia(15), funnelStage: 'proposta' }),
  ]

  it('prioridade', () => {
    expect(aplicarFiltros(base, f({ prioridade: true }), ctx).map(l => l.id)).toEqual(['a', 'd'])
  })

  it('sem contato há mais de 7 dias e nunca contatado', () => {
    expect(aplicarFiltros(base, f({ semContato: '7' }), ctx).map(l => l.id)).toEqual(['b', 'd'])
    expect(aplicarFiltros(base, f({ semContato: 'nunca' }), ctx).map(l => l.id)).toEqual(['c'])
  })

  it('facetas diferentes se somam; valores da mesma faceta se alternam', () => {
    expect(aplicarFiltros(base, f({ etapas: ['visita', 'proposta'] }), ctx).map(l => l.id)).toEqual(['b', 'd'])
    expect(aplicarFiltros(base, f({ etapas: ['visita', 'proposta'], prioridade: true }), ctx).map(l => l.id)).toEqual(['d'])
  })

  it('no Kanban a etapa não filtra — as colunas já são as etapas', () => {
    const kanban = { ...ctx, ignorarEtapa: true }
    expect(aplicarFiltros(base, f({ etapas: ['visita'] }), kanban)).toHaveLength(4)
    expect(contarFiltros(f({ etapas: ['visita'] }), kanban)).toBe(0)
  })

  it('"exceto" dá a contagem de quem aparece ao ligar a opção', () => {
    const filtros = f({ prioridade: true, semContato: '7' })
    const semPrioridade = aplicarFiltros(base, filtros, ctx, 'prioridade')
    expect(semPrioridade.map(l => l.id)).toEqual(['b', 'd'])
  })
})

describe('busca', () => {
  it('ignora acento e maiúscula', () => {
    expect(normalizar('João')).toBe('joao')
    expect(passa(lead({ name: 'João Müller' }), f({ busca: 'joao muller' }), ctx)).toBe(true)
  })

  it('telefone por dígitos, com ou sem máscara', () => {
    expect(passa(lead(), f({ busca: '(47) 99912' }), ctx)).toBe(true)
    expect(passa(lead(), f({ busca: '4799' }), ctx)).toBe(true)
  })

  it('procura pelo nome que a tela mostra e pelo produto', () => {
    const c: ContextoFiltro = { ...ctx, nomeExibido: () => 'Maria Contato', nomeProduto: () => 'Porto Velas' }
    expect(passa(lead(), f({ busca: 'maria' }), c)).toBe(true)
    expect(passa(lead(), f({ busca: 'velas' }), c)).toBe(true)
  })
})

describe('ordenação', () => {
  it('mais tempo sem contato primeiro — nunca contatado conta desde a entrada', () => {
    const leads = [
      lead({ id: 'recente', lastContactAt: dia(24) }),
      lead({ id: 'antigo', lastContactAt: dia(5) }),
      lead({ id: 'nunca', createdAt: dia(12) }),
    ]
    expect(ordenar(leads, 'sem_contato', AGORA).map(l => l.id)).toEqual(['antigo', 'nunca', 'recente'])
  })

  it('reentrada não vista vence qualquer critério', () => {
    const leads = [
      lead({ id: 'velho', createdAt: dia(1) }),
      lead({ id: 'voltou', createdAt: dia(20), reentryAt: dia(24) }),
    ]
    expect(ordenar(leads, 'antigos', AGORA).map(l => l.id)).toEqual(['voltou', 'velho'])
  })
})
