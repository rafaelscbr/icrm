import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResponseTimePanel } from '../modules/pulse/components/ResponseTimePanel'
import { ClosingSummary } from '../modules/pulse/components/ClosingSummary'
import { PageBanner } from '../modules/pulse/components/PageBanner'
import { FaixaAgora, FunilDesenhado, MetaDoMes, RegistrosAoVivo, mediaSemHoje } from '../modules/pulse/components/Sala'
import { etapaDoDescarte } from '../modules/pulse/usePulseStore'
import type { PulseEvent, PulseHoje, PulseBroker, PulseVgl, PulseDestaques } from '../modules/pulse/types'

const DESTAQUES: PulseDestaques = {
  campeaoId: 'b2', whatsapp: 25, avancos: 18,
  horaPico: 13, horaPicoQtd: 25,
  produtoTop: { nome: 'Rogga', qtd: 12 },
  avancosPorEtapa: [{ etapa: 'followup', qtd: 15 }, { etapa: 'venda', qtd: 3 }],
  ligacoesDesfecho: { total: 40, falou: 22, interessados: 4, retornos: 6, semResposta: 18 },
}

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
  leadsNovos: 7, interacoes: 38, visitasMarcadas: 8, mudancasEtapa: 12, ligacoes: 24,
  vendasQtd: 3, vendasValor: 1_250_000, vendasComissao: 62_500,
}

const CORRETORES: PulseBroker[] = [
  { brokerId: 'b1', nome: 'Rafael',        interacoesHoje: 12, leadsHoje: 2, visitasHoje: 1, vendasHoje: 0, ligacoesHoje: 14, ultimaAtividadeAt: new Date().toISOString() },
  { brokerId: 'b2', nome: 'Dionata Alves', interacoesHoje: 5,  leadsHoje: 3, visitasHoje: 0, vendasHoje: 1, ligacoesHoje: 10, ultimaAtividadeAt: null },
]

const FEED: PulseEvent[] = [
  { id: '1', at: new Date().toISOString(), kind: 'lead_novo', leadNome: 'Vanessa Lima', produto: 'Garden Park', origem: 'meta_ads', brokerId: 'b2' },
  { id: '2', at: new Date().toISOString(), kind: 'etapa', leadNome: 'João', fromStage: 'followup', toStage: 'visita', brokerId: 'b1' },
  { id: '3', at: new Date().toISOString(), kind: 'venda', leadNome: 'Torre Garden', valor: 850_000, brokerId: 'b1' },
  { id: '4', at: new Date().toISOString(), kind: 'interacao', subTipo: 'whatsapp', leadNome: 'Ana', produto: 'Al Mare', brokerId: 'b1' },
  { id: '5', at: new Date().toISOString(), kind: 'campanha', subTipo: 'dispatch', leadNome: 'Carlos', brokerId: 'b2' },
  { id: '6', at: new Date().toISOString(), kind: 'visita', leadNome: 'Visita Paramount', detalhe: '2026-08-05' },
]

const NOMES = new Map([['b1', 'Rafael'], ['b2', 'Dionata']])

