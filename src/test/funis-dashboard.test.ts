import { describe, it, expect } from 'vitest'
import {
  comparavel, dinheiroDaVenda, inicioDoPeriodo, montarFunis, OUTROS, produtoDaVenda,
} from '../modules/dashboard/funis'
import type { FunilSafra } from '../modules/leads/safra'
import type { Lead, Sale } from '../types'

const lead = (p: Partial<Lead>): Lead => ({
  id: Math.random().toString(36).slice(2), name: 'x', phone: '1', origin: 'meta_ads',
  funnelStage: 'atendimento', followupStep: 0, createdAt: '2026-11-01T12:00:00Z', ...p,
} as Lead)

const venda = (p: Partial<Sale>): Sale => ({
  id: Math.random().toString(36).slice(2), clientId: 'c', propertyName: 'Porto Velas', date: '2026-11-10',
  value: 600_000, type: 'off_plan', commissionPct: 5, brokerPct: 40, createdAt: '', ...p,
})

describe('período', () => {
  it('mês começa no dia 1; 3 meses volta três meses; tudo é null', () => {
    const hoje = new Date(2026, 10, 23)
    expect(inicioDoPeriodo('mes', hoje)).toBe('2026-11-01')
    expect(inicioDoPeriodo('3m', hoje)).toBe('2026-08-24')
    expect(inicioDoPeriodo('tudo', hoje)).toBeNull()
  })
})

describe('produto da venda lançada sem lead', () => {
  const candidatos = [
    { chave: 'lago di san pellegrino', nomes: ['Lago di San Pellegrino', 'sanpellegrino'] },
    { chave: 'porto velas', nomes: ['Porto Velas', 'portovelas'] },
    { chave: 'itajaí urban club', nomes: ['Itajaí Urban Club', 'rogga'] },
  ]
  it('acha pelo nome, com grafia diferente e com a unidade junto', () => {
    expect(comparavel('San Pelegrino')).toBe(comparavel('San Pellegrino'))
    expect(produtoDaVenda('San Pelegrino', candidatos)).toBe('lago di san pellegrino')
    expect(produtoDaVenda('Porto Velas - Torre C Unidade 605', candidatos)).toBe('porto velas')
    expect(produtoDaVenda('Rogga', candidatos)).toBe('itajaí urban club')
  })
  it('o que não casa vai para Outros imóveis', () => {
    expect(produtoDaVenda('Manhattan Residence', candidatos)).toBe(OUTROS)
  })
})

describe('comissão da venda', () => {
  it('bruta e parte do corretor gravadas na venda; impostos e Souza pela conta da casa', () => {
    const d = dinheiroDaVenda(venda({ value: 600_000, commissionPct: 5, brokerPct: 40 }), true)
    expect(d.bruta).toBe(30_000)
    expect(d.corretor).toBe(12_000)
    expect(d.impostos).toBeCloseTo(30_000 - 27_354, 6)
    expect(d.souza).toBeCloseTo(27_354 - 12_000, 6)
  })
  it('venda de quem não tem parte fica toda com a Souza', () => {
    const d = dinheiroDaVenda(venda({}), false)
    expect(d.corretor).toBe(0)
    expect(d.souza).toBeCloseTo(27_354, 6)
  })
})

