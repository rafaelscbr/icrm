import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { db } from '../lib/db'
import type { Lead } from '../types'
import { useAuthStore } from '../store/useAuthStore'
import { FluxosDoLead, ListaDeFluxos, agruparFluxos } from '../modules/leads/fluxos/FluxosDoLead'
import { SimuladorDoLead } from '../modules/leads/fluxos/SimuladorDoLead'
import { PosChavesSimulator } from '../modules/simulador/posChaves/Simulator'
import { DiretoSimulator } from '../modules/simulador/direto/Simulator'
import { AssociativoSimulator } from '../modules/simulador/associativo/Simulator'
import type {
  EstadoAssociativo, EstadoDireto, EstadoPosChaves, LeadFluxo, RelatoDoSimulador,
} from '../modules/simulador/shared/fluxo'
import type { SharedFields } from '../modules/simulador/shared/types'

// Fluxos do lead (migração 096). O que estes testes protegem:
//   • um fluxo salvo reabre com EXATAMENTE o que foi preenchido, nos três modos;
//   • salvar a partir de um fluxo existente grava a versão seguinte do MESMO
//     fluxo, nunca sobrescreve nem cria outro;
//   • a lista mostra o que o banco devolveu e as ações passam pelo banco;
//   • sem as funções de ação (gestor), a lista não tem botão de editar/enviar.

const lead = {
  // com o 55 do país, como o banco guarda
  id: 'lead-1', name: 'Fulana de Tal', phone: '5547999990000', propertyName: 'Greenview',
  averageTicket: 600000, origin: 'meta_ads', funnelStage: 'atendimento', followupStep: 0,
  brokerId: 'rya', createdAt: '2026-11-10T12:00:00Z', updatedAt: '2026-11-10T12:00:00Z',
} as unknown as Lead

const shared: SharedFields = { empreendimento: 'Greenview', cliente: 'Fulana de Tal', telefone: '47999990000', valorTotal: 600000 }

const estadoPos: EstadoPosChaves = {
  pctChaves: 30, entradaModo: 'valor', entradaPct: 0,
  base: { entradaQtd: 1, entradaValor: 60000, reforcoQtd: 2, reforcoValor: 10000, reforcoPeriodo: 'anual', parcelasQtd: 36 },
}

const versao = (n: number, extra: Partial<LeadFluxo> = {}): LeadFluxo => ({
  id: `v${n}`, leadId: 'lead-1', fluxoId: 'fluxo-a', versao: n, nome: 'Opção 1', modo: 'pos_chaves',
  dados: { shared, estado: estadoPos },
  resumo: { valorTotal: 600000, entradaTotal: 60000, parcelasQtd: 36, parcelaValor: 2777.78, linha: `linha da versão ${n}` },
  mensagem: `texto do whatsapp v${n}`, criadoPor: 'Ryan Maciel', criadoEm: `2026-11-1${n}T15:00:00Z`,
  enviadoEm: null, enviadoPor: null, ...extra,
})

const listar = vi.spyOn(db.leadFluxos, 'listar')
const salvar = vi.spyOn(db.leadFluxos, 'salvar')
const marcarEnviado = vi.spyOn(db.leadFluxos, 'marcarEnviado')
const arquivar = vi.spyOn(db.leadFluxos, 'arquivar')

beforeEach(() => {
  for (const m of [listar, salvar, marcarEnviado, arquivar]) m.mockReset()
  useAuthStore.setState({ profile: { id: 'rya', name: 'Ryan Maciel', role: 'broker', active: true } as never })
})

