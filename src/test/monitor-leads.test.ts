import { describe, it, expect } from 'vitest'
import {
  recebidosHoje, minutosUteis, mediana,
  velocidadeDeResposta, qualidadePorOrigem, atividadePorHora, janelaDoDia,
  inicioDoPeriodo, posicaoNoDia, textoDeMinutos, producaoAte, alertasDaSala, expedienteDeHoje,
} from '../modules/leads/monitorLeads'
import type { Atribuicao, EventoDoDia } from '../modules/leads/monitorLeads'
import type { SlaDia } from '../types'

// Segunda, 16/11/2026, 14:00 (horário local)
const AGORA = new Date(2026, 10, 16, 14, 0, 0)
const t = (h: number, m = 0, dia = 16) => new Date(2026, 10, dia, h, m, 0).toISOString()

// seg–sex 9h–18h, sáb 9h–13h, domingo fora — a agenda padrão do rodízio
const AGENDA: SlaDia[] = [
  { on: false, start: '09:00', end: '13:00' },
  ...Array.from({ length: 5 }, () => ({ on: true, start: '09:00', end: '18:00' })),
  { on: true, start: '09:00', end: '13:00' },
]

let seq = 0
const at = (leadId: string, to: string, createdAt: string, extra: Partial<Atribuicao> = {}): Atribuicao => ({
  id: `a${++seq}`, leadId, fromBrokerId: null, toBrokerId: to, reason: 'campaign_routing',
  slaDueAt: null, createdAt, ...extra,
})

describe('o que cada um recebeu hoje', () => {
  it('conta o que cada um recebeu hoje, separando roleta de transferência', () => {
    const r = recebidosHoje([
      at('l1', 'dio', t(9)),
      at('l2', 'dio', t(10), { reason: 'round_robin' }),
      at('l3', 'dio', t(11), { reason: 'sla_recapture' }),
      at('l4', 'rya', t(12), { reason: 'manual' }),
      at('l5', 'dio', t(9, 0, 15)),            // ontem: não entra
    ], AGORA)
    expect(r.get('dio')).toEqual({ daRoleta: 2, porTransferencia: 1, manual: 0, total: 3 })
    expect(r.get('rya')).toEqual({ daRoleta: 0, porTransferencia: 0, manual: 1, total: 1 })
  })
})

describe('minutos úteis', () => {
  const ms = (h: number, m = 0, dia = 16) => new Date(2026, 10, dia, h, m, 0).getTime()

  it('dentro do expediente é a diferença simples', () => {
    expect(minutosUteis(ms(10), ms(10, 7), AGENDA)).toBe(7)
  })

  it('lead da noite atendido de manhã esperou só os minutos do expediente', () => {
    // chegou segunda 22h, atendido terça 9h05
    expect(minutosUteis(ms(22), ms(9, 5, 17), AGENDA)).toBe(5)
  })

  it('domingo não conta; sábado conta só até as 13h', () => {
    // sábado 14/11 12h30 → segunda 16/11 9h10 = 30 min de sábado + 10 de segunda
    expect(minutosUteis(ms(12, 30, 14), ms(9, 10, 16), AGENDA)).toBe(40)
  })

  it('fim antes do início dá zero', () => {
    expect(minutosUteis(ms(10), ms(9), AGENDA)).toBe(0)
  })

  it('mediana', () => {
    expect(mediana([])).toBeNull()
    expect(mediana([5, 1, 9])).toBe(5)
    expect(mediana([4, 2])).toBe(3)
  })

  it('escreve a duração como gente', () => {
    expect(textoDeMinutos(null)).toBe('—')
    expect(textoDeMinutos(0.4)).toBe('menos de 1 min')
    expect(textoDeMinutos(4.4)).toBe('4 min')
    expect(textoDeMinutos(80)).toBe('1h20')
    expect(textoDeMinutos(120)).toBe('2 h')
  })
})

