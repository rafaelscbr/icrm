import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  AoVivo, Batimento, EquipeCompacta, FilaPrimeiroContato, FunilHeroi, MetaNoMarinho, NumerosNoMarinho,
  PontosNoMarinho, PrazoNoMarinho, Resposta, curvaDoDia, mediaSemHoje, textoDaResposta, urgenciaDe,
} from '../modules/pulse/components/Sala'
import type { Corretor } from '../modules/pulse/components/Sala'
import { etapaDoDescarte } from '../modules/pulse/usePulseStore'
import type { PulseEvent, PulseVgl } from '../modules/pulse/types'

/**
 * Smoke test da sala de comando (Pulse na TV).
 *
 * A tela roda numa TV que ninguém toca — um erro de runtime não gera
 * reclamação, gera uma tela parada o dia inteiro. Cada peça renderiza com
 * dados e vazia (que é como a tela abre às 8h da manhã).
 */

const VGL: PulseVgl = {
  metaMes: 1_000_000, realizadoMes: 250_000, vendasMes: 1,
  ultimaVenda: '2026-07-13', diasSemVenda: 21,
  diasUteisRestantes: 25, faltaParaMeta: 750_000,
}

const FEED: PulseEvent[] = [
  { id: '1', at: new Date().toISOString(), kind: 'lead_novo', leadNome: 'Vanessa Lima', produto: 'Garden Park', origem: 'meta_ads', brokerId: 'b2' },
  { id: '2', at: new Date().toISOString(), kind: 'etapa', leadNome: 'João', fromStage: 'followup', toStage: 'visita', brokerId: 'b1' },
  { id: '4', at: new Date().toISOString(), kind: 'interacao', subTipo: 'whatsapp', leadNome: 'Ana', produto: 'Al Mare', brokerId: 'b1' },
]

const NOMES = new Map([['b1', 'Rafael'], ['b2', 'Dionata']])

const AGORA = new Date('2026-11-23T14:00:00').getTime()

const CORRETOR: Corretor = {
  id: 'b2', nome: 'Dionata Alves', ativo: true, status: 'Em atividade · há 2 min',
  marcas: [{ t: AGORA - 3_600_000, tom: 'good' }],
  atend: 12, ligacoes: 10, metaLigacoes: 10, avancos: 3, visitas: 1, leads: 4, herdados: 2,
}