describe('os três modos reabrem um fluxo salvo sem perder nada', () => {
  it('pós-chaves', async () => {
    const relatos: RelatoDoSimulador<EstadoPosChaves>[] = []
    render(<PosChavesSimulator shared={shared} onShared={() => {}} corretor="Ryan" inicial={estadoPos} onRelato={r => relatos.push(r)} />)
    await waitFor(() => expect(relatos.length).toBeGreaterThan(0))
    const r = relatos[relatos.length - 1]
    expect(r.estado).toEqual(estadoPos)
    expect(r.valido).toBe(true)
    // (180.000 − 60.000 − 20.000) / 36
    expect(r.resumo.parcelaValor).toBeCloseTo(2777.78, 2)
    expect(r.resumo.linha).toContain('36× de')
    expect(r.mensagem.length).toBeGreaterThan(20)
  })

  it('direto com a construtora', async () => {
    const estado: EstadoDireto = {
      entradaModo: 'pct', entradaPct: 10,
      base: { entradaQtd: 1, entradaValor: 0, reforcoQtd: 0, reforcoValor: 0, reforcoPeriodo: 'semestral', parcelasQtd: 60 },
    }
    const relatos: RelatoDoSimulador<EstadoDireto>[] = []
    render(<DiretoSimulator shared={shared} onShared={() => {}} corretor="Ryan" inicial={estado} onRelato={r => relatos.push(r)} />)
    await waitFor(() => expect(relatos.length).toBeGreaterThan(0))
    const r = relatos[relatos.length - 1]
    expect(r.estado).toEqual(estado)
    expect(r.valido).toBe(true)
    // entrada de 10% de 600.000 = 60.000; (600.000 − 60.000) / 60
    expect(r.resumo.entradaTotal).toBe(60000)
    expect(r.resumo.parcelaValor).toBe(9000)
  })

  it('associativo', async () => {
    const estado: EstadoAssociativo = {
      entradaQtd: 1, entradaModo: 'valor', entradaValor: 30000, entradaPct: 0,
      parcelasQtd: 24, parcelasModo: 'valor', parcelaValor: 1500, parcelasPct: 0,
      balaoQtd: 2, balaoModo: 'valor', balaoValor: 5000, balaoPct: 0,
      balaoForma: 'individual', baloesAvulsos: [{ id: 'b1', valor: 5000, mes: 12, ano: 2027 }],
      indice: 'cub', taxaIndiceAnual: 5, aplicarCorrecao: false,
      inicioParcelas: '2027-01', financiamento: '2027-06', entrega: '2029-01',
      jurosObraMensal: 0.83, taxaAdm: 25, seguro: 40, pctObraAssinatura: 20,
      taxaBancoAnual: 10.5, prazoMeses: 360, sistema: 'sac',
    }
    const relatos: RelatoDoSimulador<EstadoAssociativo>[] = []
    render(<AssociativoSimulator shared={shared} onShared={() => {}} corretor="Ryan" inicial={estado} onRelato={r => relatos.push(r)} />)
    await waitFor(() => expect(relatos.length).toBeGreaterThan(0))
    expect(relatos[relatos.length - 1].estado).toEqual(estado)
  })

  it('sem `inicial` e sem `onRelato`, a tela do Simulador segue como era', () => {
    render(<PosChavesSimulator shared={{ empreendimento: '', cliente: '', telefone: '', valorTotal: 0 }} onShared={() => {}} corretor="Ryan" />)
    expect(screen.getByText('Informe o valor total do imóvel.')).toBeInTheDocument()
  })
})

describe('agruparFluxos', () => {
  it('junta as versões por fluxo, a mais recente primeiro', () => {
    const outro = versao(1, { id: 'b1', fluxoId: 'fluxo-b', nome: 'Opção 2', criadoEm: '2026-11-18T10:00:00Z' })
    const grupos = agruparFluxos([versao(1), outro, versao(3), versao(2)])
    expect(grupos.map(g => g[0].fluxoId)).toEqual(['fluxo-b', 'fluxo-a'])
    expect(grupos[1].map(v => v.versao)).toEqual([3, 2, 1])
  })
})

