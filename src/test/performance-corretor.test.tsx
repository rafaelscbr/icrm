import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  contarRecortes, diaSP, escreverFiltros, filtrosPadrao, intervaloDoPreset, lerFiltros, limparFiltros,
  paraBanco, rotuloDoPeriodo, somarDias,
} from '../modules/leads/performance/filtros'
import {
  minutoDoDiaSP, nomeDeArquivo, paraCsv, pct, rotuloDia, rotuloMotivo, tempoUtil,
} from '../modules/leads/performance/formatos'
import { deveRegistrar, INTERVALO_PRESENCA_MS } from '../lib/presenca'
import { filtrarCadencia } from '../modules/leads/performance/BlocoCadencia'
import { PerfProvider } from '../modules/leads/performance/contexto'
import { BlocoResumo } from '../modules/leads/performance/BlocoResumo'
import { MapaDeCalor } from '../modules/leads/performance/BlocoAtividade'
import { db } from '../lib/db'
import type { Cadencia, Resumo, ResumoCorretor } from '../modules/leads/performance/tipos'

// Performance do corretor (migração 098). O que se protege aqui:
//   • período e filtros saem certos da URL e voltam para ela (link compartilhável);
//   • os dias são de São Paulo, não do fuso da máquina;
//   • formatos de tempo, porcentagem e CSV;
//   • o limite de presença de 15 minutos;
//   • o resumo desenha os números do banco sem recalcular nada.

// 18/11/2026 23:30 em São Paulo = 19/11 02:30 UTC — a virada de dia é o caso que importa.
const NOITE_SP = new Date('2026-11-19T02:30:00Z')

