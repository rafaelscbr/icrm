import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KpiRail } from '../modules/pulse/components/KpiRail'
import { FunnelStrip } from '../modules/pulse/components/FunnelStrip'
import { LiveFeed } from '../modules/pulse/components/LiveFeed'
import { BrokerRadar } from '../modules/pulse/components/BrokerRadar'
import { DayChart } from '../modules/pulse/components/DayChart'
import { ClimateGauge } from '../modules/pulse/components/ClimateGauge'
import { ResponseTimePanel } from '../modules/pulse/components/ResponseTimePanel'
import { VglPanel } from '../modules/pulse/components/VglPanel'
import { ClosingSummary, estaEmFechamento } from '../modules/pulse/components/ClosingSummary'
import { PageBanner } from '../modules/pulse/components/PageBanner'
import { calcClimate } from '../modules/pulse/climate'
import type { PulseEvent, PulseHoje, PulseBroker, PulseVgl } from '../modules/pulse/types'

const VGL: PulseVgl = {
  metaMes: 1_000_000, realizadoMes: 250_000, vendasMes: 1,
  ultimaVenda: '2026-07-13', diasSemVenda: 21,
  diasUteisRestantes: 25, faltaParaMeta: 750_000,
}

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

describe('VglPanel — meta do mês e seca de vendas', () => {
  it('mostra realizado, ritmo necessário e dias sem venda', () => {
    render(<VglPanel vgl={VGL} />)
    expect(screen.getByText('R$ 250k')).toBeInTheDocument()
    expect(screen.getByText('25% da meta')).toBeInTheDocument()
    // faltam 750k em 25 dias úteis = 30k/dia
    expect(screen.getByText(/faltam R\$ 750k · R\$ 30k por dia útil/)).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText(/dias.*sem venda/s)).toBeInTheDocument()
  })

  it('sem nenhuma venda registrada não inventa contador', () => {
    render(<VglPanel vgl={{ ...VGL, ultimaVenda: null, diasSemVenda: null }} />)
    expect(screen.getByText('nenhuma venda registrada')).toBeInTheDocument()
  })

  it('meta batida não pede ritmo diário', () => {
    render(<VglPanel vgl={{ ...VGL, realizadoMes: 1_200_000, faltaParaMeta: 0 }} />)
    expect(screen.getByText('100% da meta')).toBeInTheDocument()
    expect(screen.queryByText(/por dia útil/)).not.toBeInTheDocument()
  })

  it('não renderiza sem dados', () => {
    const { container } = render(<VglPanel vgl={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ClosingSummary — balanço da noite', () => {
  it('entra a partir das 20h', () => {
    expect(estaEmFechamento(new Date('2026-08-03T19:30:00'))).toBe(false)
    expect(estaEmFechamento(new Date('2026-08-03T20:00:00'))).toBe(true)
    expect(estaEmFechamento(new Date('2026-08-03T23:59:00'))).toBe(true)
  })

  it('lista só quem produziu no dia', () => {
    render(
      <ClosingSummary
        hoje={HOJE}
        corretores={[
          ...CORRETORES,
          { brokerId: 'b3', nome: 'Parado Silva', interacoesHoje: 0, leadsHoje: 0, visitasHoje: 0, vendasHoje: 0, ultimaAtividadeAt: null },
        ]}
        vgl={VGL}
      />
    )
    expect(screen.getByText('Rafael')).toBeInTheDocument()
    expect(screen.getByText('Dionata')).toBeInTheDocument()
    expect(screen.queryByText('Parado')).not.toBeInTheDocument()
  })

})

describe('PageBanner — identifica a página de relance', () => {
  it('ao vivo mostra título e data do dia', () => {
    render(<PageBanner tipo="ao_vivo" data={new Date('2026-08-03T14:00:00')} />)
    expect(screen.getByText('Ao vivo')).toBeInTheDocument()
    expect(screen.getByText(/segunda-feira, 03 de agosto/)).toBeInTheDocument()
  })

  it('ontem usa o tom frio e oferece a volta ao vivo', () => {
    const voltar = vi.fn()
    render(<PageBanner tipo="ontem" data={new Date('2026-08-02T12:00:00')} aoVoltar={voltar} />)
    expect(screen.getByText('Ontem')).toBeInTheDocument()
    expect(screen.getByText(/domingo, 02 de agosto/)).toBeInTheDocument()

    // O botão de volta é o que garante "ao vivo sempre disponível"
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(voltar).toHaveBeenCalledOnce()
  })

  it('a página ao vivo não mostra botão de voltar — já está nela', () => {
    render(<PageBanner tipo="ao_vivo" data={new Date()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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