describe('velocidade de resposta', () => {
  const desde = inicioDoPeriodo('hoje', AGORA)
  const agora = AGORA.getTime()

  it('cada passagem responde pelo prazo que teve', () => {
    const atribuicoes = [
      // l1: Dionata atendeu em 4 min, dentro do prazo
      at('l1', 'dio', t(9), { slaDueAt: t(9, 10) }),
      // l2: Dionata deixou vencer, foi para o Ryan, que atendeu em 12 min (fora do prazo de 10)
      at('l2', 'dio', t(10), { slaDueAt: t(10, 10) }),
      at('l2', 'rya', t(10, 10), { slaDueAt: t(10, 20), reason: 'sla_recapture', fromBrokerId: 'dio' }),
      // l3: Ryan ainda não atendeu, prazo correndo
      at('l3', 'rya', t(13, 55), { slaDueAt: t(14, 5) }),
      // l4: Ryan não atendeu e o prazo já venceu
      at('l4', 'rya', t(13), { slaDueAt: t(13, 10) }),
    ]
    const leads = new Map([
      ['l1', { firstContactAt: t(9, 4) }],
      ['l2', { firstContactAt: t(10, 22) }],
      ['l3', {}],
      ['l4', {}],
    ])
    const { linhas, total } = velocidadeDeResposta(atribuicoes, leads, desde, agora, AGENDA)
    const dio = linhas.find(l => l.brokerId === 'dio')!
    const rya = linhas.find(l => l.brokerId === 'rya')!

    expect(dio).toMatchObject({ recebidos: 2, atendidos: 1, noPrazo: 1, foraDoPrazo: 0, perdidos: 1, medianaMin: 4 })
    expect(rya).toMatchObject({ recebidos: 3, atendidos: 1, noPrazo: 0, foraDoPrazo: 1, perdidos: 0, aguardando: 1, vencidos: 1, medianaMin: 12 })
    expect(total).toMatchObject({ recebidos: 5, atendidos: 2, perdidos: 1, aguardando: 1, vencidos: 1, medianaMin: 8 })
  })

  it('ignora o que não tinha prazo a cumprir', () => {
    const atribuicoes = [
      // repassado à mão pelo admin: quem passou não "perdeu"
      at('m1', 'dio', t(9), { slaDueAt: t(9, 10) }),
      at('m1', 'rya', t(9, 30), { reason: 'manual', fromBrokerId: 'dio' }),
      // já tinha contato antes de chegar nesta mão
      at('m2', 'rya', t(11), { reason: 'manual' }),
      // lead apagado
      at('m3', 'dio', t(12)),
      // de ontem: fora do período
      at('m4', 'dio', t(9, 0, 15), { slaDueAt: t(9, 10, 15) }),
    ]
    const leads = new Map([
      ['m1', { firstContactAt: t(9, 40) }],
      ['m2', { firstContactAt: t(10) }],
      ['m4', { firstContactAt: t(9, 3, 15) }],
    ])
    const { linhas, total } = velocidadeDeResposta(atribuicoes, leads, desde, agora, AGENDA)
    expect(total.recebidos).toBe(1)                       // só a passagem do m1 para o Ryan
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ brokerId: 'rya', atendidos: 1, medianaMin: 10 })
  })

  it('a passagem conta no dia do desfecho, não no dia em que o lead foi entregue', () => {
    const atribuicoes = [
      // chegou domingo à noite para o Ryan, venceu segunda 9h10 e foi para o Dionata
      at('n1', 'rya', t(19, 3, 15), { slaDueAt: t(9, 10) }),
      at('n1', 'dio', t(9, 10), { slaDueAt: t(9, 20), reason: 'sla_recapture', fromBrokerId: 'rya' }),
      // chegou domingo e foi atendido só hoje, dentro do prazo
      at('n2', 'dio', t(20, 0, 15), { slaDueAt: t(9, 10) }),
      // chegou domingo e continua sem contato: é pendência de agora
      at('n3', 'rya', t(21, 0, 15), { slaDueAt: t(9, 10) }),
      // chegou sexta, perdeu no sábado: não é de hoje
      at('n4', 'rya', t(17, 55, 13), { slaDueAt: t(9, 5, 14) }),
      at('n4', 'dio', t(9, 5, 14), { slaDueAt: t(9, 15, 14), reason: 'sla_recapture', fromBrokerId: 'rya' }),
    ]
    const leads = new Map([
      ['n1', { firstContactAt: t(9, 11) }],
      ['n2', { firstContactAt: t(9, 6) }],
      ['n3', {}],
      ['n4', { firstContactAt: t(9, 8, 14) }],
    ])
    const { linhas } = velocidadeDeResposta(atribuicoes, leads, desde, agora, AGENDA)
    expect(linhas.find(l => l.brokerId === 'rya')).toMatchObject({ recebidos: 2, perdidos: 1, vencidos: 1, atendidos: 0 })
    // n1: 1 min depois de receber · n2: 6 min úteis (o domingo não conta)
    expect(linhas.find(l => l.brokerId === 'dio')).toMatchObject({ recebidos: 2, atendidos: 2, noPrazo: 2, perdidos: 0, medianaMin: 3.5 })
  })

  it('lead descartado sem contato não fica "aguardando" para sempre', () => {
    const { total } = velocidadeDeResposta(
      [at('d1', 'dio', t(9), { slaDueAt: t(9, 10) })],
      new Map([['d1', { discardReason: 'telefone_invalido' as never }]]),
      desde, agora, AGENDA,
    )
    expect(total).toMatchObject({ recebidos: 1, atendidos: 0, aguardando: 0, vencidos: 0 })
  })

  it('sem a agenda do rodízio não inventa tempo', () => {
    const { total } = velocidadeDeResposta(
      [at('s1', 'dio', t(9), { slaDueAt: t(9, 10) })],
      new Map([['s1', { firstContactAt: t(9, 4) }]]),
      desde, agora, null,
    )
    expect(total).toMatchObject({ atendidos: 1, noPrazo: 1, medianaMin: null })
  })
})