describe('faixa Marinho — números do momento', () => {
  it('número que ainda não chegou vira traço, não zero', () => {
    render(<NumerosNoMarinho meta={null} itens={[
      { rotulo: 'Leads hoje', valor: null },
      { rotulo: 'Na fila', valor: 3, cor: 'alerta', nota: '3 com o prazo correndo' },
    ]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('3 com o prazo correndo')).toBeInTheDocument()
  })

  it('média de leads ignora hoje, que ainda está acontecendo', () => {
    expect(mediaSemHoje([{ n: 4 }, { n: 6 }, { n: 1 }])).toBe(5)
    expect(mediaSemHoje([{ n: 9 }])).toBeNull()
  })

  it('barra do prazo só aparece quando algum prazo fechou', () => {
    const { container, rerender } = render(<PrazoNoMarinho noPrazo={0} fora={0} perdidos={0} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<PrazoNoMarinho noPrazo={3} fora={1} perdidos={0} />)
    expect(container).not.toBeEmptyDOMElement()
  })

  it('fila vazia não desenha pontos', () => {
    const { container } = render(<PontosNoMarinho urgencias={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('faixa Marinho — meta do mês (o único dourado)', () => {
  it('mostra realizado, ritmo por dia útil e dias sem venda', () => {
    render(<MetaNoMarinho vgl={VGL} />)
    expect(screen.getByText('R$ 250k')).toBeInTheDocument()
    expect(screen.getByText(/25% de R\$ 1,0M/)).toBeInTheDocument()
    // faltam 750k em 25 dias úteis = 30k/dia
    expect(screen.getByText('faltam R$ 750k · R$ 30k/dia útil')).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
  })

  it('meta batida não pede ritmo', () => {
    render(<MetaNoMarinho vgl={{ ...VGL, realizadoMes: 1_200_000, faltaParaMeta: 0 }} />)
    expect(screen.getByText(/100% de R\$ 1,0M/)).toBeInTheDocument()
    expect(screen.getByText('meta do mês batida')).toBeInTheDocument()
  })

  it('sem nenhuma venda registrada não inventa contador', () => {
    render(<MetaNoMarinho vgl={{ ...VGL, ultimaVenda: null, diasSemVenda: null }} />)
    expect(screen.getByText(/nenhuma/)).toBeInTheDocument()
  })

  it('antes de carregar mostra a espera, não um zero', () => {
    const { container } = render(<MetaNoMarinho vgl={null} />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })
})

describe('faixa Marinho — o batimento do dia', () => {
  const hora = (h: number, m = 0) => new Date(2026, 10, 23, h, m).getTime()

  it('cada registro sobe a linha no balde de 10 min em que aconteceu', () => {
    const { y } = curvaDoDia([{ t: hora(9, 5), kind: 'interacao' }, { t: hora(9, 7), kind: 'interacao' }], 8, 19, hora(14))
    // 8h às 20h = 72 baldes; 9h05 cai no 7º (índice 6)
    expect(y).toHaveLength(72)
    expect(y[6]).toBe(1)              // 0,5 × 2 registros
    expect(y[5]).toBe(0.5)            // o vizinho recebe metade
    expect(y[20]).toBe(0)
  })

  it('o traço vai só até agora; o resto do dia é trilho', () => {
    expect(curvaDoDia([], 8, 19, hora(14)).ateAgora).toBe(36)
  })

  it('fora da janela do dia não conta', () => {
    const { y } = curvaDoDia([{ t: hora(6), kind: 'lead_novo' }], 8, 19, hora(14))
    expect(y.every(v => v === 0)).toBe(true)
  })

  it('o batimento diz quantos registros houve, para quem não vê', () => {
    render(<Batimento batidas={[{ t: hora(9), kind: 'lead_novo' }, { t: hora(10), kind: 'venda' }]} de={8} ate={19} agora={hora(14)} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/2 registros/)
  })
})

describe('fila do 1º contato', () => {
  it('urgência: folga, metade final, vencido e relógio parado fora do expediente', () => {
    const due = (min: number) => new Date(AGORA + min * 60_000).toISOString()
    expect(urgenciaDe(due(8), AGORA, 10).urgencia).toBe('ok')
    expect(urgenciaDe(due(3), AGORA, 10).urgencia).toBe('alerta')
    expect(urgenciaDe(due(-5), AGORA, 10).urgencia).toBe('risco')
    // lead da noite: vence amanhã cedo — o prazo não está correndo agora
    expect(urgenciaDe(due(600), AGORA, 10).urgencia).toBe('parado')
  })

  it('o mais urgente vem primeiro, com o tempo escrito', () => {
    render(<FilaPrimeiroContato agora={AGORA} prazoMin={10} fila={[
      { id: 'a', nome: 'Folgado', slaDueAt: new Date(AGORA + 8 * 60_000).toISOString() },
      { id: 'b', nome: 'Vencido', corretor: 'Ryan Maciel', slaDueAt: new Date(AGORA - 20 * 60_000).toISOString() },
    ]} />)
    const itens = screen.getAllByRole('listitem')
    expect(itens[0]).toHaveTextContent('Vencido')
    expect(itens[0]).toHaveTextContent('Ryan')
    expect(itens[0]).toHaveTextContent(/venceu há 20 min/)
    expect(itens[1]).toHaveTextContent(/vence em 8 min/)
  })

  it('fila vazia diz que todo lead foi chamado', () => {
    render(<FilaPrimeiroContato fila={[]} agora={AGORA} prazoMin={10} />)
    expect(screen.getByText('Fila vazia')).toBeInTheDocument()
  })
})

describe('equipe, funil e registros', () => {
  it('o placar do corretor mostra quem é, como está e o que fez', () => {
    render(<EquipeCompacta corretores={[CORRETOR]} agora={AGORA} />)
    expect(screen.getByText('Dionata')).toBeInTheDocument()
    expect(screen.getByText('DA')).toBeInTheDocument()
    expect(screen.getByText('Em atividade · há 2 min')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()            // herdados, junto dos leads
    expect(screen.getByTitle('10 de 10 ligações hoje')).toBeInTheDocument()
  })

  it('leads ainda sem a trilha viram traço', () => {
    render(<EquipeCompacta corretores={[{ ...CORRETOR, leads: null }]} agora={AGORA} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('o funil diz cada etapa, as vendas do mês e quanto do funil cada etapa é', () => {
    render(<FunilHeroi porEtapa={{ lead: 6, followup: 91, atendimento: 35, visita: 2, proposta: 1 }} vendasNoMes={3} />)
    const funil = screen.getByRole('img')
    expect(funil.getAttribute('aria-label')).toMatch(/Followup 91/)
    expect(funil.getAttribute('aria-label')).toMatch(/Vendas no mês 3/)
    // 91 de 135 ativos = 67%
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('registros trazem o nome de quem fez e só de quem está na sala', () => {
    render(<AoVivo feed={[
      ...FEED,
      { id: 'x', at: new Date().toISOString(), kind: 'interacao', subTipo: 'whatsapp', leadNome: 'Zé', brokerId: 'fantasma' },
    ]} nomes={NOMES} carregado />)
    expect(screen.getAllByText(/Dionata ·/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Zé/)).not.toBeInTheDocument()
  })

  it('dia sem registro diz isso', () => {
    render(<AoVivo feed={[]} nomes={NOMES} carregado />)
    expect(screen.getByText('Nenhum registro hoje ainda.')).toBeInTheDocument()
  })

  it('descarte devolve a etapa de onde o lead saiu, para o funil descontar', () => {
    expect(etapaDoDescarte('Descartado em Followup — sem interesse')).toBe('followup')
    expect(etapaDoDescarte('Descartado em Leads — duplicado')).toBe('lead')
    expect(etapaDoDescarte('qualquer outra nota')).toBeNull()
    expect(etapaDoDescarte(undefined)).toBeNull()
  })
})

describe('tempo de resposta', () => {
  it('escreve a duração de forma humana', () => {
    expect(textoDaResposta(33, 10)).toBe('33 min')
    expect(textoDaResposta(91, 10)).toBe('1h31')
    expect(textoDaResposta(2484, 10)).toBe('1,7 d')
    expect(textoDaResposta(0, 0)).toBe('—')
  })

  it('sem amostra não inventa número', () => {
    render(<Resposta tempos={{
      primeiroContato:  { mediaMin: 0, medianaMin: 0, amostra: 0, pctDentroSla: 0, slaMin: null },
      segundaTentativa: { mediaMin: 0, medianaMin: 0, amostra: 0 },
    }} />)
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('mostra o prazo que o banco mandou', () => {
    render(<Resposta tempos={{
      primeiroContato:  { mediaMin: 91, medianaMin: 33, amostra: 176, pctDentroSla: 60, slaMin: 10 },
      segundaTentativa: { mediaMin: 2484, medianaMin: 1497, amostra: 153 },
    }} />)
    expect(screen.getByText('no prazo')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
  })
})
