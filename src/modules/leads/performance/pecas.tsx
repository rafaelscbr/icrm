import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Download, Loader2, RefreshCw, Search } from 'lucide-react'
import { destacar } from '../../../components/shared/Destaque'
import type { EstadoBloco } from './contexto'
import { baixarCsv, paraCsv } from './formatos'

/**
 * Peças do relatório de Performance — padrão Folha: seção em `bento`, título
 * em Plus Jakarta com a palavra que importa em destaque, números tabulares,
 * cor só onde há significado (sucesso, atenção, risco).
 */

/** Uma seção do relatório: título, estado de carga/erro/vazio e o conteúdo. */
export function Bloco<T>({ titulo, descricao, acao, estado, vazio, textoVazio, altura = 220, children }: {
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
  estado: EstadoBloco<T>
  /** recebe o dado e diz se está vazio */
  vazio?: (d: T) => boolean
  textoVazio?: string
  /** altura do esqueleto, no formato aproximado do conteúdo */
  altura?: number
  children: (d: T) => ReactNode
}) {
  const { dados, erro, carregando, atualizando, recarregar, ref } = estado
  return (
    <section ref={ref} className="bento min-w-0 overflow-hidden perf-bloco">
      <header className="flex items-start justify-between gap-3 flex-wrap px-5 lg:px-6 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="font-display text-[16px] font-bold tracking-[-0.015em] text-t1">{destacar(titulo)}</h3>
          {descricao && <p className="text-[12.5px] text-t3 mt-0.5 max-w-[72ch]">{descricao}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 nao-imprimir">
          {atualizando && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-t4" role="status">
              <Loader2 size={12} className="animate-spin" aria-hidden /> Atualizando
            </span>
          )}
          {dados !== null && acao}
        </div>
      </header>

      <div className="px-5 lg:px-6 pb-5">
        {erro ? (
          <div role="alert" className="rounded-[14px] border border-error-line bg-error-bg px-4 py-3.5">
            <p className="text-[14px] font-semibold text-t1">Não foi possível carregar este bloco.</p>
            <p className="text-[13px] text-t3 mt-0.5">{erro}</p>
            <button type="button" onClick={recarregar}
                    className="mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-surface border border-line text-[13px] font-semibold text-t1 hover:bg-s2 cursor-pointer nao-imprimir">
              <RefreshCw size={13} strokeWidth={1.9} aria-hidden /> Tentar de novo
            </button>
          </div>
        ) : carregando || dados === null ? (
          <div className="rounded-[14px] shimmer" style={{ height: altura }} role="status" aria-label={`Carregando ${titulo.replace(/\*/g, '')}`} />
        ) : vazio?.(dados) ? (
          <p className="text-[13.5px] text-t4 py-6">{textoVazio ?? 'Nada no período e nos filtros escolhidos.'}</p>
        ) : (
          <div className={`transition-opacity ${atualizando ? 'opacity-60' : ''}`}>{children(dados)}</div>
        )}
      </div>
    </section>
  )
}

/** Um número com rótulo, para as grades de indicadores. */
export function Indicador({ rotulo, valor, nota, tom }: {
  rotulo: string
  valor: ReactNode
  nota?: ReactNode
  tom?: 'sucesso' | 'atencao' | 'risco'
}) {
  const cor = tom === 'sucesso' ? 'text-success' : tom === 'atencao' ? 'text-warning' : tom === 'risco' ? 'text-error' : 'text-t1'
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-[12px] text-t4 truncate">{rotulo}</dt>
      <dd className={`mt-0.5 font-display text-[20px] font-extrabold tabular-nums leading-tight tracking-[-0.02em] ${cor}`}>{valor}</dd>
      {nota && <p className="text-[12px] text-t4 mt-0.5 leading-snug">{nota}</p>}
    </div>
  )
}

/** Grade de indicadores com filetes entre as células (o quadro da ficha). */
export function Quadro({ children, colunas = 4 }: { children: ReactNode; colunas?: 2 | 3 | 4 }) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[colunas]
  return (
    <dl className={`grid grid-cols-2 ${cols} gap-px bg-line rounded-[16px] overflow-hidden shadow-[0_0_0_1px_var(--line)] [&>*]:bg-s2`}>
      {children}
    </dl>
  )
}

/** Botão de baixar CSV. */
export function BotaoCsv({ nome, cabecalho, linhas }: {
  nome: string
  cabecalho: string[]
  linhas: () => (string | number | null | undefined)[][]
}) {
  return (
    <button type="button" onClick={() => baixarCsv(nome, paraCsv(cabecalho, linhas()))}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] text-[12.5px] font-semibold text-t2 border border-line bg-surface hover:bg-s2 cursor-pointer
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
      <Download size={13} strokeWidth={1.9} aria-hidden /> CSV
    </button>
  )
}