describe('qualidade por origem', () => {
  const lead = (origin: string, propertyName: string | undefined, funnelStage: string, extra: object = {}) =>
    ({ origin, propertyName, funnelStage, createdAt: t(10), ...extra }) as never

  it('agrupa por origem e produto e conta onde cada lead está hoje', () => {
    const linhas = qualidadePorOrigem([
      lead('meta_ads', 'Greenview', 'lead'),
      lead('meta_ads', 'Greenview', 'atendimento'),
      lead('meta_ads', 'Greenview', 'followup', { discardReason: 'nunca_respondeu' }),
      lead('meta_ads', 'Greenview', 'followup', { discardReason: 'nunca_respondeu' }),
      lead('meta_ads', 'Greenview', 'atendimento', { discardReason: 'sem_condicao' }),
      lead('meta_ads', 'Rogga', 'venda', { closedAt: t(12) }),
      lead('site', undefined, 'visita'),
      lead('meta_ads', 'Greenview', 'lead', { createdAt: t(10, 0, 1) }),   // fora do período
    ], inicioDoPeriodo('7', AGORA))

    expect(linhas[0]).toMatchObject({
      origem: 'meta_ads', produto: 'Greenview', chegaram: 5,
      avancaram: 1, emAberto: 1, descartados: 3, motivoTop: { slug: 'nunca_respondeu', n: 2 },
    })
    expect(linhas.find(l => l.produto === 'Rogga')).toMatchObject({ chegaram: 1, avancaram: 1, descartados: 0, motivoTop: null })
    expect(linhas.find(l => l.origem === 'site')).toMatchObject({ produto: null, chegaram: 1, avancaram: 1 })
    expect(linhas).toHaveLength(3)
  })
})

describe('ritmo do dia e períodos', () => {
  it('conta os eventos de hoje por hora', () => {
    const horas = atividadePorHora([{ at: t(9, 5) }, { at: t(9, 50) }, { at: t(13) }, { at: t(9, 0, 15) }], AGORA)
    expect(horas[9]).toBe(2)
    expect(horas[13]).toBe(1)
    expect(horas.reduce((s, n) => s + n, 0)).toBe(3)
  })

  it('mostra do expediente até agora, esticando se houve atividade fora', () => {
    const vazio = Array<number>(24).fill(0)
    expect(janelaDoDia(vazio, AGORA)).toEqual({ de: 8, ate: 19 })
    const cedo = [...vazio]; cedo[6] = 1; cedo[21] = 2
    expect(janelaDoDia(cedo, AGORA)).toEqual({ de: 6, ate: 21 })
  })

  it('coloca cada registro no ponto certo da linha do dia', () => {
    // janela 8h–20h (ate = 19): 12 horas
    expect(posicaoNoDia(t(8), 8, 19, AGORA)).toBe(0)
    expect(posicaoNoDia(t(14), 8, 19, AGORA)).toBe(50)
    expect(posicaoNoDia(t(20), 8, 19, AGORA)).toBe(100)
    expect(posicaoNoDia(t(7, 59), 8, 19, AGORA)).toBeNull()     // antes da janela
    expect(posicaoNoDia(t(10, 0, 15), 8, 19, AGORA)).toBeNull() // ontem
  })

  it('o período começa à meia-noite', () => {
    expect(new Date(inicioDoPeriodo('hoje', AGORA))).toEqual(new Date(2026, 10, 16))
    expect(new Date(inicioDoPeriodo('7', AGORA))).toEqual(new Date(2026, 10, 10))
    expect(new Date(inicioDoPeriodo('30', AGORA))).toEqual(new Date(2026, 9, 18))
  })
})

describe('ontem até esta hora', () => {
  const ev = (brokerId: string | null, tipo: EventoDoDia['tipo'], h: number, m = 0): EventoDoDia =>
    ({ brokerId, tipo, at: t(h, m, 15) })
  const eventos = [
    ev('dio', 'interacao', 9), ev('dio', 'interacao', 10), ev('dio', 'interacao', 16),
    ev('dio', 'avanco', 11), ev('dio', 'ligacao', 15), ev('rya', 'visita', 13),
    ev(null, 'interacao', 9),
  ]

  it('conta só o que já tinha acontecido até a mesma hora', () => {
    const ate14 = producaoAte(eventos, new Date(2026, 10, 15, 14, 0).getTime())
    expect(ate14.get('dio')).toEqual({ interacoes: 2, ligacoes: 0, avancos: 1, visitas: 0 })
    expect(ate14.get('rya')).toEqual({ interacoes: 0, ligacoes: 0, avancos: 0, visitas: 1 })
  })

  it('até o fim do dia é o dia inteiro', () => {
    const tudo = producaoAte(eventos, new Date(2026, 10, 16, 0, 0).getTime())
    expect(tudo.get('dio')).toEqual({ interacoes: 3, ligacoes: 1, avancos: 1, visitas: 0 })
    expect(tudo.size).toBe(2)          // registro sem corretor não entra
  })
})

