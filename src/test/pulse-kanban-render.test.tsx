import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KanbanDaSala } from '../modules/pulse/components/KanbanDaSala'
import type { CartaoSala } from '../modules/pulse/kanbanDaSala'
import type { Profile } from '../store/useAuthStore'

const AGORA = new Date('2026-11-24T15:00:00-03:00').getTime()
const hAtras = (h: number) => new Date(AGORA - h * 3_600_000).toISOString()

const cartao = (c: Partial<CartaoSala>): CartaoSala => ({
  id: 'x', nome: 'Lead', etapa: 'followup', brokerId: 'r', vgv: 600_000, produto: 'Porto Velas', devId: null,
  desde: hAtras(2), origem: null, criadoEm: hAtras(48), ultimoContatoAt: hAtras(2), passo: 3, ...c,
})

const RYAN = { id: 'r', name: 'Ryan Souza', commissionShare: 40 } as Profile

function desenhar(cartoes: CartaoSala[]) {
  return render(<KanbanDaSala celular cartoes={cartoes} erro={null} pctProduto={{}} perfis={[RYAN]} agora={AGORA} direita={null} giro={null} />)
}

describe('Kanban do Pulse', () => {
  it('quem mexeu agora vira pílula Marinho com "agora"', () => {
    const { container } = desenhar([cartao({ id: 'a', nome: 'Daniela', vivoAt: AGORA - 30_000 })])
    const pilula = container.querySelector('.pulse-kanban-pilula')
    expect(pilula?.classList.contains('marinho')).toBe(true)
    expect(screen.getByText('agora')).toBeInTheDocument()
  })

  it('followup sem contato há mais de 24 h fica laranja e conta como atrasado', () => {
    const { container } = desenhar([cartao({ id: 'b', nome: 'Kauan', ultimoContatoAt: hAtras(30) })])
    expect(container.querySelector('.pulse-kanban-pilula')?.classList.contains('kanban-tom-24h')).toBe(true)
    expect(screen.getByText(/1 atrasado/)).toBeInTheDocument()
    expect(screen.getByText('Contato há 1 dia')).toBeInTheDocument()
  })

  it('os toques do followup ficam à vista', () => {
    desenhar([cartao({ id: 'c', passo: 3 })])
    expect(screen.getByLabelText('3 de 10 tentativas')).toBeInTheDocument()
  })

  it('coluna vazia continua aberta, com o aviso', () => {
    desenhar([cartao({ id: 'd' })])
    expect(screen.getByText('Ninguém em visita agora')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma venda no mês ainda')).toBeInTheDocument()
  })
})
