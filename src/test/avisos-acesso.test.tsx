import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  deveRegistrar, iniciarRegistroDeAcesso, INTERVALO_REGISTRO_MS, OCIOSO_MS,
} from '../lib/acesso'
import {
  horaFalada, horaFaladaDe, horariosDeAlerta, inicioDoDia, situacaoDoDia,
  type ConfigAvisoAcesso,
} from '../modules/acesso/avisosAcesso'

// Avisos de acesso (migração 098). O que este teste protege:
//   • o navegador não martela o banco: 1 chamada a cada 15 min no máximo;
//   • clique só conta como acesso depois de 30 min parado;
//   • abrir e voltar à aba contam (respeitado o intervalo);
//   • a hora sai como no aviso do celular ("9h02") e no fuso de Brasília;
//   • a lista de horários de alerta é a que o banco vai usar;
//   • a tela mostra quem entrou, quem não entrou, quem está online, e salva
//     a configuração inteira de uma vez.

const MIN = 60 * 1000

describe('deveRegistrar', () => {
  it('abertura sempre registra na primeira vez', () => {
    expect(deveRegistrar('abertura', 0, null, null)).toBe(true)
  })

  it('nada registra antes de 15 min do último envio', () => {
    expect(deveRegistrar('foco', 14 * MIN, 0, 0)).toBe(false)
    expect(deveRegistrar('foco', INTERVALO_REGISTRO_MS, 0, 0)).toBe(true)
  })

  it('clique só conta depois de 30 min parado', () => {
    // enviou às 0, mexeu até os 20 min, clicou aos 40: só 20 min parado
    expect(deveRegistrar('clique', 40 * MIN, 0, 20 * MIN)).toBe(false)
    // parado desde os 20, clicou aos 50
    expect(deveRegistrar('clique', 50 * MIN, 0, 20 * MIN)).toBe(true)
    expect(OCIOSO_MS).toBe(30 * MIN)
  })
})

describe('iniciarRegistroDeAcesso', () => {
  it('registra a abertura, o retorno à aba e o clique depois de parado — sem repetir', () => {
    let agora = 0
    const enviar = vi.fn(async () => {})
    const parar = iniciarRegistroDeAcesso(enviar, () => agora)
    expect(enviar).toHaveBeenLastCalledWith('abertura')

    // cliques seguidos logo depois: nada
    agora = 1 * MIN
    window.dispatchEvent(new Event('pointerdown'))
    expect(enviar).toHaveBeenCalledTimes(1)

    // aba volta 20 min depois: conta
    agora = 21 * MIN
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(enviar).toHaveBeenLastCalledWith('foco')
    expect(enviar).toHaveBeenCalledTimes(2)

    // aba aberta e visível, 40 min sem mexer, e um clique: conta
    agora = 61 * MIN
    window.dispatchEvent(new Event('keydown'))
    expect(enviar).toHaveBeenLastCalledWith('clique')
    expect(enviar).toHaveBeenCalledTimes(3)

    parar()
    agora = 200 * MIN
    window.dispatchEvent(new Event('pointerdown'))
    expect(enviar).toHaveBeenCalledTimes(3)
  })
})

describe('formatos', () => {
  it('hora como no aviso do celular', () => {
    expect(horaFalada('09:02')).toBe('9h02')
    expect(horaFalada('10:10:00')).toBe('10h10')
  })

  it('hora de Brasília a partir do instante', () => {
    expect(horaFaladaDe('2026-11-20T12:02:00Z')).toBe('9h02')
  })

  it('início do dia em Brasília', () => {
    // 01h UTC do dia 21 ainda é dia 20 em Brasília
    expect(inicioDoDia(new Date('2026-11-21T01:00:00Z'))).toBe('2026-11-20T03:00:00.000Z')
  })

  it('horários de alerta: 9h10 a 18h10 de hora em hora', () => {
    const h = horariosDeAlerta('09:10', '18:10', 60)
    expect(h[0]).toBe('09:10')
    expect(h[h.length - 1]).toBe('18:10')
    expect(h).toHaveLength(10)
    expect(horariosDeAlerta('09:10', '10:00', 30)).toEqual(['09:10', '09:40'])
  })

  it('situação do dia: primeiro e último acesso de cada um', () => {
    const s = situacaoDoDia(['a', 'b'], [
      { brokerId: 'a', createdAt: '2026-11-20T14:00:00Z' },
      { brokerId: 'a', createdAt: '2026-11-20T12:02:00Z' },
    ])
    expect(s).toEqual([
      { brokerId: 'a', primeiro: '2026-11-20T12:02:00Z', ultimo: '2026-11-20T14:00:00Z' },
      { brokerId: 'b', primeiro: null, ultimo: null },
    ])
  })
})

