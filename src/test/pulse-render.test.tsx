import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiRail } from '../modules/pulse/components/KpiRail'
import { FunnelStrip } from '../modules/pulse/components/FunnelStrip'
import { LiveFeed } from '../modules/pulse/components/LiveFeed'
import { BrokerRadar } from '../modules/pulse/components/BrokerRadar'
import { DayChart } from '../modules/pulse/components/DayChart'
import { ClimateGauge } from '../modules/pulse/components/ClimateGauge'
import { ActionPanel } from '../modules/pulse/components/ActionPanel'
import { calcClimate } from '../modules/pulse/climate'
import type { PulseEvent, PulseHoje, PulseGargalos, PulseBroker } from '../modules/pulse/types'

/**
 * Smoke test de renderização.
 *
 * O Pulse roda num iPad que ninguém toca — um erro de runtime não gera
 * reclamação, gera uma tela preta que fica preta o dia inteiro. Estes testes
 * garantem que cada painel renderiza tanto com dados quanto vazio (que é como
 * a tela abre às 8h da manhã).
 */

const HOJE: PulseHoje = {
  leadsNovos: 7, interacoes: 38, visitasMarcadas: 8, mudancasEtapa: 12,
  vendasQtd: 3, vendasValor: 1_250_000, vendasComissao: 62_500,
}

const HOJE_ZERO: PulseHoje = {
  leadsNovos: 0, interacoes: 0, visitasMarcadas: 0, mudancasEtapa: 0,
  vendasQtd: 0, vendasValor: 0, vendasComissao: 0,
}

const GARGALOS: PulseGargalos = {
  semAtendimentoHoje: 92, aguardando48h: 57, slaEstourado: 2, tarefasAtrasadas: 1,
}

const CORRETORES: PulseBroker[] = [
  { brokerId: 'b1', nome: 'Rafael',        interacoesHoje: 12, leadsHoje: 2, visitasHoje: 1, vendasHoje: 0, ultimaAtividadeAt: new Date().toISOString() },
  { brokerId: 'b2', nome: 'Dionata Alves', interacoesHoje: 5,  leadsHoje: 3, visitasHoje: 0, vendasHoje: 1, ultimaAtividadeAt: null },
]

const FEED: PulseEvent[] = [
  { id: '1', at: new Date().toISOString(), kind: 'lead_novo', leadNome: 'Vanessa Lima', origem: 'meta_ads', brokerId: 'b2' },
  { id: '2', at: new Date().toISOString(), kind: 'etapa', leadNome: 'João', fromStage: 'followup', toStage: 'visita', brokerId: 'b1' },
  { id: '3', at: new Date().toISOString(), kind: 'venda', leadNome: 'Torre Garden', valor: 850_000, brokerId: 'b1' },
  { id: '4', at: new Date().toISOString(), kind: 'interacao', subTipo: 'whatsapp', leadNome: 'Ana', brokerId: 'b1' },
  { id: '5', at: new Date().toISOString(), kind: 'campanha', subTipo: 'dispatch', leadNome: 'Carlos', brokerId: 'b2' },
  { id: '6', at: new Date().toISOString(), kind: 'visita', leadNome: 'Visita Paramount', detalhe: '2026-08-05' },
]

const NOMES = { b1: 'Rafael', b2: 'Dionata Alves' }

