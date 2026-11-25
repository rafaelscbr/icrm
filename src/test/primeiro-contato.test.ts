import { describe, it, expect } from 'vitest'
import { normalizar, primeiroContato, primeiroContatoPorCorretor } from '../modules/leads/safra'
import type { FunilSafraBruto } from '../modules/leads/safra'
import { ehPrimeiraChamada, pendentesDoCorretor, perguntaPotencial, resumoPrimeiroContato } from '../modules/leads/primeiroContato'
import type { Lead } from '../types'

const lead = (p: Partial<Lead>): Lead => ({
  id: 'l1', name: 'Ana Souza', phone: '47999990000', origin: 'meta_ads', funnelStage: 'lead', followupStep: 0,
  createdAt: '2026-11-26T10:00:00-03:00', updatedAt: '2026-11-26T10:00:00-03:00', brokerId: 'dio', ...p,
} as Lead)

describe('primeiro contato · quando o popup aparece', () => {
  it('só na 1ª chamada: lead novo, sem contato e sem resultado', () => {
    expect(ehPrimeiraChamada(lead({}))).toBe(true)
    expect(ehPrimeiraChamada(lead({ funnelStage: 'followup', followupStep: 1 }))).toBe(false)
    expect(ehPrimeiraChamada(lead({ firstContactAt: '2026-11-26T10:05:00-03:00' }))).toBe(false)
    expect(ehPrimeiraChamada(lead({ firstContactResult: 'atendeu' }))).toBe(false)
    expect(ehPrimeiraChamada(lead({ discardReason: 'sem_condicao' as Lead['discardReason'] }))).toBe(false)
  })

  it('potencial só na ligação atendida', () => {
    expect(perguntaPotencial('ligacao', 'atendeu')).toBe(true)
    expect(perguntaPotencial('whatsapp', 'atendeu')).toBe(false)
    expect(perguntaPotencial('ligacao', 'mensagem_audio')).toBe(false)
  })

  it('pendente: chamado depois do início, sem resultado, do próprio corretor', () => {
    const ls = [
      lead({ id: 'a', funnelStage: 'followup', firstContactAt: '2026-11-26T11:00:00-03:00' }),
      lead({ id: 'b', funnelStage: 'followup', firstContactAt: '2026-11-20T11:00:00-03:00' }),   // antes do popup existir
      lead({ id: 'c', funnelStage: 'followup', firstContactAt: '2026-11-26T11:00:00-03:00', firstContactResult: 'atendeu' }),
      lead({ id: 'd', funnelStage: 'followup', firstContactAt: '2026-11-26T11:00:00-03:00', brokerId: 'ryan' }),
    ]
    expect(pendentesDoCorretor(ls, 'dio').map(l => l.id)).toEqual(['a'])
    expect(pendentesDoCorretor(ls, null)).toEqual([])
  })

  it('resumo para a ficha', () => {
    expect(resumoPrimeiroContato(lead({ firstContactChannel: 'ligacao', firstContactResult: 'atendeu', firstContactPotential: 'curioso' })))
      .toBe('Ligação · Atendeu · Curioso')
    expect(resumoPrimeiroContato(lead({}))).toBeNull()
  })
})

describe('primeiro contato · métricas', () => {
  const bruto: FunilSafraBruto = {
    start: null, end: null, bucket: 'month',
    corretores: [{ id: 'dio', nome: 'Dionata' }, { id: 'ryan', nome: 'Ryan' }],
    produtos: [{ chave: 'porto velas', nome: 'Porto Velas' }, { chave: 'dotzero', nome: 'Dotzero' }],
    cubo: [
      [0, 0, '2026-11-01', 1, 0, 10],
      [1, 0, '2026-11-01', 1, 0, 6],
      [1, 1, '2026-11-01', 1, 0, 4],
    ],
    contatos: [
      [0, 0, 'ligacao', 'atendeu', 'potencial', 2],
      [0, 0, 'ligacao', 'atendeu', 'curioso', 1],
      [0, 0, 'whatsapp', 'mensagem_texto', null, 3],
      [1, 0, 'ligacao', 'nao_atendeu', null, 2],
      [1, 0, 'ligacao', 'mensagem_audio', null, 1],
      [1, 1, 'whatsapp', 'numero_invalido', null, 1],
    ],
    motivos: [], visitas: [], historySince: null,
  }
  const f = normalizar(bruto)

  it('de X que chegaram, o que aconteceu e o potencial das ligações atendidas', () => {
    const r = primeiroContato(f)
    expect(r).toMatchObject({ recebidos: 20, registrados: 10, ligacoesAtendidas: 3 })
    expect(r.porResultado).toEqual({ atendeu: 3, nao_atendeu: 2, mensagem_texto: 3, mensagem_audio: 1, numero_invalido: 1 })
    expect(r.potencial).toEqual({ potencial: 2, curioso: 1, sem_potencial: 0 })
    expect(r.porCanal.whatsapp.mensagem_texto).toBe(3)
  })

  it('recorta por produto e por corretor', () => {
    expect(primeiroContato(f, { corretor: null, produto: 'dotzero' })).toMatchObject({ recebidos: 4, registrados: 1 })
    expect(primeiroContato(f, { corretor: 'ryan', produto: null })).toMatchObject({ recebidos: 10, registrados: 4 })
  })

  it('por corretor, para comparar', () => {
    const pc = primeiroContatoPorCorretor(f)
    expect(pc.map(x => [x.nome, x.r.recebidos, x.r.registrados, x.r.porResultado.atendeu])).toEqual([
      ['Dionata', 10, 6, 3],
      ['Ryan', 10, 4, 0],
    ])
    expect(primeiroContatoPorCorretor(f, { corretor: null, produto: 'dotzero' }).map(x => x.nome)).toEqual(['Ryan'])
  })

  it('sem o bloco de contatos (resposta antiga): zero registrados', () => {
    expect(primeiroContato(normalizar({ ...bruto, contatos: undefined })).registrados).toBe(0)
  })
})
