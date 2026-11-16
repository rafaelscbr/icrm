import { describe as descrever, it, expect } from 'vitest'
import {
  leadsPorDia, mediaSemHoje, funilAgora, atencao, fraseDoCorretor, haQuanto, estaAtivo, rotuloDia,
  textoDoPrazo, prazoVencido,
} from '../modules/leads/dashboardLeads'
import type { PulseEvent } from '../modules/pulse/types'

const AGORA = new Date(2026, 10, 15, 15, 0, 0)          // 15/11/2026 15:00 local
const em = (d: number, h = 10) => new Date(2026, 10, d, h, 0, 0).toISOString()

descrever('dashboard de leads · leads por dia', () => {
  it('um ponto por dia, com zero nos dias sem lead, terminando em hoje', () => {
    const s = leadsPorDia([{ createdAt: em(15) }, { createdAt: em(15, 9) }, { createdAt: em(13) }], 4, AGORA)
    expect(s.map(p => p.data)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
    expect(s.map(p => p.n)).toEqual([0, 1, 0, 2])
  })
  it('lead fora da janela não entra', () => {
    expect(leadsPorDia([{ createdAt: em(1) }], 3, AGORA).reduce((a, p) => a + p.n, 0)).toBe(0)
  })
  it('a média ignora hoje, que ainda está em andamento', () => {
    expect(mediaSemHoje([{ data: 'a', n: 4 }, { data: 'b', n: 2 }, { data: 'c', n: 99 }])).toBe(3)
    expect(mediaSemHoje([{ data: 'c', n: 5 }])).toBeNull()
  })
  it('rótulo do eixo', () => {
    expect(rotuloDia('2026-11-08', false)).toBe('08/11')
    expect(rotuloDia('2026-11-15', true)).toBe('Hoje')
  })
})

descrever('dashboard de leads · funil agora', () => {
  const base = { discardReason: undefined, closedAt: undefined, averageTicket: 600_000 }
  it('conta só ativos por etapa; descartado e encerrado saem', () => {
    const f = funilAgora([
      { ...base, funnelStage: 'lead' },
      { ...base, funnelStage: 'visita' },
      { ...base, funnelStage: 'proposta', averageTicket: 400_000 },
      { ...base, funnelStage: 'visita', discardReason: 'sem_condicao' },
      { ...base, funnelStage: 'proposta', closedAt: em(10) },
      { ...base, funnelStage: 'proposta', closedAt: new Date(2026, 9, 20).toISOString() },   // mês passado
    ], AGORA)
    expect(f.ativos).toBe(3)
    expect(f.porEtapa).toMatchObject({ lead: 1, visita: 1, proposta: 1, atendimento: 0 })
    expect(f.vendasNoMes).toBe(1)
    expect(f.leadsEmNegociacao).toBe(2)
    expect(f.emNegociacao).toBe(1_000_000)
  })
})

descrever('dashboard de leads · atenção', () => {
  const agora = AGORA.getTime()
  const lead = (p: Record<string, unknown>) => ({
    funnelStage: 'lead', discardReason: undefined, closedAt: undefined, slaDueAt: undefined,
    firstContactAt: undefined, lastContactAt: undefined, stageChangedAt: undefined,
    createdAt: em(15, 8), reentryAt: undefined, reentrySeenAt: undefined, ...p,
  }) as Parameters<typeof atencao>[0][number] & { id?: string }

  it('aguardando 1º contato: com o prazo vencido OU ainda correndo, o mais urgente primeiro', () => {
    const a = atencao([
      lead({ id: 'vence-amanha', slaDueAt: em(16, 9) }),      // chegou fora do expediente
      lead({ id: 'atrasado', slaDueAt: em(15, 14) }),
      lead({ id: 'atendido', slaDueAt: em(15, 14), firstContactAt: em(15, 13) }),
      lead({ id: 'no-prazo', slaDueAt: em(15, 16) }),
      lead({ id: 'descartado', slaDueAt: em(15, 14), discardReason: 'x' }),
      lead({ id: 'sem-relogio' }),
    ], agora)
    expect(a.aguardandoPrimeiroContato.map(l => l.id)).toEqual(['atrasado', 'no-prazo', 'vence-amanha'])
  })
  it('texto do prazo: vencido, hoje e outro dia', () => {
    expect(prazoVencido(em(15, 14), agora)).toBe(true)
    expect(textoDoPrazo(em(15, 14), agora)).toBe('prazo venceu há 1 h')
    expect(textoDoPrazo(em(15, 18), agora)).toBe('prazo até 18:00')
    expect(textoDoPrazo(em(16, 9), agora)).toBe('prazo até seg 09:00')
  })
  it('esfriando: só etapas quentes, 2 dias ou mais sem contato, o mais antigo primeiro', () => {
    const a = atencao([
      lead({ id: 'frio', funnelStage: 'visita', lastContactAt: em(11) }),
      lead({ id: 'mais-frio', funnelStage: 'proposta', lastContactAt: em(5) }),
      lead({ id: 'quente', funnelStage: 'atendimento', lastContactAt: em(14) }),
      lead({ id: 'dois-dias', funnelStage: 'atendimento', lastContactAt: em(13, 14) }),
      lead({ id: 'followup', funnelStage: 'followup', lastContactAt: em(1) }),
    ], agora)
    expect(a.esfriando.map(l => l.id)).toEqual(['mais-frio', 'frio', 'dois-dias'])
  })
  it('reentrada não vista', () => {
    const a = atencao([
      lead({ id: 'nao-viu', reentryAt: em(15, 9) }),
      lead({ id: 'viu', reentryAt: em(15, 9), reentrySeenAt: em(15, 10) }),
      lead({ id: 'voltou-de-novo', reentryAt: em(15, 12), reentrySeenAt: em(15, 10) }),
    ], agora)
    expect(a.voltaram.map(l => l.id)).toEqual(['nao-viu', 'voltou-de-novo'])
  })
})

descrever('dashboard de leads · frases e tempo', () => {
  const ev = (p: Partial<PulseEvent>): PulseEvent => ({ id: '1', at: em(15), kind: 'interacao', ...p })
  it('tira o nome do corretor e começa com maiúscula', () => {
    expect(fraseDoCorretor(ev({ subTipo: 'whatsapp', leadNome: 'Amanda', produto: 'Greenview' })).texto)
      .toBe('Falou no WhatsApp com Amanda · Greenview')
    expect(fraseDoCorretor(ev({ kind: 'etapa', leadNome: 'Amanda', fromStage: 'atendimento', toStage: 'visita' })).texto)
      .toBe('Moveu Amanda → Visita')
    expect(fraseDoCorretor(ev({ kind: 'ligacao', subTipo: 'interessado', leadNome: 'Carlos' })).texto)
      .toBe('Despertou interesse em Carlos')
  })
  it('lead novo vira "recebeu o lead", com a origem', () => {
    const v = fraseDoCorretor(ev({ kind: 'lead_novo', leadNome: 'João', origem: 'meta_ads' }))
    expect(v.texto).toBe('Recebeu o lead João')
    expect(v.detalhe).toBe('Meta Ads')
  })
  it('frases sem sujeito passam intactas', () => {
    expect(fraseDoCorretor(ev({ kind: 'venda', leadNome: 'Greenview 302', valor: 600000 })).texto).toBe('Venda registrada — Greenview 302')
  })
  it('há quanto tempo', () => {
    const agora = AGORA.getTime()
    expect(haQuanto(new Date(agora - 20_000).toISOString(), agora)).toBe('agora')
    expect(haQuanto(new Date(agora - 4 * 60_000).toISOString(), agora)).toBe('há 4 min')
    expect(haQuanto(new Date(agora - 3 * 3_600_000).toISOString(), agora)).toBe('há 3 h')
    expect(haQuanto(new Date(agora - 26 * 3_600_000).toISOString(), agora)).toBe('ontem')
    expect(haQuanto(new Date(agora - 5 * 86_400_000).toISOString(), agora)).toBe('há 5 dias')
  })
  it('em atividade = agiu nos últimos 10 minutos', () => {
    const agora = AGORA.getTime()
    expect(estaAtivo(new Date(agora - 9 * 60_000).toISOString(), agora)).toBe(true)
    expect(estaAtivo(new Date(agora - 11 * 60_000).toISOString(), agora)).toBe(false)
    expect(estaAtivo(null, agora)).toBe(false)
  })
})