export interface Coluna<T> {
  chave: string
  rotulo: string
  valor: (r: T) => ReactNode
  /** valor de ordenação; sem ele a coluna não ordena */
  ordem?: (r: T) => string | number | null
  alinhar?: 'direita'
  classe?: string
}

/** Tabela ordenável, com busca opcional e "mostrar mais". */
export function Tabela<T>({ colunas, linhas, chave, onLinha, busca, ordemInicial, limite = 50, rotulo }: {
  colunas: Coluna<T>[]
  linhas: T[]
  chave: (r: T) => string
  onLinha?: (r: T) => void
  /** texto pesquisável de cada linha; sem ela não há campo de busca */
  busca?: (r: T) => string
  ordemInicial?: { chave: string; desc: boolean }
  limite?: number
  rotulo: string
}) {
  const [ordem, setOrdem] = useState(ordemInicial ?? null)
  const [termo, setTermo] = useState('')
  const [mostrar, setMostrar] = useState(limite)

  const vistas = useMemo(() => {
    const t = termo.trim().toLowerCase()
    let r = t && busca ? linhas.filter(l => busca(l).toLowerCase().includes(t)) : linhas
    const col = ordem ? colunas.find(c => c.chave === ordem.chave) : undefined
    if (col?.ordem) {
      const f = col.ordem
      r = [...r].sort((a, b) => {
        const va = f(a); const vb = f(b)
        if (va === vb) return 0
        if (va === null) return 1
        if (vb === null) return -1
        const c = va < vb ? -1 : 1
        return ordem!.desc ? -c : c
      })
    }
    return r
  }, [linhas, termo, busca, ordem, colunas])

  return (
    <div className="min-w-0">
      {busca && (
        <label className="relative block max-w-[320px] mb-3 nao-imprimir">
          <span className="sr-only">Buscar em {rotulo}</span>
          <Search size={14} strokeWidth={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-t4" aria-hidden />
          <input value={termo} onChange={e => { setTermo(e.target.value); setMostrar(limite) }}
                 placeholder="Buscar"
                 className="w-full h-9 pl-8 pr-3 rounded-[10px] bg-s2 text-[13.5px] text-t1 placeholder:text-t4
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
        </label>
      )}

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px] tabular-nums" aria-label={rotulo}>
          <thead>
            <tr className="text-left text-[12px] text-t4">
              {colunas.map(c => {
                const ativa = ordem?.chave === c.chave
                const Seta = ativa ? (ordem!.desc ? ArrowDown : ArrowUp) : null
                return (
                  <th key={c.chave} scope="col"
                      aria-sort={ativa ? (ordem!.desc ? 'descending' : 'ascending') : undefined}
                      className={`font-medium px-1 pb-2 whitespace-nowrap ${c.alinhar === 'direita' ? 'text-right' : ''}`}>
                    {c.ordem ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-t1 cursor-pointer"
                              onClick={() => setOrdem(o => o?.chave === c.chave ? { chave: c.chave, desc: !o.desc } : { chave: c.chave, desc: true })}>
                        {c.rotulo}{Seta && <Seta size={11} strokeWidth={2} aria-hidden />}
                      </button>
                    ) : c.rotulo}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {vistas.slice(0, mostrar).map(r => (
              <tr key={chave(r)}
                  onClick={onLinha ? () => onLinha(r) : undefined}
                  onKeyDown={onLinha ? e => { if (e.key === 'Enter') onLinha(r) } : undefined}
                  tabIndex={onLinha ? 0 : undefined}
                  className={`border-t border-line ${onLinha ? 'cursor-pointer hover:bg-s2 focus:outline-none focus-visible:bg-s2' : ''}`}>
                {colunas.map(c => (
                  <td key={c.chave} className={`px-1 py-2 align-top ${c.alinhar === 'direita' ? 'text-right' : ''} ${c.classe ?? ''}`}>
                    {c.valor(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {vistas.length === 0 && <p className="text-[13px] text-t4 py-4">Nenhuma linha com esse termo.</p>}
      {vistas.length > mostrar && (
        <button type="button" onClick={() => setMostrar(m => m + limite)}
                className="mt-3 h-8 px-3 rounded-[9px] text-[13px] font-semibold text-t2 hover:bg-s2 cursor-pointer nao-imprimir">
          Mostrar mais {Math.min(limite, vistas.length - mostrar)} de {vistas.length - mostrar}
        </button>
      )}
    </div>
  )
}

/** Etiqueta curta de situação do lead. */
export function Situacao({ s }: { s: 'ativo' | 'descartado' | 'vendido' }) {
  const m = { ativo: ['Ativo', 'text-t2'], descartado: ['Descartado', 'text-t4'], vendido: ['Vendido', 'text-success'] }[s]
  return <span className={`text-[12.5px] font-medium ${m[1]}`}>{m[0]}</span>
}