describe('aba Fluxos da ficha', () => {
  it('lead sem fluxo explica para que serve e oferece o primeiro', async () => {
    listar.mockResolvedValue([])
    render(<FluxosDoLead lead={lead} />)
    expect(await screen.findByText('Nenhum fluxo guardado para este lead.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo fluxo' })).toBeInTheDocument()
  })

  it('mostra a última versão e guarda as anteriores sob demanda', async () => {
    listar.mockResolvedValue([versao(2), versao(1, { enviadoEm: '2026-11-11T16:00:00Z', enviadoPor: 'Ryan Maciel' })])
    render(<FluxosDoLead lead={lead} />)

    expect(await screen.findByText('Opção 1')).toBeInTheDocument()
    expect(screen.getByText('Pós-chaves · versão 2')).toBeInTheDocument()
    expect(screen.getByText('linha da versão 2')).toBeInTheDocument()
    expect(screen.getByText(/a versão 1 foi enviada ao cliente/)).toBeInTheDocument()
    expect(screen.queryByText('linha da versão 1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /1 versão anterior/ }))
    expect(screen.getByText('linha da versão 1')).toBeInTheDocument()

    // o texto congelado da versão aparece como foi gerado
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver texto' })[0])
    expect(screen.getByText('texto do whatsapp v2')).toBeInTheDocument()
  })

  it('marcar como enviado passa pelo banco e relê a lista', async () => {
    listar.mockResolvedValueOnce([versao(1)]).mockResolvedValueOnce([versao(1, { enviadoEm: '2026-11-19T12:00:00Z', enviadoPor: 'Ryan Maciel' })])
    marcarEnviado.mockResolvedValue(versao(1))
    render(<FluxosDoLead lead={lead} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como enviado' }))
    await waitFor(() => expect(marcarEnviado).toHaveBeenCalledWith('v1'))
    expect(await screen.findByText(/Enviada ao cliente/)).toBeInTheDocument()
    expect(listar).toHaveBeenCalledTimes(2)
  })

  it('arquivar pede confirmação antes de ir ao banco', async () => {
    listar.mockResolvedValue([versao(2), versao(1)])
    arquivar.mockResolvedValue(undefined)
    render(<FluxosDoLead lead={lead} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar' }))
    expect(arquivar).not.toHaveBeenCalled()
    const confirmacao = screen.getByRole('alertdialog', { name: 'Arquivar fluxo' })
    expect(within(confirmacao).getByText(/e as 2 versões/)).toBeInTheDocument()
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Arquivar' }))
    await waitFor(() => expect(arquivar).toHaveBeenCalledWith('fluxo-a'))
  })

  it('falha de leitura vira erro, não lista vazia', async () => {
    listar.mockRejectedValueOnce(new Error('Lead não encontrado ou sem permissão para ver os fluxos dele'))
    render(<FluxosDoLead lead={lead} />)
    expect(await screen.findByText('Não foi possível carregar os fluxos deste lead.')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum fluxo guardado para este lead.')).not.toBeInTheDocument()
  })

  it('lista de leitura (gestor) não tem editar, enviar nem arquivar', () => {
    render(<ListaDeFluxos grupos={agruparFluxos([versao(2), versao(1)])} />)
    expect(screen.getByText('linha da versão 2')).toBeInTheDocument()
    const nomes = screen.getAllByRole('button').map(b => b.textContent?.trim())
    expect(nomes).toEqual(['Ver texto', '1 versão anterior'])
  })
})

describe('simulador aberto pelo lead', () => {
  it('fluxo novo nasce com os dados do lead e só salva quando a simulação fecha', async () => {
    render(<SimuladorDoLead lead={lead} nomeSugerido="Fluxo 1" onClose={() => {}} onSalvo={() => {}} />)
    expect(screen.getByLabelText('Nome do fluxo')).toHaveValue('Fluxo 1')
    expect(screen.getByLabelText('Nome do cliente (opcional)')).toHaveValue('Fulana de Tal')
    expect(screen.getByLabelText('Empreendimento / Unidade')).toHaveValue('Greenview')
    // o 55 do país sai: o simulador trabalha com DDD + número
    expect(screen.getByLabelText('WhatsApp do cliente (opcional)')).toHaveValue('(47) 99999-0000')
    // falta a porcentagem até as chaves: ainda não dá para salvar
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar fluxo' })).toBeDisabled())
    expect(screen.getByText('Fluxo novo, ainda não salvo')).toBeInTheDocument()
  })

  it('editar um fluxo salvo grava a versão seguinte do MESMO fluxo, com os mesmos dados', async () => {
    const onSalvo = vi.fn()
    salvar.mockResolvedValue(versao(3))
    render(<SimuladorDoLead lead={lead} base={versao(2)} nomeSugerido="x" onClose={() => {}} onSalvo={onSalvo} />)

    const botao = await screen.findByRole('button', { name: 'Salvar versão 3' })
    // nada mudou ainda: não cria versão repetida
    await waitFor(() => expect(botao).toBeDisabled())

    fireEvent.change(screen.getByLabelText('Nome do fluxo'), { target: { value: 'Opção 1 — entrada maior' } })
    await waitFor(() => expect(botao).toBeEnabled())
    fireEvent.click(botao)

    await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1))
    const enviado = salvar.mock.calls[0][0]
    expect(enviado.fluxoId).toBe('fluxo-a')
    expect(enviado.leadId).toBe('lead-1')
    expect(enviado.modo).toBe('pos_chaves')
    expect(enviado.nome).toBe('Opção 1 — entrada maior')
    expect(enviado.dados).toEqual({ shared, estado: estadoPos })
    expect(enviado.resumo.parcelaValor).toBeCloseTo(2777.78, 2)
    expect(enviado.mensagem.length).toBeGreaterThan(20)
    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(versao(3)))
    // depois de salvar, a próxima gravação já é a versão 4
    expect(await screen.findByRole('button', { name: 'Salvar versão 4' })).toBeDisabled()
  })

  it('"salvar e marcar como enviado" grava e só então registra o envio', async () => {
    const salva = versao(3)
    salvar.mockResolvedValue(salva)
    marcarEnviado.mockResolvedValue({ ...salva, enviadoEm: '2026-11-19T12:00:00Z', enviadoPor: 'Ryan Maciel' })
    render(<SimuladorDoLead lead={lead} base={versao(2)} nomeSugerido="x" onClose={() => {}} onSalvo={() => {}} />)
    // sem alteração, a versão 2 pode ser marcada como enviada sem criar outra
    const marcar = await screen.findByRole('button', { name: 'Marcar como enviado' })
    fireEvent.click(marcar)
    await waitFor(() => expect(marcarEnviado).toHaveBeenCalledWith('v2'))
    expect(salvar).not.toHaveBeenCalled()
  })

  it('se o banco recusar, a tela não diz que salvou', async () => {
    salvar.mockRejectedValueOnce(new Error('sem permissão'))
    const onSalvo = vi.fn()
    render(<SimuladorDoLead lead={lead} base={versao(2)} nomeSugerido="x" onClose={() => {}} onSalvo={onSalvo} />)
    fireEvent.change(screen.getByLabelText('Nome do fluxo'), { target: { value: 'Outro nome' } })
    const botao = await screen.findByRole('button', { name: 'Salvar versão 3' })
    await waitFor(() => expect(botao).toBeEnabled())
    fireEvent.click(botao)
    await waitFor(() => expect(salvar).toHaveBeenCalled())
    expect(onSalvo).not.toHaveBeenCalled()
    expect(screen.getByText(/Alterações não salvas/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar versão 3' })).toBeEnabled()
  })

  it('sair com alteração não salva pede confirmação', async () => {
    const onClose = vi.fn()
    render(<SimuladorDoLead lead={lead} base={versao(2)} nomeSugerido="x" onClose={onClose} onSalvo={() => {}} />)
    await screen.findByRole('button', { name: 'Salvar versão 3' })
    fireEvent.change(screen.getByLabelText('Nome do fluxo'), { target: { value: 'Mudou' } })
    await waitFor(() => expect(screen.getByText(/Alterações não salvas/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Fechar o simulador' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(/Se sair agora, elas se perdem/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    expect(screen.queryByText(/Se sair agora, elas se perdem/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fechar o simulador' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem salvar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sem alteração, fechar sai direto', async () => {
    const onClose = vi.fn()
    render(<SimuladorDoLead lead={lead} base={versao(2)} nomeSugerido="x" onClose={onClose} onSalvo={() => {}} />)
    await screen.findByRole('button', { name: 'Salvar versão 3' })
    await waitFor(() => expect(screen.getByText(/Versão 2 salva às/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Fechar o simulador' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
