import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { db, type PerfFuncao } from '../../../lib/db'
import { MAX_TENTATIVAS_FOLLOWUP } from '../../../types'
import { paraBanco, type FiltrosPerf } from './filtros'

/**
 * O que todos os blocos do relatório compartilham: os filtros (e a chave que
 * muda quando eles mudam), o pedido de "carregar tudo" para o PDF e o aviso de
 * quem já terminou de carregar.
 *
 * Cada bloco lê o banco só quando aparece na tela (ou quando o PDF pede tudo):
 * abrir a aba não dispara as oito leituras de uma vez. Trocar um filtro relê
 * só os blocos que já tinham sido vistos.
 */

interface Contexto {
  filtros: FiltrosPerf
  /** os filtros no formato do banco, em texto — muda quando qualquer filtro muda */
  chave: string
  carregarTudo: boolean
  reportar: (id: string, pronto: boolean) => void
  sair: (id: string) => void
  /** nomes dos corretores, para os blocos que só recebem o id */
  nomeDoCorretor: (id: string) => string
  abrirLead: (leadId: string, nome: string, corretorNome: string) => void
}

const Ctx = createContext<Contexto | null>(null)

export function usePerf() {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePerf fora do PerfProvider')
  return c
}

export function PerfProvider({ filtros, nomes, abrirLead, children }: {
  filtros: FiltrosPerf
  nomes: Record<string, string>
  abrirLead: Contexto['abrirLead']
  children: ReactNode
}) {
  const chave = useMemo(() => JSON.stringify(paraBanco(filtros, MAX_TENTATIVAS_FOLLOWUP)), [filtros])
  const [carregarTudo, setCarregarTudo] = useState(false)
  const prontos = useRef(new Map<string, boolean>())
  const [, setVersao] = useState(0)
  const esperando = useRef<(() => void) | null>(null)

  const conferir = useCallback(() => {
    if (!esperando.current) return
    const todos = [...prontos.current.values()]
    if (todos.length > 0 && todos.every(Boolean)) {
      const fn = esperando.current
      esperando.current = null
      fn()
    }
  }, [])

  const reportar = useCallback((id: string, pronto: boolean) => {
    prontos.current.set(id, pronto)
    setVersao(v => v + 1)
    conferir()
  }, [conferir])

  const sair = useCallback((id: string) => {
    prontos.current.delete(id)
    conferir()
  }, [conferir])

  const nomeDoCorretor = useCallback((id: string) => nomes[id] ?? 'Corretor', [nomes])

  const valor = useMemo<Contexto & { prepararImpressao: (fn: () => void) => void }>(() => ({
    filtros, chave, carregarTudo, reportar, sair, nomeDoCorretor, abrirLead,
    prepararImpressao: (fn: () => void) => {
      esperando.current = () => { fn() }
      setCarregarTudo(true)
      // Se tudo já estava carregado, imprime na próxima volta do laço.
      setTimeout(conferir, 0)
    },
  }), [filtros, chave, carregarTudo, reportar, sair, nomeDoCorretor, abrirLead, conferir])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/** Pede ao provedor que carregue todos os blocos e chama `fn` quando todos estiverem prontos. */
export function usePrepararImpressao() {
  const c = useContext(Ctx) as (Contexto & { prepararImpressao: (fn: () => void) => void }) | null
  if (!c) throw new Error('usePrepararImpressao fora do PerfProvider')
  return c.prepararImpressao
}

export interface EstadoBloco<T> {
  /** coloque no elemento do bloco: é por ele que se sabe se apareceu na tela */
  ref: (el: HTMLElement | null) => void
  dados: T | null
  erro: string | null
  /** primeira carga, sem nada em tela */
  carregando: boolean
  /** relendo com o dado anterior ainda em tela (filtro mudou) */
  atualizando: boolean
  recarregar: () => void
}

/** Lê um bloco do banco quando ele aparece e sempre que os filtros mudam. */
export function useBloco<T>(funcao: PerfFuncao): EstadoBloco<T> {
  const { chave, carregarTudo, reportar, sair } = usePerf()
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [visto, setVisto] = useState(false)
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [lidoCom, setLidoCom] = useState<string | null>(null)
  const pedido = useRef(0)

  useEffect(() => {
    if (!el || visto) return
    if (typeof IntersectionObserver === 'undefined') { setVisto(true); return }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setVisto(true) }, { rootMargin: '240px' })
    io.observe(el)
    return () => io.disconnect()
  }, [el, visto])

  const ler = useCallback(async (k: string) => {
    const meu = ++pedido.current
    setLendo(true)
    try {
      const r = await db.performance.bloco<T>(funcao, JSON.parse(k) as Record<string, unknown>)
      if (meu !== pedido.current) return
      setDados(r)
      setErro(null)
      setLidoCom(k)
    } catch (e) {
      if (meu !== pedido.current) return
      // Falhou: não se mostra o número antigo como se fosse do filtro novo.
      setDados(null)
      setErro((e as { message?: string })?.message ?? 'Falha ao ler o relatório')
      setLidoCom(k)
    } finally {
      if (meu === pedido.current) setLendo(false)
    }
  }, [funcao])

  const ativo = visto || carregarTudo
  useEffect(() => {
    if (ativo && lidoCom !== chave && !lendo) void ler(chave)
  }, [ativo, chave, lidoCom, lendo, ler])

  const pronto = lidoCom === chave && !lendo
  useEffect(() => { reportar(funcao, pronto) }, [funcao, pronto, reportar])
  useEffect(() => () => sair(funcao), [funcao, sair])

  return {
    ref: setEl,
    dados,
    erro,
    carregando: dados === null && erro === null,
    atualizando: dados !== null && (lendo || lidoCom !== chave),
    recarregar: () => void ler(chave),
  }
}