describe('montarFunis', () => {
  const safra: FunilSafra = {
    start: null, end: null, bucket: 'month',
    corretores: [{ chave: 'dio', nome: 'Dionata' }, { chave: 'ryan', nome: 'Ryan' }],
    produtos: [{ chave: 'porto velas', nome: 'Porto Velas' }, { chave: 'versus', nome: 'Versus' }],
    // [corretor, produto, balde, etapa alcançada, descartado, leads]
    cubo: [
      [0, 0, '2026-11-01', 5, 0, 1],
      [0, 0, '2026-11-01', 3, 0, 4],
      [1, 0, '2026-11-01', 1, 1, 10],
      [1, 1, '2026-11-01', 1, 1, 2],
    ],
    motivos: [], visitas: [], historySince: null,
  }
  const base = {
    safra,
    inicio: '2026-11-01',
    corretor: null,
    pctDoLancamento: new Map([['dev-pv', 5]]),
    lancamentos: [{ id: 'dev-pv', nome: 'Porto Velas' }],
    shareDe: (id: string | null | undefined) => (id === 'dio' ? 50 : id === 'ryan' ? 40 : null),
    nomeDoCorretor: (id: string) => ({ dio: 'Dionata', ryan: 'Ryan' }[id] ?? id),
  }

  it('junta conversão, pipeline aberto e vendido por produto e por corretor', () => {
    const f = montarFunis({
      ...base,
      leads: [
        lead({ brokerId: 'dio', funnelStage: 'visita', averageTicket: 600_000, propertyName: 'Porto Velas', developmentId: 'dev-pv' }),
        lead({ brokerId: 'ryan', funnelStage: 'followup', averageTicket: 600_000, propertyName: 'Porto Velas', developmentId: 'dev-pv' }),
        lead({ brokerId: 'ryan', funnelStage: 'atendimento', averageTicket: 500_000, propertyName: 'Porto Velas', discardReason: 'sem_interesse' as Lead['discardReason'] }),
      ],
      sales: [
        venda({ brokerId: 'dio', propertyName: 'Porto Velas - Torre A 303' }),
        venda({ brokerId: 'dio', date: '2026-10-30' }),            // fora do período
      ],
    })
    expect(f.geral.safra.recebidos).toBe(17)
    expect(f.geral.safra.visita).toBe(5)
    expect(f.geral.safra.venda).toBe(1)
    expect(f.geral.pipeline.n).toBe(2)                              // descartado não entra
    expect(f.geral.pipeline.vgv).toBe(1_200_000)
    expect(f.geral.aberto.visita.vgv).toBe(600_000)
    expect(f.geral.aberto.chegada.n).toBe(1)
    expect(f.geral.vendido.n).toBe(1)
    expect(f.geral.vendido.vgv).toBe(600_000)

    // Versus: 2 leads, nada aberto nem vendido → vai para "Outros"
    expect(f.porProduto.map(p => p.nome)).toEqual(['Porto Velas', 'Outros imóveis'])
    const pv = f.porProduto[0]
    expect(pv.vendido.n).toBe(1)
    expect(pv.pipeline.n).toBe(2)

    const dio = f.porCorretor.find(c => c.chave === 'dio')!
    expect(dio.vendido.corretor).toBe(12_000)
    expect(dio.pipeline.corretor).toBeCloseTo(13_677, 6)           // 50% da líquida de 600 mil
    expect(dio.safra.recebidos).toBe(5)
  })

  it('na visão de um corretor, só o que é dele', () => {
    const f = montarFunis({
      ...base, corretor: 'ryan',
      leads: [
        lead({ brokerId: 'dio', funnelStage: 'visita', averageTicket: 600_000, propertyName: 'Porto Velas' }),
        lead({ brokerId: 'ryan', funnelStage: 'proposta', averageTicket: 700_000, propertyName: 'Porto Velas' }),
      ],
      sales: [venda({ brokerId: 'dio' })],
    })
    expect(f.geral.safra.recebidos).toBe(12)
    expect(f.geral.pipeline.vgv).toBe(700_000)
    expect(f.geral.vendido.n).toBe(0)
    expect(f.porCorretor.map(c => c.chave)).toEqual(['ryan'])
  })
  it('venda cruzada: vendido vai para o produto vendido, conversão fica no de entrada', () => {
    const cruz: FunilSafra = {
      start: null, end: null, bucket: 'month',
      corretores: [{ chave: 'dio', nome: 'Dionata' }],
      produtos: [{ chave: 'lago di san pellegrino', nome: 'Lago di San Pellegrino' }, { chave: 'porto velas', nome: 'Porto Velas' }],
      cubo: [
        [0, 0, '2026-11-01', 1, 0, 20, -1],
        [0, 0, '2026-11-01', 5, 0, 1, 0],
        [0, 0, '2026-11-01', 5, 0, 1, 1],
      ],
      motivos: [], visitas: [], historySince: null,
    }
    const f = montarFunis({
      ...base, safra: cruz,
      lancamentos: [{ id: 'dev-pv', nome: 'Porto Velas' }, { id: 'dev-sp', nome: 'Lago di San Pellegrino' }],
      leads: [
        lead({ brokerId: 'dio', funnelStage: 'venda', propertyName: 'Lago di San Pellegrino', saleId: 's1', closedAt: '2026-11-10' }),
        lead({ brokerId: 'dio', funnelStage: 'venda', propertyName: 'Lago di San Pellegrino', saleId: 's2', closedAt: '2026-11-12' }),
      ],
      sales: [
        venda({ id: 's1', brokerId: 'dio', propertyName: 'San Pelegrino', developmentId: 'dev-sp' }),
        // o lead continua San Pellegrino, mas a venda é Porto Velas
        venda({ id: 's2', brokerId: 'dio', propertyName: 'Porto Velas', developmentId: 'dev-pv' }),
      ],
    })
    const sp = f.porProduto.find(p => p.chave === 'lago di san pellegrino')!
    const pv = f.porProduto.find(p => p.chave === 'porto velas')!
    expect(sp.safra).toMatchObject({ venda: 2, vendaPropria: 1, vendaCruzada: 1 })
    expect(sp.cruzadas.para).toEqual([{ chave: 'porto velas', nome: 'Porto Velas', n: 1 }])
    expect(sp.vendido.n).toBe(1)
    expect(pv.safra).toMatchObject({ recebidos: 0, venda: 0, vindas: 1 })
    expect(pv.cruzadas.de).toEqual([{ chave: 'lago di san pellegrino', nome: 'Lago di San Pellegrino', n: 1 }])
    expect(pv.vendido.n).toBe(1)
  })
})
