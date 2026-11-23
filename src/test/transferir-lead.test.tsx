import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransferirLead } from '../modules/leads/TransferirLead'
import { useAuthStore } from '../store/useAuthStore'
import { useLeadsStore } from '../store/useLeadsStore'
import type { Lead } from '../types'

// Transferência de lead entre corretores. O que este teste protege:
//   • o corretor só enxerga OUTROS CORRETORES ativos como destino (nem ele
//     mesmo, nem admin, nem inativo);
//   • para o corretor a transferência pede confirmação — um clique no nome não
//     transfere nada;
//   • o admin continua transferindo em um clique;
//   • lista que não carregou vira erro com "tentar de novo", nunca menu vazio.

type Perfil = ReturnType<typeof useAuthStore.getState>['allProfiles'][number]

const perfil = (id: string, name: string, extra: Partial<Perfil> = {}): Perfil => ({
  id, name, role: 'broker', active: true, isManager: false, commissionShare: null, ...extra,
} as Perfil)

const RAFAEL  = perfil('adm', 'Rafael', { role: 'admin' })
const DIONATA = perfil('dio', 'Dionata Alves')
const RYAN    = perfil('rya', 'Ryan Maciel')
const INATIVO = perfil('old', 'Corretor Antigo', { active: false })
const TODOS   = [RAFAEL, DIONATA, RYAN, INATIVO]

const lead = { id: 'lead-1', name: 'Fulano', phone: '47999990000', brokerId: 'dio', funnelStage: 'followup' } as unknown as Lead

const transfer = vi.fn()
const onTransferido = vi.fn()

function montar(quem: Perfil, perfis: Perfil[] = TODOS, fetchAllProfiles = vi.fn(async () => perfis)) {
  useAuthStore.setState({ profile: quem, isAdmin: quem.role === 'admin', allProfiles: perfis, fetchAllProfiles })
  useLeadsStore.setState({ transfer })
  render(<TransferirLead lead={lead} brokerName="Dionata Alves" canTransfer onTransferido={onTransferido} />)
  return { fetchAllProfiles }
}

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Dionata/ }))

beforeEach(() => {
  transfer.mockReset().mockResolvedValue(undefined)
  onTransferido.mockReset()
})

describe('TransferirLead', () => {
  it('corretor vê só outros corretores ativos como destino', () => {
    montar(DIONATA)
    abrir()
    expect(screen.getByRole('button', { name: 'Ryan Maciel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rafael' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dionata Alves' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Corretor Antigo' })).not.toBeInTheDocument()
  })

  it('corretor: clicar no nome só pede confirmação; transferir vem depois', async () => {
    montar(DIONATA)
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Ryan Maciel' }))

    expect(transfer).not.toHaveBeenCalled()
    expect(screen.getByText('Transferir para Ryan?')).toBeInTheDocument()
    expect(screen.getByText(/sai do seu funil e o histórico vai junto/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }))
    await waitFor(() => expect(transfer).toHaveBeenCalledWith('lead-1', 'rya'))
    await waitFor(() => expect(onTransferido).toHaveBeenCalledTimes(1))
  })

  it('corretor: cancelar volta para a lista sem transferir', () => {
    montar(DIONATA)
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Ryan Maciel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(transfer).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Ryan Maciel' })).toBeInTheDocument()
  })

  it('se o banco recusar, a ficha não fecha', async () => {
    transfer.mockRejectedValueOnce(new Error('Sem permissão para transferir este lead'))
    montar(DIONATA)
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Ryan Maciel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }))
    await waitFor(() => expect(transfer).toHaveBeenCalled())
    expect(onTransferido).not.toHaveBeenCalled()
  })

  it('admin vê todos os ativos e transfere em um clique, sem fechar a ficha', async () => {
    montar(RAFAEL)
    abrir()
    expect(screen.getByRole('button', { name: 'Rafael' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Corretor Antigo' })).not.toBeInTheDocument()
    // o responsável atual aparece marcado e não é clicável
    expect(screen.getByRole('button', { name: /Dionata Alves/, current: true })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Ryan Maciel' }))
    await waitFor(() => expect(transfer).toHaveBeenCalledWith('lead-1', 'rya'))
    expect(onTransferido).not.toHaveBeenCalled()
  })

  it('corretor sem colega ativo lê o motivo, não um menu vazio', () => {
    montar(DIONATA, [RAFAEL, DIONATA])
    abrir()
    expect(screen.getByText('Não há outro corretor ativo para receber o lead.')).toBeInTheDocument()
  })

  it('lista que não carregou vira erro com tentar de novo', async () => {
    const fetch = vi.fn(async () => [] as Perfil[])
    useAuthStore.setState({ profile: DIONATA, isAdmin: false, allProfiles: [], fetchAllProfiles: fetch })
    useLeadsStore.setState({ transfer })
    render(<TransferirLead lead={lead} brokerName="Dionata Alves" canTransfer onTransferido={onTransferido} />)
    abrir()
    await waitFor(() => expect(screen.getByText('Não foi possível carregar os corretores.')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })

  it('quem não pode transferir só vê o nome do responsável', () => {
    useAuthStore.setState({ profile: RYAN, isAdmin: false, allProfiles: TODOS, fetchAllProfiles: vi.fn(async () => TODOS) })
    render(<TransferirLead lead={lead} brokerName="Dionata Alves" canTransfer={false} onTransferido={onTransferido} />)
    const botao = screen.getByRole('button', { name: /Dionata/ })
    expect(botao).toBeDisabled()
    fireEvent.click(botao)
    expect(screen.queryByText('Transferir para')).not.toBeInTheDocument()
  })
})