// ── Tela ─────────────────────────────────────────────────────────────────────

const cfgBase: ConfigAvisoAcesso = {
  entradaAtiva: true, atrasoAtivo: true, atrasoInicio: '09:10', atrasoFim: '18:10',
  atrasoIntervaloMin: 60, dias: [1, 2, 3, 4, 5], corretores: ['rya', 'dio'], destinatario: 'adm',
}

const api = vi.hoisted(() => ({
  carregarConfig: vi.fn(),
  salvarConfig:   vi.fn(),
  acessosDeHoje:  vi.fn(),
}))

vi.mock('../modules/acesso/avisosAcesso', async orig => ({
  ...(await orig<typeof import('../modules/acesso/avisosAcesso')>()),
  ...api,
}))

const { AvisosDeAcesso } = await import('../modules/acesso/AvisosDeAcesso')
const { usePresenceStore } = await import('../store/usePresenceStore')

type Perfil = Parameters<typeof AvisosDeAcesso>[0]['perfis'][number]
const perfil = (id: string, name: string, extra: Partial<Perfil> = {}): Perfil => ({
  id, name, role: 'broker', active: true, isManager: false, allowedMenus: null, ...extra,
})
const PERFIS = [
  perfil('adm', 'Rafael', { role: 'admin' }),
  perfil('rya', 'Ryan Maciel'),
  perfil('dio', 'Dionata Alves'),
  perfil('e2e', 'E2E Tester'),
]

function montar() {
  return render(<MemoryRouter><AvisosDeAcesso perfis={PERFIS} /></MemoryRouter>)
}

beforeEach(() => {
  api.carregarConfig.mockReset().mockResolvedValue(cfgBase)
  api.salvarConfig.mockReset().mockImplementation(async (c: ConfigAvisoAcesso) => c)
  api.acessosDeHoje.mockReset().mockResolvedValue([
    { brokerId: 'rya', createdAt: '2026-11-20T12:02:00Z' },
  ])
  usePresenceStore.setState({ onlineBrokers: [] })
})

describe('AvisosDeAcesso', () => {
  it('mostra quem entrou, quem não entrou e quem está online', async () => {
    usePresenceStore.setState({
      onlineBrokers: [{ userId: 'rya', name: 'Ryan Maciel', role: 'broker', currentPage: '/', lastSeen: '' }],
    })
    montar()
    expect(await screen.findByText('Entrou às 9h02')).toBeInTheDocument()
    expect(screen.getByText('Ainda não entrou hoje')).toBeInTheDocument()
    expect(screen.getByText('Online agora')).toBeInTheDocument()
    expect(screen.getByText('Sem acesso')).toBeInTheDocument()
  })

  it('não lista admin nem o usuário de teste para acompanhar', async () => {
    montar()
    await screen.findByText('Corretores acompanhados')
    expect(screen.getByRole('checkbox', { name: /Ryan Maciel/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Rafael/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /E2E Tester/ })).not.toBeInTheDocument()
  })

  it('mostra os horários dos alertas e salva tudo de uma vez', async () => {
    montar()
    expect(await screen.findByText(/Alertas às 9h10, 10h10, .*18h10\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar avisos' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /Dionata Alves/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Sábado: sem alerta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar avisos' }))

    await waitFor(() => expect(api.salvarConfig).toHaveBeenCalledTimes(1))
    expect(api.salvarConfig).toHaveBeenCalledWith(expect.objectContaining({
      corretores: ['rya'], dias: [1, 2, 3, 4, 5, 6], atrasoInicio: '09:10', atrasoFim: '18:10',
    }))
  })

  it('não deixa salvar primeiro alerta depois do último', async () => {
    montar()
    const inicio = await screen.findByLabelText('Primeiro alerta')
    fireEvent.change(inicio, { target: { value: '19:00' } })
    expect(screen.getByRole('alert')).toHaveTextContent('O primeiro alerta precisa ser antes do último.')
    expect(screen.getByRole('button', { name: 'Salvar avisos' })).toBeDisabled()
  })

  it('erro ao carregar vira mensagem com tentar de novo', async () => {
    api.carregarConfig.mockRejectedValueOnce(new Error('falhou'))
    montar()
    expect(await screen.findByText('Não foi possível carregar os avisos de acesso.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Entrou às 9h02')).toBeInTheDocument()
  })
})
