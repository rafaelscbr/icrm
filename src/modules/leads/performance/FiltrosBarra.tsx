import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Segmentado } from '../../../components/shared/visual'
import {
  ROTULO_PERIODO, contarRecortes, intervaloDoPreset, type FiltrosPerf, type PresetPeriodo, type Situacao,
} from './filtros'
import { ETAPAS, ROTULO_ETAPA, ROTULO_ORIGEM } from './formatos'
import type { OpcoesPerf } from './tipos'

/**
 * Barra de filtros do relatório — fica presa no topo enquanto a página rola.
 * Toda mudança vai direto para a URL e os blocos já visíveis releem.
 */
export function FiltrosBarra({ filtros, opcoes, onChange }: {
  filtros: FiltrosPerf
  opcoes: OpcoesPerf | null
  onChange: (f: FiltrosPerf) => void
}) {
  const [mais, setMais] = useState(false)
  const recortes = contarRecortes(filtros)
  const corretores = opcoes?.corretores ?? []
  const ativos = corretores.filter(c => c.ativo && c.papel === 'broker')

  function escolherPeriodo(p: PresetPeriodo) {
    if (p === 'personalizado') onChange({ ...filtros, periodo: p })
    else onChange({ ...filtros, periodo: p, ...intervaloDoPreset(p) })
  }

  return (
    <div className="perf-filtros sticky top-0 z-[5] -mx-1 px-1 py-2.5 bg-page/95 backdrop-blur-sm nao-imprimir">
      <div className="flex items-center gap-2 flex-wrap">
        <MultiEscolha
          rotulo="Corretor"
          vazio={`Todos (${ativos.length})`}
          valores={filtros.corretores}
          opcoes={corretores.map(c => ({ value: c.id, label: c.nome, nota: !c.ativo ? 'inativo' : c.papel === 'admin' ? 'admin' : undefined }))}
          onChange={v => onChange({ ...filtros, corretores: v })}
        />

        <Segmentado<PresetPeriodo>
          rotulo="Período"
          valor={filtros.periodo}
          onChange={escolherPeriodo}
          opcoes={(['hoje', 'ontem', '7d', 'mes', 'personalizado'] as PresetPeriodo[]).map(p => ({ value: p, label: ROTULO_PERIODO[p] }))}
        />

        {filtros.periodo === 'personalizado' && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-t3">
            <label className="sr-only" htmlFor="perf-de">De</label>
            <input id="perf-de" type="date" value={filtros.de} max={filtros.ate}
                   onChange={e => e.target.value && onChange({ ...filtros, de: e.target.value, ate: e.target.value > filtros.ate ? e.target.value : filtros.ate })}
                   className="h-9 px-2.5 rounded-[10px] bg-s2 text-[13px] text-t1 tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
            a
            <label className="sr-only" htmlFor="perf-ate">Até</label>
            <input id="perf-ate" type="date" value={filtros.ate} min={filtros.de}
                   onChange={e => e.target.value && onChange({ ...filtros, ate: e.target.value, de: e.target.value < filtros.de ? e.target.value : filtros.de })}
                   className="h-9 px-2.5 rounded-[10px] bg-s2 text-[13px] text-t1 tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
          </span>
        )}

        <button type="button" onClick={() => setMais(v => !v)} aria-expanded={mais}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[13px] font-semibold cursor-pointer
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                            ${recortes > 0 ? 'bg-brand-tint text-brand-text' : 'text-t2 hover:bg-s2'}`}>
          <SlidersHorizontal size={14} strokeWidth={1.9} aria-hidden />
          Mais filtros{recortes > 0 && <span className="tabular-nums">· {recortes}</span>}
        </button>
        {recortes > 0 && (
          <button type="button" onClick={() => onChange({ ...filtros, produtos: [], origens: [], anuncios: [], etapas: [], situacao: 'todos' })}
                  className="inline-flex items-center gap-1 h-9 px-2.5 rounded-[10px] text-[13px] text-t3 hover:text-t1 hover:bg-s2 cursor-pointer">
            <X size={13} strokeWidth={2} aria-hidden /> Limpar
          </button>
        )}
      </div>

      {mais && (
        <div className="flex items-center gap-2 flex-wrap mt-2.5">
          <MultiEscolha rotulo="Produto" vazio="Todos os produtos" valores={filtros.produtos}
                        opcoes={(opcoes?.produtos ?? []).map(p => ({ value: p, label: p }))}
                        onChange={v => onChange({ ...filtros, produtos: v })} />
          <MultiEscolha rotulo="Origem" vazio="Todas as origens" valores={filtros.origens}
                        opcoes={(opcoes?.origens ?? []).map(o => ({ value: o, label: ROTULO_ORIGEM[o] ?? o }))}
                        onChange={v => onChange({ ...filtros, origens: v })} />
          <MultiEscolha rotulo="Anúncio" vazio="Todos os anúncios" valores={filtros.anuncios} comBusca
                        opcoes={(opcoes?.anuncios ?? []).map(a => ({ value: a.id, label: a.nome ?? a.id, nota: `${a.leads} leads` }))}
                        onChange={v => onChange({ ...filtros, anuncios: v })} />
          <MultiEscolha rotulo="Etapa" vazio="Todas as etapas" valores={filtros.etapas}
                        opcoes={ETAPAS.map(e => ({ value: e, label: ROTULO_ETAPA[e] }))}
                        onChange={v => onChange({ ...filtros, etapas: v })} />
          <Segmentado<Situacao>
            rotulo="Situação do lead"
            valor={filtros.situacao}
            onChange={s => onChange({ ...filtros, situacao: s })}
            opcoes={[{ value: 'todos', label: 'Ativos e descartados' }, { value: 'ativos', label: 'Só ativos' }, { value: 'descartados', label: 'Só descartados' }]}
          />
        </div>
      )}
    </div>
  )
}

/** Escolha de vários itens num menu; vazio = todos. */
function MultiEscolha({ rotulo, vazio, valores, opcoes, onChange, comBusca = false }: {
  rotulo: string
  vazio: string
  valores: string[]
  opcoes: { value: string; label: string; nota?: string }[]
  onChange: (v: string[]) => void
  comBusca?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false) } }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc, true) }
  }, [aberto])

  const vistas = useMemo(() => {
    const t = termo.trim().toLowerCase()
    return t ? opcoes.filter(o => o.label.toLowerCase().includes(t)) : opcoes
  }, [opcoes, termo])

  const sel = new Set(valores)
  const texto = valores.length === 0
    ? vazio
    : valores.length === 1 ? (opcoes.find(o => o.value === valores[0])?.label ?? '1 escolhido') : `${valores.length} escolhidos`

  return (
    <div ref={raiz} className="relative">
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto} aria-haspopup="listbox"
              className={`inline-flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-[10px] text-[13px] cursor-pointer max-w-[260px]
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                          ${valores.length > 0 ? 'bg-brand-tint text-brand-text font-semibold' : 'bg-s2 text-t1 hover:bg-s3'}`}>
        <span className="text-t4 font-normal">{rotulo}:</span>
        <span className="truncate">{texto}</span>
        <ChevronDown size={13} strokeWidth={1.9} className="flex-shrink-0" aria-hidden />
      </button>

      {aberto && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-[280px] bg-surface border border-line rounded-[14px] shadow-dropdown overflow-hidden"
             role="listbox" aria-multiselectable="true" aria-label={rotulo}>
          {comBusca && (
            <div className="p-2 border-b border-line">
              <label className="relative block">
                <span className="sr-only">Buscar {rotulo.toLowerCase()}</span>
                <Search size={13} strokeWidth={1.8} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-t4" aria-hidden />
                <input value={termo} onChange={e => setTermo(e.target.value)} placeholder="Buscar"
                       className="w-full h-8 pl-7 pr-2 rounded-[8px] bg-s2 text-[13px] text-t1 focus:outline-none" />
              </label>
            </div>
          )}
          <button type="button" onClick={() => onChange([])}
                  className="w-full flex items-center gap-2 px-3 min-h-[38px] text-left text-[13px] text-t2 hover:bg-s2">
            <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center ${valores.length === 0 ? 'bg-brand-fill border-brand-fill' : 'border-line-strong'}`}>
              {valores.length === 0 && <Check size={11} strokeWidth={3} className="text-brand-fill-text" />}
            </span>
            {vazio}
          </button>
          <ul className="max-h-[300px] overflow-y-auto pb-1">
            {vistas.map(o => {
              const marcado = sel.has(o.value)
              return (
                <li key={o.value}>
                  <button type="button" role="option" aria-selected={marcado}
                          onClick={() => onChange(marcado ? valores.filter(v => v !== o.value) : [...valores, o.value])}
                          className="w-full flex items-center gap-2 px-3 min-h-[38px] text-left text-[13px] text-t1 hover:bg-s2">
                    <span className={`w-4 h-4 flex-shrink-0 rounded-[5px] border flex items-center justify-center ${marcado ? 'bg-brand-fill border-brand-fill' : 'border-line-strong'}`}>
                      {marcado && <Check size={11} strokeWidth={3} className="text-brand-fill-text" />}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{o.label}</span>
                    {o.nota && <span className="text-[11.5px] text-t4 flex-shrink-0">{o.nota}</span>}
                  </button>
                </li>
              )
            })}
            {vistas.length === 0 && <li className="px-3 py-3 text-[13px] text-t4">Nada encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
