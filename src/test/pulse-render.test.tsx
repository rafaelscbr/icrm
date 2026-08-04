import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiRail } from '../modules/pulse/components/KpiRail'
import { FunnelStrip } from '../modules/pulse/components/FunnelStrip'
import { LiveFeed } from '../modules/pulse/components/LiveFeed'
import { BrokerRadar } from '../modules/pulse/components/BrokerRadar'
import { DayChart } from '../modules/pulse/components/DayChart'
import { ClimateGauge } from '../modules/pulse/components/ClimateGauge'
import { ResponseTimePanel } from '../modules/pulse/components/ResponseTimePanel'
import { calcClimate } from '../modules/pulse/climate'
import type { PulseEvent, PulseHoje, PulseBroker } from '../modules/pulse/types'

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

const CORRETORES: PulseBroker[] = [
  { brokerId: 'b1', nome: 'Rafael',        interacoesHoje: 12, leadsHoje: 2, visitasHoje: 1, vendasHoje: 0, ultimaAtividadeAt: new Date().toISOString() },
  { brokerId: 'b2', nome: 'Dionata Alves', interacoesHoje: 5,  leadsHoje: 3, visitasHoje: 0, vendasHoje: 1, ultimaAtividadeAt: null },
]

const FEED: PulseEvent[] = [
  { id: '1', at: new Date().toISOString(), kind: 'lead_novo', leadNome: 'Vanessa Lima', produto: 'Garden Park', origem: 'meta_ads', brokerId: 'b2' },
  { id: '2', at: new Date().toISOString(), kind: 'etapa', leadNome: 'João', fromStage: 'followup', toStage: 'visita', brokerId: 'b1' },
  { id: '3', at: new Date().toISOString(), kind: 'venda', leadNome: 'Torre Garden', valor: 850_000, brokerId: 'b1' },
  { id: '4', at: new Date().toISOString(), kind: 'interacao', subTipo: 'whatsapp', leadNome: 'Ana', produto: 'Al Mare', brokerId: 'b1' },
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
    // Nome + produto no texto, origem + corretor que recebeu no detalhe
    expect(screen.getByText('Novo lead — Vanessa Lima · Garden Park')).toBeInTheDocument()
    expect(screen.getByText('Meta Ads → Dionata Alves')).toBeInTheDocument()
    expect(screen.getByText(/Rafael moveu João → Visita/)).toBeInTheDocument()
    expect(screen.getByText(/Venda registrada — Torre Garden/)).toBeInTheDocument()
    expect(screen.getByText('Rafael falou no WhatsApp com Ana · Al Mare')).toBeInTheDocument()
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

  it('DayChart conta atividade fora do horário comercial — lead do Meta cai de madrugada', () => {
    const porHora = Array(24).fill(0)
    porHora[0] = 1; porHora[2] = 1; porHora[3] = 1   // fora da faixa padrão 7h–21h
    const { unmount } = render(<DayChart porHora={porHora} horaAtual={8} />)
    // O total é do dia inteiro; marcar "0 ações" com o feed listando 3 leads
    // ao lado seria uma contradição na mesma tela.
    expect(screen.getByText('3 ações')).toBeInTheDocument()
    // A faixa se estica até a madrugada, então a hora 00 vira rótulo do eixo.
    expect(screen.getByText('00')).toBeInTheDocument()
    unmount()
  })

  it('DayChart estica a faixa para a madrugada e para a noite', () => {
    const porHora = Array(24).fill(0)
    porHora[23] = 5
    render(<DayChart porHora={porHora} horaAtual={23} />)
    expect(screen.getByText('5 ações')).toBeInTheDocument()
  })

  it('ClimateGauge mostra o nível calculado', () => {
    const clima = calcClimate({
      atividade30min: 10, interacoesHoje: 25, leadsNovosHoje: 12,
      corretoresOnline: 5, visitasHoje: 4, vendasHoje: 2, semAtendimentoHoje: 0,
    })
    render(<ClimateGauge clima={clima} />)
    expect(screen.getByText('PEGANDO FOGO')).toBeInTheDocument()
  })

  it('ResponseTimePanel mostra média, mediana e cumprimento do SLA', () => {
    render(<ResponseTimePanel tempos={{
      primeiroContato:  { mediaMin: 91, medianaMin: 33, amostra: 176, pctDentroSla: 36 },
      segundaTentativa: { mediaMin: 2484, medianaMin: 1497, amostra: 153 },
    }} />)
    expect(screen.getByText('1h31')).toBeInTheDocument()
    expect(screen.getByText('mediana 33 min')).toBeInTheDocument()
    expect(screen.getByText('4,6 d')).toBeInTheDocument()
    expect(screen.getByText('mediana 2,8 d')).toBeInTheDocument()
    expect(screen.getByText('36%')).toBeInTheDocument()
    expect(screen.getByText('176 leads')).toBeInTheDocument()
  })

  it('ResponseTimePanel sem amostra não inventa número nem barra de SLA', () => {
    render(<ResponseTimePanel tempos={{
      primeiroContato:  { mediaMin: 0, medianaMin: 0, amostra: 0, pctDentroSla: 0 },
      segundaTentativa: { mediaMin: 0, medianaMin: 0, amostra: 0 },
    }} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getAllByText('sem dados')).toHaveLength(2)
    expect(screen.queryByText(/dentro do SLA/)).not.toBeInTheDocument()
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