describe('filtros', () => {
  it('o dia de hoje é o de São Paulo, não o do UTC', () => {
    expect(diaSP(NOITE_SP)).toBe('2026-11-18')
  })

  it('soma dias atravessando mês e ano', () => {
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(somarDias('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('presets de período', () => {
    expect(intervaloDoPreset('hoje', NOITE_SP)).toEqual({ de: '2026-11-18', ate: '2026-11-18' })
    expect(intervaloDoPreset('ontem', NOITE_SP)).toEqual({ de: '2026-11-17', ate: '2026-11-17' })
    expect(intervaloDoPreset('7d', NOITE_SP)).toEqual({ de: '2026-11-12', ate: '2026-11-18' })
    expect(intervaloDoPreset('mes', NOITE_SP)).toEqual({ de: '2026-11-01', ate: '2026-11-18' })
  })

  it('ida e volta pela URL, sem sujar com os padrões', () => {
    const f = {
      ...filtrosPadrao(NOITE_SP),
      corretores: ['ryan', 'dio'], periodo: 'personalizado' as const, de: '2026-11-14', ate: '2026-11-18',
      produtos: ['Greenview, torre B'], etapas: ['followup'], situacao: 'ativos' as const, paradoDias: 5,
    }
    const sp = escreverFiltros(new URLSearchParams('aba=performance&lead=x'), f)
    expect(sp.get('aba')).toBe('performance')
    expect(sp.get('lead')).toBe('x')
    expect(sp.getAll('pf_c')).toEqual(['ryan', 'dio'])
    // vírgula no nome do produto não quebra a lista
    expect(sp.getAll('pf_prod')).toEqual(['Greenview, torre B'])
    expect(lerFiltros(sp, NOITE_SP)).toEqual(f)

    const padrao = escreverFiltros(new URLSearchParams(), filtrosPadrao(NOITE_SP))
    expect(padrao.toString()).toBe('')
  })

  it('URL inválida volta ao padrão em vez de quebrar', () => {
    const f = lerFiltros(new URLSearchParams('pf_p=xyz&pf_sit=talvez&pf_par=-3'), NOITE_SP)
    expect(f.periodo).toBe('7d')
    expect(f.situacao).toBe('todos')
    expect(f.paradoDias).toBe(3)
    // personalizado com fim antes do início usa só o início
    const g = lerFiltros(new URLSearchParams('pf_p=personalizado&pf_de=2026-11-10&pf_ate=2026-11-01'), NOITE_SP)
    expect([g.de, g.ate]).toEqual(['2026-11-10', '2026-11-10'])
  })

  it('sair da aba tira só os filtros do relatório', () => {
    const sp = limparFiltros(new URLSearchParams('lead=1&pf_c=a&pf_p=mes&pf_sit=ativos'))
    expect(sp.toString()).toBe('lead=1')
  })

  it('formato enviado ao banco e contagem de recortes', () => {
    const f = { ...filtrosPadrao(NOITE_SP), origens: ['meta_ads'], situacao: 'descartados' as const }
    expect(paraBanco(f, 10)).toMatchObject({ de: '2026-11-12', ate: '2026-11-18', origens: ['meta_ads'], situacao: 'descartados', parado_dias: 3, max_tentativas: 10 })
    expect(contarRecortes(f)).toBe(2)
  })

  it('rótulo do período', () => {
    expect(rotuloDoPeriodo({ de: '2026-11-14', ate: '2026-11-18' })).toBe('14/11 a 18/11/2026')
    expect(rotuloDoPeriodo({ de: '2026-11-18', ate: '2026-11-18' })).toBe('18/11/2026')
    expect(rotuloDoPeriodo({ de: '2025-12-20', ate: '2026-01-05' })).toBe('20/12/2025 a 05/01/2026')
  })
})

describe('formatos', () => {
  it('tempo útil', () => {
    expect(tempoUtil(null)).toBe('—')
    expect(tempoUtil(0)).toBe('na hora')
    expect(tempoUtil(7.4)).toBe('7 min')
    expect(tempoUtil(72.2)).toBe('1h12')
    expect(tempoUtil(120)).toBe('2h')
    expect(tempoUtil(900)).toBe('1,5 d úteis')
  })

  it('porcentagem sem base não inventa número', () => {
    expect(pct(16, 24)).toBe('67%')
    expect(pct(0, 0)).toBe('—')
  })

  it('hora e dia em São Paulo', () => {
    expect(minutoDoDiaSP('2026-11-18T12:44:00Z')).toBe(9 * 60 + 44)
    expect(rotuloDia('2026-11-17')).toBe('ter 17/11')
  })

  it('CSV para o Excel em português', () => {
    const csv = paraCsv(['Lead', 'Tempo'], [['Ana; Paula', 7.5], ['Bruno "Bru"', null]])
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv.slice(1)).toBe('Lead;Tempo\r\n"Ana; Paula";7,5\r\n"Bruno ""Bru""";')
  })

  it('nome de arquivo e motivo', () => {
    expect(nomeDeArquivo('Performance', 'Ryan Maciel', '2026-11-14')).toBe('performance-ryan-maciel-2026-11-14')
    expect(rotuloMotivo('sem_condicao')).toBe('Sem condição'.replace('ção', 'cao'))
    expect(rotuloMotivo('sem_condicao', { sem_condicao: 'Sem condição financeira' })).toBe('Sem condição financeira')
    expect(rotuloMotivo(null)).toBe('Sem motivo')
  })
})

describe('presença', () => {
  it('só chama o banco depois de 15 minutos', () => {
    const t = 1_000_000_000
    expect(deveRegistrar(null, t)).toBe(true)
    expect(deveRegistrar(t, t + INTERVALO_PRESENCA_MS - 1)).toBe(false)
    expect(deveRegistrar(t, t + INTERVALO_PRESENCA_MS)).toBe(true)
    // relógio do aparelho voltou: não fica travado
    expect(deveRegistrar(t, t - 60_000)).toBe(true)
  })
})

describe('cadência', () => {
  const lead = (id: string, etapa: string, grupo: Cadencia['leads'][number]['grupo'], contato_ref: boolean) =>
    ({ lead_id: id, etapa, grupo, contato_ref }) as Cadencia['leads'][number]
  const leads = [
    lead('a', 'followup', 'diario', true),
    lead('b', 'followup', 'sem_contato_hoje', false),
    lead('c', 'atendimento', 'nunca_contatou', false),
    lead('d', 'atendimento', 'diario', true),
  ]
  it('grupos prontos', () => {
    expect(filtrarCadencia(leads, 'todos')).toHaveLength(4)
    expect(filtrarCadencia(leads, 'diario').map(l => l.lead_id)).toEqual(['a', 'd'])
    expect(filtrarCadencia(leads, 'nunca_contatou').map(l => l.lead_id)).toEqual(['c'])
    expect(filtrarCadencia(leads, 'atendimento_sem_hoje').map(l => l.lead_id)).toEqual(['c'])
  })
})

describe('mapa de calor', () => {
  it('sem ações diz que não há, em vez de uma grade vazia', () => {
    render(<MapaDeCalor celulas={[]} />)
    expect(screen.getByText('Nenhuma ação registrada no período.')).toBeInTheDocument()
  })
  it('ações fora da régua são contadas à parte', () => {
    render(<MapaDeCalor celulas={[{ dow: 1, hora: 10, n: 4 }, { dow: 1, hora: 23, n: 2 }]} />)
    expect(screen.getByTitle('seg às 10h: 4 ações')).toBeInTheDocument()
    expect(screen.getByText('2 ações antes das 6h ou depois das 22h.')).toBeInTheDocument()
  })
})

// ── Resumo: desenha o que o banco devolveu ───────────────────────────────────

const ryan: ResumoCorretor = {
  id: 'rya', nome: 'Ryan Maciel',
  recebidos: { rodizio: 24, manual_eventos: 24, manual_leads: 24, pingue_eventos: 20, pingue_leads: 7 },
  enviados: { manual: 0, pingue_eventos: 27, pingue_leads: 13 },
  atendidos: 16, perdidos_pingue: 8, recuperados: 2,
  contatos: { total: 64, whatsapp: 54, ligacao: 10, leads: 23 },
  carteira: { followup: 35, atendimento: 8 }, avancos: 28, descartes: 3,
  primeiro_contato: {
    dentro: { recebidos: 5, contatados: 2, mediana_min: 72.2, no_prazo: 1 },
    fora: { recebidos: 19, contatados: 14, mediana_min: 0, no_prazo: 13 },
  },
}
const resumo = (corretores: ResumoCorretor[]): Resumo => ({ periodo: { de: '2026-11-14', ate: '2026-11-18' }, prazo_min: 10, corretores })

const bloco = vi.spyOn(db.performance, 'bloco')

// O happy-dom não calcula layout: o observador nunca diria que o bloco
// apareceu. Aqui todo elemento observado "aparece" na hora.
class ObservadorQueSempreVe {
  constructor(private cb: (es: { isIntersecting: boolean }[]) => void) {}
  observe() { this.cb([{ isIntersecting: true }]) }
  disconnect() {}
  unobserve() {}
}
vi.stubGlobal('IntersectionObserver', ObservadorQueSempreVe)

function montar(corretores: string[]) {
  const filtros = { ...filtrosPadrao(NOITE_SP), corretores, periodo: 'personalizado' as const, de: '2026-11-14', ate: '2026-11-18' }
  return render(
    <MemoryRouter>
      <PerfProvider filtros={filtros} nomes={{ rya: 'Ryan Maciel', dio: 'Dionata Alves' }} abrirLead={() => {}}>
        <BlocoResumo />
      </PerfProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  bloco.mockReset()
  // Nada de chamada real ao banco: o que o teste não preparar, falha aqui.
  bloco.mockImplementation(() => Promise.reject(new Error('chamada ao banco não prevista no teste')))
})

describe('bloco de resumo', () => {
  it('pede ao banco o resumo com os filtros e mostra os números do Ryan', async () => {
    bloco.mockResolvedValue(resumo([ryan]))
    montar(['rya'])
    expect(await screen.findByText('Pelo rodízio')).toBeInTheDocument()
    expect(bloco).toHaveBeenCalledWith('resumo', expect.objectContaining({ corretores: ['rya'], de: '2026-11-14', ate: '2026-11-18' }))

    const quadro = (rotulo: string) => screen.getByText(rotulo).closest('div')!
    expect(within(quadro('Pelo rodízio')).getByText('24')).toBeInTheDocument()
    expect(within(quadro('Atendidos')).getByText('16')).toBeInTheDocument()
    expect(within(quadro('Atendidos')).getByText('67% dos 24')).toBeInTheDocument()
    expect(within(quadro('Perdidos no pingue-pongue')).getByText('8')).toBeInTheDocument()
    expect(within(quadro('Contatos')).getByText('64')).toBeInTheDocument()
    expect(within(quadro('Contatos')).getByText('54 WhatsApp · 10 ligações')).toBeInTheDocument()
    expect(within(quadro('Descartes')).getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Tempo até o 1º contato · prazo de 10 min')).toBeInTheDocument()
    expect(screen.getByText(/1 de 5 · mediana 1h12 · 3 sem contato/)).toBeInTheDocument()
  })

  it('com dois corretores, compara lado a lado e marca o melhor da linha', async () => {
    const dio: ResumoCorretor = { ...ryan, id: 'dio', nome: 'Dionata Alves', atendidos: 20, perdidos_pingue: 2, contatos: { ...ryan.contatos, total: 90 } }
    bloco.mockResolvedValue(resumo([dio, ryan]))
    montar(['rya', 'dio'])
    const tabela = await screen.findByRole('table', { name: 'Comparação entre corretores' })
    expect(within(tabela).getByRole('columnheader', { name: 'Dionata' })).toBeInTheDocument()
    expect(within(tabela).getByRole('columnheader', { name: 'Ryan' })).toBeInTheDocument()
    const linha = within(tabela).getByRole('row', { name: /^Contatos 90 64$/ })
    expect(within(linha).getByText('90')).toHaveClass('text-success')
    const perdidos = within(tabela).getByRole('row', { name: /Perdidos no pingue-pongue/ })
    expect(within(perdidos).getByText('2')).toHaveClass('text-success')
  })

  it('falha do banco aparece no bloco, com tentar de novo', async () => {
    bloco.mockRejectedValueOnce(new Error('O relatório de performance é só para gestor ou admin'))
    montar(['rya'])
    expect(await screen.findByText('Não foi possível carregar este bloco.')).toBeInTheDocument()
    expect(screen.getByText('O relatório de performance é só para gestor ou admin')).toBeInTheDocument()
    bloco.mockResolvedValueOnce(resumo([ryan]))
    screen.getByRole('button', { name: 'Tentar de novo' }).click()
    await waitFor(() => expect(screen.getByText('Pelo rodízio')).toBeInTheDocument())
  })
})