describe('alertas da sala', () => {
  const agora = AGORA.getTime()       // segunda, 14:00 — dentro do expediente 9h–18h
  const corretor = (id: string, nome: string, ultima: string | null, emPausa = false) =>
    ({ id, nome, ultimaAtividadeAt: ultima, emPausa })

  it('sem nada fora do esperado, não há alerta', () => {
    const r = alertasDaSala({
      agora, agenda: AGENDA,
      corretores: [corretor('dio', 'Dionata Alves', t(13, 30)), corretor('rya', 'Ryan Maciel', t(12, 45))],
      esperando: [{ id: 'l1', nome: 'Ana', slaDueAt: t(14, 20) }],
    })
    expect(r).toEqual([])
  })

  it('prazo vencido vem primeiro, em vermelho, e abre o lead', () => {
    const r = alertasDaSala({
      agora, agenda: AGENDA,
      corretores: [corretor('dio', 'Dionata Alves', t(13, 55))],
      esperando: [
        { id: 'l2', nome: 'Bia', corretor: 'Dionata Alves', slaDueAt: t(14, 3) },
        { id: 'l1', nome: 'Ana', corretor: 'Ryan Maciel', slaDueAt: t(13, 40) },
      ],
    })
    expect(r[0]).toMatchObject({ gravidade: 'risco', leadId: 'l1', texto: 'Ana está com o prazo de 1º contato vencido há 20 min — com Ryan' })
    expect(r[1]).toMatchObject({ gravidade: 'atencao', leadId: 'l2', texto: 'Bia vence o prazo de 1º contato em 3 min — com Dionata' })
  })

  it('vários vencidos viram um alerta só', () => {
    const r = alertasDaSala({
      agora, agenda: AGENDA, corretores: [],
      esperando: [{ id: 'a', nome: 'A', slaDueAt: t(13) }, { id: 'b', nome: 'B', slaDueAt: t(13, 30) }],
    })
    expect(r).toHaveLength(1)
    expect(r[0].texto).toBe('2 leads com o prazo de 1º contato vencido')
  })

  it('corretor parado há 90 min no expediente vira alerta; em pausa, não', () => {
    const r = alertasDaSala({
      agora, agenda: AGENDA,
      corretores: [
        corretor('dio', 'Dionata Alves', t(12, 20)),          // 1h40 parado
        corretor('rya', 'Ryan Maciel', t(12, 40)),            // 1h20: ainda não
        corretor('ana', 'Ana Lima', null),                    // nada hoje, 5h de expediente
        corretor('leo', 'Leo Paz', t(11), true),              // em pausa
        corretor('bia', 'Bia Reis', t(17, 0, 15)),            // último registro foi ontem
      ],
      esperando: [],
    })
    expect(r.map(a => a.texto)).toEqual([
      'Dionata está sem registro há 1h40',
      'Ana ainda não registrou nada hoje',
      'Bia ainda não registrou nada hoje',
    ])
  })

  it('fora do expediente ninguém está "parado"', () => {
    const noite = new Date(2026, 10, 16, 21, 0).getTime()
    const domingo = new Date(2026, 10, 15, 11, 0).getTime()
    const corretores = [corretor('dio', 'Dionata Alves', t(12))]
    expect(alertasDaSala({ agora: noite, agenda: AGENDA, corretores, esperando: [] })).toEqual([])
    expect(alertasDaSala({ agora: domingo, agenda: AGENDA, corretores, esperando: [] })).toEqual([])
    expect(alertasDaSala({ agora, agenda: null, corretores, esperando: [] })).toEqual([])   // agenda não carregou
    expect(expedienteDeHoje(new Date(domingo), AGENDA)).toBeNull()
  })

  it('avisa quando todos estão em pausa', () => {
    const r = alertasDaSala({
      agora, agenda: AGENDA,
      corretores: [corretor('dio', 'Dionata Alves', t(13), true), corretor('rya', 'Ryan Maciel', t(13), true)],
      esperando: [],
    })
    expect(r).toHaveLength(1)
    expect(r[0].chave).toBe('todos-em-pausa')
  })
})