describe('sala de comando — os números do momento', () => {
  it('número que ainda não chegou vira traço, não zero', () => {
    render(<FaixaAgora itens={[
      { rotulo: 'Leads hoje', valor: null },
      { rotulo: 'Esperando 1º contato', valor: 3, tom: 'text-warning', nota: 'todos dentro do prazo' },
    ]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('todos dentro do prazo')).toBeInTheDocument()
  })

  it('média de leads ignora hoje, que ainda está acontecendo', () => {
    expect(mediaSemHoje([{ n: 4 }, { n: 6 }, { n: 1 }])).toBe(5)
    expect(mediaSemHoje([{ n: 9 }])).toBeNull()
  })
})

describe('sala de comando — meta do mês (o único dourado)', () => {
  it('mostra realizado, ritmo por dia útil e dias sem venda', () => {
    render(<MetaDoMes vgl={VGL} />)
    expect(screen.getByText('R$ 250k')).toBeInTheDocument()
    expect(screen.getByText(/25% da meta/)).toBeInTheDocument()
    // faltam 750k em 25 dias úteis = 30k/dia
    expect(screen.getByText('faltam R$ 750k · R$ 30k/dia útil')).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
  })

  it('meta batida não pede ritmo', () => {
    render(<MetaDoMes vgl={{ ...VGL, realizadoMes: 1_200_000, faltaParaMeta: 0 }} />)
    expect(screen.getByText(/100% da meta/)).toBeInTheDocument()
    expect(screen.getByText('meta do mês batida')).toBeInTheDocument()
  })

  it('sem nenhuma venda registrada não inventa contador', () => {
    render(<MetaDoMes vgl={{ ...VGL, ultimaVenda: null, diasSemVenda: null }} />)
    expect(screen.getByText(/nenhuma/)).toBeInTheDocument()
  })

  it('antes de carregar mostra a espera, não um zero', () => {
    const { container } = render(<MetaDoMes vgl={null} />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })
})

describe('sala de comando — funil e registros', () => {
  it('o funil diz cada etapa e as vendas do mês', () => {
    render(<FunilDesenhado porEtapa={{ lead: 6, followup: 91, atendimento: 35, visita: 2, proposta: 1 }} vendasNoMes={3} />)
    const funil = screen.getByRole('img')
    expect(funil.getAttribute('aria-label')).toMatch(/Followup 91/)
    expect(funil.getAttribute('aria-label')).toMatch(/Vendas no mês 3/)
  })

  it('vendas do mês ainda sem dado viram traço', () => {
    render(<FunilDesenhado porEtapa={{}} vendasNoMes={null} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Vendas no mês sem dado/)
  })

  it('registros trazem o nome de quem fez e só de quem está na sala', () => {
    render(<RegistrosAoVivo feed={[
      ...FEED,
      { id: 'x', at: new Date().toISOString(), kind: 'interacao', subTipo: 'whatsapp', leadNome: 'Zé', brokerId: 'fantasma' },
    ]} nomes={NOMES} carregado />)
    expect(screen.getAllByText(/Dionata ·/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Zé/)).not.toBeInTheDocument()
  })

  it('dia sem registro diz isso', () => {
    render(<RegistrosAoVivo feed={[]} nomes={NOMES} carregado />)
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
  it('ResponseTimePanel mostra média, mediana e cumprimento do SLA', () => {
    render(<ResponseTimePanel tempos={{
      primeiroContato:  { mediaMin: 91, medianaMin: 33, amostra: 176, pctDentroSla: 36, slaMin: 10 },
      segundaTentativa: { mediaMin: 2484, medianaMin: 1497, amostra: 153 },
    }} />)
    expect(screen.getByText('1h31')).toBeInTheDocument()
    expect(screen.getByText('mediana 33 min')).toBeInTheDocument()
    expect(screen.getByText('4,6 d')).toBeInTheDocument()
    expect(screen.getByText('mediana 2,8 d')).toBeInTheDocument()
    expect(screen.getByText('36%')).toBeInTheDocument()
    expect(screen.getByText('176 leads')).toBeInTheDocument()
    // o prazo do rótulo é o que o banco mandou, não um número escrito à mão
    expect(screen.getByText('dentro do prazo de 10 min')).toBeInTheDocument()
  })

  it('ResponseTimePanel sem amostra não inventa número nem barra de SLA', () => {
    render(<ResponseTimePanel tempos={{
      primeiroContato:  { mediaMin: 0, medianaMin: 0, amostra: 0, pctDentroSla: 0, slaMin: null },
      segundaTentativa: { mediaMin: 0, medianaMin: 0, amostra: 0 },
    }} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getAllByText('sem dados')).toHaveLength(2)
    expect(screen.queryByText(/dentro do prazo/)).not.toBeInTheDocument()
  })

})

describe('ClosingSummary — relatório do dia fechado', () => {
  const render_ = (over = {}) => render(
    <ClosingSummary hoje={HOJE} destaques={DESTAQUES} corretores={CORRETORES} vgl={VGL} {...over} />
  )

  it('mostra os seis números do dia, incluindo avanços e ligações', () => {
    render_()
    expect(screen.getByText('Avanços no funil')).toBeInTheDocument()
    expect(screen.getByText('Ligações')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()   // mudancasEtapa de HOJE
  })

  it('coroa o campeão indicado pela RPC, não o primeiro da lista', () => {
    render_()
    // b2 = Dionata, mesmo com Rafael tendo mais interações
    expect(screen.getByText('Dionata')).toBeInTheDocument()
  })

  it('destaca produto mais procurado, hora de pico e para onde o funil andou', () => {
    render_()
    expect(screen.getByText('Rogga · 12')).toBeInTheDocument()
    expect(screen.getByText('13h · 25 ações')).toBeInTheDocument()
    expect(screen.getByText('Avanços para Followup')).toBeInTheDocument()
    expect(screen.getByText('Avanços para Venda')).toBeInTheDocument()
  })

  it('mostra a prospecção quando houve ligações', () => {
    render_()
    expect(screen.getByText('Falou com alguém')).toBeInTheDocument()
    expect(screen.getByText('22')).toBeInTheDocument()
  })

  it('mostra a prospecção mesmo zerada — o zero é a informação', () => {
    render_({ destaques: { ...DESTAQUES, ligacoesDesfecho: { total: 0, falou: 0, interessados: 0, retornos: 0, semResposta: 0 } } })
    expect(screen.getByText('Prospecção ativa')).toBeInTheDocument()
    expect(screen.getByText('Ligações feitas')).toBeInTheDocument()
  })

  it('não exibe faturamento diário — em imobiliária o faturamento é do mês', () => {
    render_()
    expect(screen.queryByText(/Faturamento do dia/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Valor vendido/)).not.toBeInTheDocument()
    // o número do mês continua, no rodapé
    expect(screen.getByText(/VGL do mês/)).toBeInTheDocument()
  })

  it('lista só quem produziu no dia', () => {
    render_({ corretores: [
      ...CORRETORES,
      { brokerId: 'b3', nome: 'Parado Silva', interacoesHoje: 0, leadsHoje: 0, visitasHoje: 0, vendasHoje: 0, ligacoesHoje: 0, ultimaAtividadeAt: null },
    ] })
    expect(screen.getByText('Rafael')).toBeInTheDocument()
    expect(screen.queryByText('Parado Silva')).not.toBeInTheDocument()
  })

  it('aguenta um dia sem destaques nenhum', () => {
    expect(() => render_({ destaques: undefined, corretores: [] })).not.toThrow()
    expect(screen.getByText('Nenhuma atividade registrada.')).toBeInTheDocument()
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

