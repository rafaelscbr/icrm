import { describe, it, expect } from 'vitest'
import {
  SEM, contar, ladoALado, leiturasSafra, matriz, motivosSafra, normalizar, passosSafra, serieSafra, tempoAteVisita,
} from '../modules/leads/safra'
import type { FunilSafraBruto } from '../modules/leads/safra'

// Dois corretores (Ana, Bruno) e dois produtos (Porto Velas, sem produto)
const bruto: FunilSafraBruto = {
  start: '2026-11-01', end: '2026-11-15', bucket: 'week',
  corretores: [{ id: 'ana', nome: 'Ana' }, { id: 'bru', nome: 'Bruno' }],
  produtos: [{ chave: 'porto velas', nome: 'Porto Velas' }, { chave: null, nome: 'Sem produto' }],
  cubo: [
    // [corretor, produto, balde, etapa mais alta, descartado, leads]
    [0, 0, '2026-11-01', 1, 1, 6],   // Ana · Porto Velas: 6 descartados no 1º contato
    [0, 0, '2026-11-01', 1, 0, 2],   //                    2 vivos no 1º contato
    [0, 0, '2026-11-08', 3, 0, 3],   //                    3 em visita
    [0, 0, '2026-11-08', 5, 0, 1],   //                    1 venda
    [1, 0, '2026-11-08', 2, 1, 4],   // Bruno · Porto Velas: 4 descartados em atendimento
    [1, 1, '2026-11-01', 4, 0, 2],   // Bruno · sem produto: 2 em proposta
  ],
  motivos: [[0, 0, 'sem_interesse', 4], [0, 0, 'nao_atende', 2], [1, 0, 'sem_interesse', 4]],
  visitas: [[0, 0, 0.2], [0, 0, 2], [0, 0, 5], [0, 0, 20], [1, 1, 3], [1, 1, 3]],
  historySince: '2026-05-11',
}
const f = normalizar(bruto)
const todos = { corretor: null, produto: null }

describe('safra · contagem', () => {
  it('etapa alcançada conta em todas as anteriores; descartado entra na conta', () => {
    const c = contar(f)
    expect(c).toMatchObject({ recebidos: 18, atendimento: 10, visita: 6, proposta: 3, venda: 1, descartados: 10, emAndamento: 7 })
  })

  it('onde pararam: vivos e descartados por etapa', () => {
    const c = contar(f)
    expect(c.parouEm.chegada).toEqual({ ativos: 2, descartados: 6 })
    expect(c.parouEm.atendimento).toEqual({ ativos: 0, descartados: 4 })
    expect(c.parouEm.visita).toEqual({ ativos: 3, descartados: 0 })
    expect(c.parouEm.proposta).toEqual({ ativos: 2, descartados: 0 })
  })

  it('filtra por corretor, por produto e pelos dois', () => {
    expect(contar(f, { corretor: 'ana', produto: null }).recebidos).toBe(12)
    expect(contar(f, { corretor: null, produto: SEM }).recebidos).toBe(2)
    expect(contar(f, { corretor: 'bru', produto: 'porto velas' }).recebidos).toBe(4)
    // escolhido sem lead nesta safra: zero, não "todos"
    expect(contar(f, { corretor: 'outro', produto: null }).recebidos).toBe(0)
  })

  it('passos: taxa do passo e taxa sobre a safra', () => {
    const ps = passosSafra(contar(f))
    expect(ps.map(p => p.etapa)).toEqual(['atendimento', 'visita', 'proposta', 'venda'])
    expect(ps[0]).toMatchObject({ anterior: 'chegada', base: 18, n: 10 })
    expect(Math.round(ps[1].taxaPasso!)).toBe(60)          // 6 de 10
    expect(Math.round(ps[3].taxaTotal! * 10) / 10).toBe(5.6) // 1 de 18
  })
})

describe('safra · lado a lado', () => {
  it('um funil por corretor, mais leads primeiro', () => {
    const l = ladoALado(f, 'corretor', todos)
    expect(l.map(x => [x.nome, x.c.recebidos])).toEqual([['Ana', 12], ['Bruno', 6]])
  })

  it('funil de um corretor em cada produto', () => {
    const l = ladoALado(f, 'produto', { corretor: 'bru', produto: null })
    expect(l.map(x => [x.chave, x.c.recebidos, x.c.proposta])).toEqual([['porto velas', 4, 0], [SEM, 2, 2]])
  })

  it('corretores num produto só', () => {
    const l = ladoALado(f, 'corretor', { corretor: null, produto: SEM })
    expect(l.map(x => x.nome)).toEqual(['Bruno'])
  })

  it('matriz corretor × produto com totais', () => {
    const m = matriz(f)
    expect(m.linhas.map(l => l.nome)).toEqual(['Ana', 'Bruno'])
    expect(m.colunas.map(c => c.nome)).toEqual(['Porto Velas', 'Sem produto'])
    expect(m.celula('ana', SEM).recebidos).toBe(0)
    expect(m.celula('bru', 'porto velas').descartados).toBe(4)
    expect(m.totalLinha('ana').visita).toBe(4)
    expect(m.totalColuna('porto velas').recebidos).toBe(16)
  })
})

describe('safra · tempo, saídas e série', () => {
  it('série por safra sem buracos', () => {
    const s = serieSafra(f, todos, '2026-11-01', '2026-11-22')
    expect(s.map(x => x.bucket)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22'])
    expect(s.map(x => x.recebidos)).toEqual([10, 8, 0, 0])
    expect(s[1]).toMatchObject({ atendimento: 8, visita: 4, venda: 1, descartados: 4 })
  })

  it('motivos somados no recorte', () => {
    expect(motivosSafra(f, todos)).toEqual([{ motivo: 'sem_interesse', n: 8 }, { motivo: 'nao_atende', n: 2 }])
    expect(motivosSafra(f, { corretor: 'bru', produto: null })).toEqual([{ motivo: 'sem_interesse', n: 4 }])
  })

  it('mediana e faixas até a visita', () => {
    const t = tempoAteVisita(f, todos)
    expect(t.total).toBe(6)
    expect(t.mediana).toBe(3)
    expect(t.faixas.map(x => x.n)).toEqual([1, 3, 1, 0, 1])
    expect(tempoAteVisita(f, { corretor: 'ana', produto: null }).mediana).toBe(3.5)
  })
})

describe('safra · leituras', () => {
  const motivo = (s: string) => (s === 'sem_interesse' ? 'Sem interesse' : s)

  it('aponta a maior perda e o motivo de saída, com os números', () => {
    const l = leiturasSafra(f, todos, '2026-11-22', motivo).map(x => x.texto)
    expect(l[0]).toContain('entre Visita e Proposta: de 6, 3 avançaram (50%)')   // Proposta→Venda tem base 3: fica de fora
    expect(l.some(t => t.includes('Motivo mais comum: Sem interesse (8)'))).toBe(true)
  })

  it('não compara corretores com menos de 10 leads cada', () => {
    const l = leiturasSafra(f, todos, '2026-11-22', motivo).map(x => x.texto)
    expect(l.some(t => t.includes('quem mais leva lead a visita'))).toBe(false)
  })

  it('avisa que a safra ainda está amadurecendo quando o período chega a hoje', () => {
    const l = leiturasSafra(f, todos, '2026-11-15', motivo).map(x => x.texto)
    expect(l.some(t => t.includes('ainda podem subir'))).toBe(true)
  })

  it('sem leads, nenhuma leitura', () => {
    expect(leiturasSafra(f, { corretor: 'outro', produto: null }, '2026-11-22', motivo)).toEqual([])
  })
})