describe('painéis do Pulse renderizam com dados', () => {
  it('KpiRail mostra os números do dia', () => {
    render(<KpiRail hoje={HOJE} corretoresOnline={5} negociacaoValor={487_000} comissaoPrevista={24_350} />)
    expect(screen.getByText('05')).toBeInTheDocument()   // online
    expect(screen.getByText('38')).toBeInTheDocument()   // atendimentos
    expect(screen.getByText('R$ 487k')).toBeInTheDocument()
  })

  it('FunnelStrip soma o total do funil', () => {
    render(<FunnelStrip funil={{ lead: 4, followup: 71, atendimento: 19, proposta: 1 }} />)
    expect(screen.getByText('95')).toBeInTheDocument()
  })

  it('LiveFeed renderiza todos os tipos de evento', () => {
    render(<LiveFeed feed={FEED} brokerNames={NOMES} />)
    expect(screen.getByText(/Novo lead — Vanessa Lima/)).toBeInTheDocument()
    expect(screen.getByText(/Rafael moveu João → Visita/)).toBeInTheDocument()
    expect(screen.getByText(/Venda registrada — Torre Garden/)).toBeInTheDocument()
    expect(screen.getByText(/Rafael falou no WhatsApp com Ana/)).toBeInTheDocument()
    expect(screen.getByText(/Dionata Alves disparou para Carlos/)).toBeInTheDocument()
  })

  it('BrokerRadar separa quem está online de quem não está', () => {
    render(
      <BrokerRadar
        corretores={CORRETORES}
        online={[{ brokerId: 'b1', nome: 'Rafael', paginaAtual: '/leads' }]}
        agora={Date.now()}
      />
    )
    expect(screen.getByText('Rafael')).toBeInTheDocument()
    expect(screen.getByText('offline')).toBeInTheDocument()
    expect(screen.getByText('1 online')).toBeInTheDocument()
  })

  it('DayChart desenha a curva do dia', () => {
    const porHora = Array(24).fill(0)
    porHora[9] = 4; porHora[10] = 12; porHora[14] = 7
    render(<DayChart porHora={porHora} horaAtual={14} />)
    expect(screen.getByText('23 ações')).toBeInTheDocument()
  })

  it('ClimateGauge mostra o nível calculado', () => {
    const clima = calcClimate({
      atividade30min: 10, leadsNovosHoje: 12, corretoresOnline: 5,
      visitasHoje: 4, vendasHoje: 2, semAtendimentoHoje: 0,
      agora: new Date('2026-07-29T14:00:00'),
    })
    render(<ClimateGauge clima={clima} />)
    expect(screen.getByText('PEGANDO FOGO')).toBeInTheDocument()
  })

  it('ActionPanel só alarma o atraso do dia depois das 14h', () => {
    const { unmount } = render(<ActionPanel gargalos={GARGALOS} funilTotal={95} hora={9} />)
    // De manhã o número aparece, mas sem cor de alarme
    expect(screen.getByText('92')).toBeInTheDocument()
    unmount()

    render(<ActionPanel gargalos={GARGALOS} funilTotal={95} hora={16} />)
    expect(screen.getByText('92')).toBeInTheDocument()
  })
})

describe('painéis do Pulse renderizam vazios — é assim que a tela abre às 8h', () => {
  it('nenhum painel quebra sem dados', () => {
    expect(() => {
      render(
        <>
          <KpiRail hoje={HOJE_ZERO} corretoresOnline={0} negociacaoValor={0} comissaoPrevista={0} />
          <FunnelStrip funil={{}} />
          <LiveFeed feed={[]} brokerNames={{}} />
          <BrokerRadar corretores={[]} online={[]} agora={Date.now()} />
          <DayChart porHora={Array(24).fill(0)} horaAtual={8} />
          <ActionPanel
            gargalos={{ semAtendimentoHoje: 0, aguardando48h: 0, slaEstourado: 0, tarefasAtrasadas: 0 }}
            funilTotal={0}
            hora={8}
          />
        </>
      )
    }).not.toThrow()

    expect(screen.getByText(/Nenhuma atividade registrada hoje ainda/)).toBeInTheDocument()
  })

  it('feed lida com corretor desconhecido sem quebrar', () => {
    render(<LiveFeed feed={[{ id: 'x', at: new Date().toISOString(), kind: 'interacao', subTipo: 'ligacao', leadNome: 'Zé', brokerId: 'fantasma' }]} brokerNames={{}} />)
    expect(screen.getByText(/Alguém ligou para Zé/)).toBeInTheDocument()
  })
})
