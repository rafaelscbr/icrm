import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LeadSomenteLeitura } from '../modules/leads/LeadSomenteLeitura'
import { db } from '../lib/db'
import type { Lead, LeadInteraction, LeadProfile } from '../types'

// A ficha que o gestor abre no lead de um colega. O que este teste protege:
//   • ela mostra os detalhes (telefone, anotações, perfil, histórico, tarefas);
//   • ela NÃO tem nenhuma ação sobre o lead — nem botão, nem link de contato;
//   • falha de leitura aparece como erro, nunca como ficha vazia.

const lead = {
  id: 'lead-1', name: 'Fulana de Tal', phone: '47999990000', email: 'fulana@exemplo.com',
  origin: 'meta_ads', funnelStage: 'followup', followupStep: 3, notes: 'Prefere contato à tarde.',
  averageTicket: 600000, brokerId: 'rya', createdAt: '2026-11-10T12:00:00Z', updatedAt: '2026-11-17T12:00:00Z',
  lastContactAt: new Date().toISOString(),
} as unknown as Lead

const perfil = {
  leadId: 'lead-1', phone: '47999990000', forms: [], lists: [], missing: ['prazo'], formCount: 0, isKnown: false,
  profile: { objetivo: { value: 'morar', label: 'Morar com a família', source: 'formulario' } },
} as unknown as LeadProfile

const historico = [
  { id: 'i1', leadId: 'lead-1', type: 'whatsapp', description: 'Interagiu via WhatsApp', interactedAt: '2026-11-16T15:00:00Z', createdAt: '2026-11-16T15:00:00Z' },
  { id: 'i2', leadId: 'lead-1', type: 'nota', description: 'Lead recebido via Meta Ads', interactedAt: '2026-11-10T12:00:00Z', createdAt: '2026-11-10T12:00:00Z' },
] as unknown as LeadInteraction[]

const tarefas = [{ id: 't1', title: 'Visita ao decorado', category: 'visita', dueDate: '2026-11-20', dueTime: '14:30', priority: 'high' }]

const detalhe = vi.spyOn(db.leads, 'detalheDaEquipe')
const onClose = vi.fn()

const montar = () => render(<LeadSomenteLeitura leadId="lead-1" nome="Fulana de Tal" corretor="Ryan Maciel" onClose={onClose} />)

beforeEach(() => { detalhe.mockReset(); onClose.mockReset() })

describe('LeadSomenteLeitura', () => {
  it('mostra os detalhes do lead do colega', async () => {
    detalhe.mockResolvedValue({ lead, perfil, historico, tarefas })
    montar()

    expect(await screen.findByText('(47) 99999-0000')).toBeInTheDocument()
    expect(detalhe).toHaveBeenCalledWith('lead-1')
    expect(screen.getByText(/Somente leitura · lead de Ryan/)).toBeInTheDocument()
    expect(screen.getByText('fulana@exemplo.com')).toBeInTheDocument()
    expect(screen.getByText('Prefere contato à tarde.')).toBeInTheDocument()
    expect(screen.getByText('Morar com a família')).toBeInTheDocument()
    expect(screen.getByText('Interagiu via WhatsApp')).toBeInTheDocument()
    expect(screen.getByText('Histórico · 2 registros')).toBeInTheDocument()
    expect(screen.getByText('Visita ao decorado')).toBeInTheDocument()
    // a data da tarefa não volta um dia por causa de fuso
    expect(screen.getByText('20/11 às 14:30')).toBeInTheDocument()
    expect(screen.getByText('3/10')).toBeInTheDocument()
  })

  it('não oferece nenhuma ação sobre o lead', async () => {
    detalhe.mockResolvedValue({ lead, perfil, historico, tarefas })
    montar()
    await screen.findByText('(47) 99999-0000')

    // Os únicos botões são os da própria ficha: fechar e atualizar.
    const botoes = screen.getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent?.trim())
    expect(botoes.sort()).toEqual(['Atualizar a ficha', 'Fechar'])
    // Telefone e e-mail são texto: nenhum link de ligar, WhatsApp ou e-mail.
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(document.body.innerHTML).not.toMatch(/wa\.me|whatsapp\.com|tel:|mailto:/)
    for (const proibido of [/WhatsApp$/, /^Ligar/, /Transferir/, /Qualificar/, /Descartar/, /Registrar contato/, /Editar/, /Apagar/]) {
      expect(screen.queryByRole('button', { name: proibido })).not.toBeInTheDocument()
    }
  })

  it('falha de leitura vira erro com tentar de novo, não ficha vazia', async () => {
    detalhe.mockRejectedValueOnce(new Error('Só gestor ou admin pode ver o lead de outro corretor'))
    montar()

    expect(await screen.findByText('Não foi possível abrir este lead.')).toBeInTheDocument()
    expect(screen.getByText('Só gestor ou admin pode ver o lead de outro corretor')).toBeInTheDocument()
    expect(screen.queryByText(/Histórico ·/)).not.toBeInTheDocument()

    detalhe.mockResolvedValueOnce({ lead, perfil, historico, tarefas })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('(47) 99999-0000')).toBeInTheDocument()
  })

  it('atualizar relê o lead do banco', async () => {
    detalhe.mockResolvedValue({ lead, perfil, historico, tarefas })
    montar()
    await screen.findByText('(47) 99999-0000')
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar a ficha' }))
    await waitFor(() => expect(detalhe).toHaveBeenCalledTimes(2))
  })

  it('avisa quando o prazo de 1º contato ainda está correndo', async () => {
    const comPrazo = { ...lead, slaDueAt: new Date(Date.now() + 5 * 60_000).toISOString(), firstContactAt: undefined } as Lead
    detalhe.mockResolvedValue({ lead: comPrazo, perfil: null, historico: [], tarefas: [] })
    montar()
    expect(await screen.findByText(/Aguardando o 1º contato · prazo até/)).toBeInTheDocument()
    expect(screen.getByText('Nenhum registro neste lead ainda.')).toBeInTheDocument()
  })
})
