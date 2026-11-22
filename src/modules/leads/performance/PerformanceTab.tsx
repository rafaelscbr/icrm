import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Info, Printer } from 'lucide-react'
import { db } from '../../../lib/db'
import { useLeadsStore } from '../../../store/useLeadsStore'
import { LeadSomenteLeitura } from '../LeadSomenteLeitura'
import { PerfProvider, usePrepararImpressao } from './contexto'
import { escreverFiltros, lerFiltros, rotuloDoPeriodo, type FiltrosPerf } from './filtros'
import { FiltrosBarra } from './FiltrosBarra'
import { BlocoResumo } from './BlocoResumo'
import { BlocoAtividade, BlocoPresenca } from './BlocoAtividade'
import { BlocoLeads } from './BlocoLeads'
import { BlocoTransferencias } from './BlocoTransferencias'
import { BlocoCadencia } from './BlocoCadencia'
import { BlocoFunil } from './BlocoFunil'
import { BlocoDescartes } from './BlocoDescartes'
import type { OpcoesPerf } from './tipos'

/**
 * Aba "Performance" da tela de Leads (migração 098) — relatório do atendimento
 * de cada corretor, só para admin e gestor.
 *
 * Quem decide o acesso de verdade é o banco: toda função perf_* recusa quem não
 * é admin nem gestor. A tela de Leads só deixa de mostrar a aba para os demais.
 *
 * Os filtros moram na URL (pf_*), então o link compartilha a visão. Cada bloco
 * lê o banco quando aparece; o PDF pede todos de uma vez e imprime quando o
 * último chega.
 */
export function PerformanceTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filtros = useMemo(() => lerFiltros(searchParams), [searchParams])
  const setFiltros = useCallback((f: FiltrosPerf) => setSearchParams(escreverFiltros(searchParams, f), { replace: true }), [searchParams, setSearchParams])

  const [opcoes, setOpcoes] = useState<OpcoesPerf | null>(null)
  const [erroOpcoes, setErroOpcoes] = useState<string | null>(null)
  const carregarOpcoes = useCallback(() => {
    setErroOpcoes(null)
    db.performance.opcoes()
      .then(setOpcoes)
      .catch(e => setErroOpcoes((e as { message?: string })?.message ?? 'Falha ao carregar os filtros'))
  }, [])
  useEffect(() => { carregarOpcoes() }, [carregarOpcoes])

  const nomes = useMemo(() => Object.fromEntries((opcoes?.corretores ?? []).map(c => [c.id, c.nome])), [opcoes])

  // Abrir um lead: se ele está na base carregada desta tela (admin ou o próprio
  // dono), abre a ficha de trabalho; senão, a ficha de leitura do gestor.
  const leads = useLeadsStore(s => s.leads)
  const [leitura, setLeitura] = useState<{ id: string; nome: string; corretor: string } | null>(null)
  const abrirLead = useCallback((leadId: string, nome: string, corretorNome: string) => {
    if (leads.some(l => l.id === leadId)) {
      const next = new URLSearchParams(searchParams)
      next.set('lead', leadId)
      setSearchParams(next)
    } else {
      setLeitura({ id: leadId, nome, corretor: corretorNome })
    }
  }, [leads, searchParams, setSearchParams])

  const nomeDoRelatorio = filtros.corretores.length === 1
    ? (nomes[filtros.corretores[0]] ?? 'Corretor')
    : filtros.corretores.length === 0 ? 'Todos os corretores' : filtros.corretores.map(id => (nomes[id] ?? '').split(' ')[0]).join(', ')

  return (
    <PerfProvider filtros={filtros} nomes={nomes} abrirLead={abrirLead}>
      <div className="flex flex-col gap-5">
        {/* Só aparece no papel: o cabeçalho do relatório em PDF. */}
        <header className="perf-so-impressao hidden">
          <p className="text-[12px] tracking-[0.18em] uppercase text-t3">Souza Imobiliária · Performance do corretor</p>
          <h1 className="font-display text-[26px] font-bold text-t1 mt-1">{nomeDoRelatorio}</h1>
          <p className="text-[13px] text-t3 mt-0.5">
            {rotuloDoPeriodo(filtros)} · gerado em {new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </header>

        <p className="flex items-start gap-2 rounded-[14px] border border-info-line bg-info-bg px-4 py-3 text-[13.5px] text-t1" role="note">
          <Info size={16} strokeWidth={1.8} className="text-info flex-shrink-0 mt-px" aria-hidden />
          <span>Ligações do 3C Plus não registradas no iCRM não aparecem aqui.</span>
        </p>

        {erroOpcoes && (
          <p className="text-[13px] text-error" role="alert">
            Não foi possível carregar a lista de corretores e filtros: {erroOpcoes}.{' '}
            <button type="button" onClick={carregarOpcoes} className="underline font-semibold cursor-pointer">Tentar de novo</button>
          </p>
        )}

        <div className="flex items-start gap-2 justify-between flex-wrap">
          <div className="flex-1 min-w-0">
            <FiltrosBarra filtros={filtros} opcoes={opcoes} onChange={setFiltros} />
          </div>
          <BotaoPdf />
        </div>

        <BlocoResumo />
        <BlocoAtividade />
        <BlocoPresenca />
        <BlocoLeads />
        <BlocoTransferencias />
        <BlocoCadencia />
        <BlocoFunil onParadoDias={n => setFiltros({ ...filtros, paradoDias: n })} />
        <BlocoDescartes />
      </div>

      {leitura && (
        <LeadSomenteLeitura leadId={leitura.id} nome={leitura.nome} corretor={leitura.corretor} onClose={() => setLeitura(null)} />
      )}
    </PerfProvider>
  )
}

/** Gera o PDF pela impressão do navegador ("Salvar como PDF"), com todos os blocos carregados. */
function BotaoPdf() {
  const preparar = usePrepararImpressao()
  const [preparando, setPreparando] = useState(false)

  useEffect(() => {
    const antes = () => document.body.classList.add('imprimindo-performance')
    const depois = () => document.body.classList.remove('imprimindo-performance')
    window.addEventListener('beforeprint', antes)
    window.addEventListener('afterprint', depois)
    return () => { window.removeEventListener('beforeprint', antes); window.removeEventListener('afterprint', depois); depois() }
  }, [])

  return (
    <button type="button" disabled={preparando}
            onClick={() => {
              setPreparando(true)
              preparar(() => {
                setPreparando(false)
                // um quadro para os gráficos terminarem de desenhar
                requestAnimationFrame(() => window.print())
              })
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 mt-2.5 rounded-[10px] border border-line bg-surface text-[13px] font-semibold text-t1 hover:bg-s2
                       cursor-pointer disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 nao-imprimir">
      <Printer size={14} strokeWidth={1.9} aria-hidden />
      {preparando ? 'Preparando…' : 'Exportar PDF'}
    </button>
  )
}
