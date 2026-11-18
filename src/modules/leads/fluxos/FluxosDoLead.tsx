import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Check, ChevronDown, History, Loader2, Pencil, Plus, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Lead } from '../../../types'
import { db } from '../../../lib/db'
import { LeadFluxo, ROTULO_DO_MODO } from '../../simulador/shared/fluxo'
import { SimuladorDoLead } from './SimuladorDoLead'

/**
 * Aba "Fluxos" da ficha do lead (19/11/2026) — as simulações guardadas.
 *
 * Um fluxo é uma proposta de pagamento com nome ("Opção 1, entrada maior").
 * Cada gravação é uma versão: a lista mostra a mais recente e, sob demanda, as
 * anteriores. Os números e o texto de cada versão são os congelados na hora de
 * salvar — o que foi proposto ao cliente, não um recálculo.
 *
 * Carrega quando a aba abre (uma leitura por lead) e relê depois de cada ação:
 * a lista é sempre o que o banco devolveu.
 */

function quando(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (mesmoDia) return `hoje às ${hora}`
  const data = d.toLocaleDateString('pt-BR', d.getFullYear() === hoje.getFullYear()
    ? { day: '2-digit', month: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${data} às ${hora}`
}

const primeiroNome = (n: string | null) => (n ?? '').split(' ')[0] || 'alguém'

/** Agrupa as versões por fluxo, a mais recente primeiro; os fluxos pela última gravação. */
export function agruparFluxos(versoes: LeadFluxo[]): LeadFluxo[][] {
  const mapa = new Map<string, LeadFluxo[]>()
  for (const v of versoes) {
    const lista = mapa.get(v.fluxoId)
    if (lista) lista.push(v); else mapa.set(v.fluxoId, [v])
  }
  const grupos = [...mapa.values()]
  for (const g of grupos) g.sort((a, b) => b.versao - a.versao)
  return grupos.sort((a, b) => new Date(b[0].criadoEm).getTime() - new Date(a[0].criadoEm).getTime())
}

// ── Container: carrega, abre o simulador, executa as ações ───────────────────

export function FluxosDoLead({ lead, onSimulador }: {
  lead: Lead
  /** avisa a ficha quando o simulador abre ou fecha (ela pausa o próprio Esc) */
  onSimulador?: (aberto: boolean) => void
}) {
  const [versoes, setVersoes] = useState<LeadFluxo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // null = fechado; { base } = editando a partir de uma versão; {} = fluxo novo
  const [editor, setEditor] = useState<{ base?: LeadFluxo } | null>(null)

  const carregar = useCallback(async () => {
    try {
      setVersoes(await db.leadFluxos.listar(lead.id))
      setErro(null)
    } catch (e) {
      // Falhou: não se mostra uma lista velha como se fosse a de agora.
      setVersoes(null)
      setErro((e as { message?: string })?.message ?? 'Falha ao ler os fluxos')
    }
  }, [lead.id])

  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => { onSimulador?.(editor !== null) }, [editor, onSimulador])

  const grupos = useMemo(() => agruparFluxos(versoes ?? []), [versoes])

  async function marcarEnviado(v: LeadFluxo) {
    setOcupado(v.id)
    try {
      await db.leadFluxos.marcarEnviado(v.id)
      toast.success(`Versão ${v.versao} marcada como enviada`)
      await carregar()
    } catch { /* erro já avisado */ }
    finally { setOcupado(null) }
  }

  async function arquivar(fluxoId: string) {
    setOcupado(fluxoId)
    try {
      await db.leadFluxos.arquivar(fluxoId)
      toast.success('Fluxo arquivado')
      await carregar()
    } catch { /* erro já avisado */ }
    finally { setOcupado(null) }
  }

  const novo = (
    <button type="button" onClick={() => setEditor({})}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover
                       text-[13.5px] font-semibold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
      <Plus size={15} strokeWidth={2.3} aria-hidden /> Novo fluxo
    </button>
  )

  return (
    <section>
      {/* Lead sem fluxo não ganha um "0 fluxos" em cima da explicação. */}
      {(versoes === null || grupos.length > 0) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-[15px] font-semibold text-t1">
            {versoes === null ? 'Fluxos' : `${grupos.length} ${grupos.length === 1 ? 'fluxo' : 'fluxos'}`}
          </h3>
          {versoes !== null && grupos.length > 0 && novo}
        </div>
      )}

      {versoes === null && !erro && (
        <div className="flex flex-col gap-2.5" role="status" aria-label="Carregando os fluxos">
          {[0, 1].map(i => <div key={i} className="h-[92px] rounded-[14px] shimmer" aria-hidden />)}
        </div>
      )}

      {erro && (
        <div role="alert" className="rounded-[14px] border border-error-line bg-error-bg px-4 py-3.5">
          <p className="text-[14px] font-semibold text-t1">Não foi possível carregar os fluxos deste lead.</p>
          <p className="text-[13px] text-t3 mt-0.5">{erro}</p>
          <button type="button" onClick={() => void carregar()}
                  className="mt-3 h-9 px-3.5 rounded-[10px] bg-surface border border-line text-[13px] font-semibold text-t1 hover:bg-s2 cursor-pointer">
            Tentar de novo
          </button>
        </div>
      )}

      {versoes !== null && grupos.length === 0 && (
        <div className="py-2">
          <p className="text-[14.5px] font-semibold text-t1">Nenhum fluxo guardado para este lead.</p>
          <p className="text-[13.5px] text-t3 mt-1 mb-4 max-w-[46ch]">
            Monte a simulação por aqui e ela fica salva na ficha: você reabre para ajustar,
            cada ajuste vira uma versão e o envio ao cliente entra no histórico.
          </p>
          {novo}
        </div>
      )}

      {versoes !== null && grupos.length > 0 && (
        <ListaDeFluxos
          grupos={grupos}
          ocupado={ocupado}
          onAbrir={v => setEditor({ base: v })}
          onMarcarEnviado={v => void marcarEnviado(v)}
          onArquivar={id => void arquivar(id)}
        />
      )}

      {editor && (
        <SimuladorDoLead
          lead={lead}
          base={editor.base}
          nomeSugerido={`Fluxo ${grupos.length + 1}`}
          onClose={() => setEditor(null)}
          onSalvo={() => void carregar()}
        />
      )}
    </section>
  )
}

// ── Lista: só desenha. Sem as funções de ação, é a versão de leitura do gestor ─

export function ListaDeFluxos({ grupos, ocupado = null, onAbrir, onMarcarEnviado, onArquivar }: {
  grupos: LeadFluxo[][]
  /** id da versão ou do fluxo com uma ação em andamento */
  ocupado?: string | null
  onAbrir?: (v: LeadFluxo) => void
  onMarcarEnviado?: (v: LeadFluxo) => void
  onArquivar?: (fluxoId: string) => void
}) {
  return (
    <ul className="flex flex-col">
      {grupos.map(versoes => (
        <Fluxo key={versoes[0].fluxoId} versoes={versoes} ocupado={ocupado}
               onAbrir={onAbrir} onMarcarEnviado={onMarcarEnviado} onArquivar={onArquivar} />
      ))}
    </ul>
  )
}

const BOTAO = `inline-flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-[9px] text-[13px] font-semibold text-t2
  hover:bg-s2 hover:text-t1 cursor-pointer disabled:opacity-50 disabled:cursor-default
  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`

function Fluxo({ versoes, ocupado, onAbrir, onMarcarEnviado, onArquivar }: {
  versoes: LeadFluxo[]
  ocupado: string | null
  onAbrir?: (v: LeadFluxo) => void
  onMarcarEnviado?: (v: LeadFluxo) => void
  onArquivar?: (fluxoId: string) => void
}) {
  const ultima = versoes[0]
  const anteriores = versoes.slice(1)
  const [verVersoes, setVerVersoes] = useState(false)
  const [textoDe, setTextoDe] = useState<string | null>(null)
  const [confirmarArquivo, setConfirmarArquivo] = useState(false)
  const enviada = versoes.find(v => v.enviadoEm)
  const trabalhando = ocupado === ultima.id || ocupado === ultima.fluxoId

  return (
    <li className="py-4 border-b border-line last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[15px] font-semibold text-t1 truncate">{ultima.nome}</p>
        <p className="flex-shrink-0 text-[12.5px] text-t4 tabular-nums">{ROTULO_DO_MODO[ultima.modo]} · versão {ultima.versao}</p>
      </div>

      <p className="mt-1 text-[14px] text-t2 tabular-nums leading-snug">{ultima.resumo.linha || 'Sem resumo'}</p>

      <p className="mt-1.5 text-[12.5px] text-t4">
        {ultima.enviadoEm ? (
          <span className="inline-flex items-center gap-1 text-success font-medium">
            <Check size={13} strokeWidth={2.2} aria-hidden />
            Enviada ao cliente {quando(ultima.enviadoEm)} por {primeiroNome(ultima.enviadoPor)}
          </span>
        ) : (
          <>
            Salva {quando(ultima.criadoEm)} por {primeiroNome(ultima.criadoPor)}
            {enviada && <> · a versão {enviada.versao} foi enviada ao cliente</>}
          </>
        )}
      </p>

      <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap">
        {onAbrir && (
          <button type="button" className={BOTAO} onClick={() => onAbrir(ultima)} disabled={trabalhando}>
            <Pencil size={13} strokeWidth={1.9} aria-hidden /> Abrir e editar
          </button>
        )}
        {onMarcarEnviado && !ultima.enviadoEm && (
          <button type="button" className={BOTAO} onClick={() => onMarcarEnviado(ultima)} disabled={trabalhando}>
            {ocupado === ultima.id ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Send size={13} strokeWidth={1.9} aria-hidden />}
            Marcar como enviado
          </button>
        )}
        {ultima.mensagem && (
          <button type="button" className={BOTAO} aria-expanded={textoDe === ultima.id}
                  onClick={() => setTextoDe(t => t === ultima.id ? null : ultima.id)}>
            {textoDe === ultima.id ? 'Ocultar texto' : 'Ver texto'}
          </button>
        )}
        {anteriores.length > 0 && (
          <button type="button" className={BOTAO} aria-expanded={verVersoes} onClick={() => setVerVersoes(v => !v)}>
            <History size={13} strokeWidth={1.9} aria-hidden />
            {anteriores.length === 1 ? '1 versão anterior' : `${anteriores.length} versões anteriores`}
            <ChevronDown size={13} strokeWidth={1.9} aria-hidden className={`transition-transform ${verVersoes ? 'rotate-180' : ''}`} />
          </button>
        )}
        {onArquivar && !confirmarArquivo && (
          <button type="button" className={`${BOTAO} ml-auto !text-t4 hover:!text-error`} onClick={() => setConfirmarArquivo(true)} disabled={trabalhando}>
            <Archive size={13} strokeWidth={1.9} aria-hidden /> Arquivar
          </button>
        )}
      </div>

      {onArquivar && confirmarArquivo && (
        <div className="mt-2 flex items-center gap-2 flex-wrap rounded-[12px] bg-s2 px-3 py-2.5" role="alertdialog" aria-label="Arquivar fluxo">
          <p className="flex-1 min-w-0 text-[13px] text-t1">
            Arquivar “{ultima.nome}”{versoes.length > 1 ? ` e as ${versoes.length} versões` : ''}? Ele sai desta lista.
          </p>
          <button type="button" disabled={trabalhando}
                  onClick={() => { setConfirmarArquivo(false); onArquivar(ultima.fluxoId) }}
                  className="h-8 px-3 rounded-[9px] text-[13px] font-semibold text-error hover:bg-error-bg cursor-pointer disabled:opacity-50">
            Arquivar
          </button>
          <button type="button" onClick={() => setConfirmarArquivo(false)}
                  className="h-8 px-3 rounded-[9px] text-[13px] font-semibold text-t2 hover:bg-s3 cursor-pointer">
            Cancelar
          </button>
        </div>
      )}

      {textoDe === ultima.id && ultima.mensagem && <TextoDaVersao texto={ultima.mensagem} />}

      {verVersoes && (
        <ol className="mt-3 flex flex-col gap-3 pl-3 border-l-2 border-line" aria-label={`Versões anteriores de ${ultima.nome}`}>
          {anteriores.map(v => (
            <li key={v.id}>
              <p className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-semibold text-t1">
                  Versão {v.versao}
                  {v.enviadoEm && <span className="ml-1.5 inline-flex items-center gap-0.5 font-medium text-success"><Check size={12} strokeWidth={2.2} aria-hidden />enviada</span>}
                </span>
                <span className="flex-shrink-0 text-[12.5px] text-t4 tabular-nums">{quando(v.criadoEm)} · {primeiroNome(v.criadoPor)}</span>
              </p>
              <p className="mt-0.5 text-[13.5px] text-t2 tabular-nums leading-snug">{v.resumo.linha || 'Sem resumo'}</p>
              <div className="mt-1 flex items-center gap-x-3 flex-wrap">
                {onAbrir && (
                  <button type="button" className={BOTAO} onClick={() => onAbrir(v)}
                          title={`Abre o simulador com os dados da versão ${v.versao}; salvar cria a versão ${ultima.versao + 1}`}>
                    <Pencil size={13} strokeWidth={1.9} aria-hidden /> Partir desta versão
                  </button>
                )}
                {v.mensagem && (
                  <button type="button" className={BOTAO} aria-expanded={textoDe === v.id}
                          onClick={() => setTextoDe(t => t === v.id ? null : v.id)}>
                    {textoDe === v.id ? 'Ocultar texto' : 'Ver texto'}
                  </button>
                )}
              </div>
              {textoDe === v.id && v.mensagem && <TextoDaVersao texto={v.mensagem} />}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

/** O texto do WhatsApp exatamente como foi gerado naquela versão. */
function TextoDaVersao({ texto }: { texto: string }) {
  return (
    <pre className="mt-2 max-h-[320px] overflow-y-auto rounded-[12px] bg-s2 px-3.5 py-3 text-[13px] text-t2 leading-relaxed
                    whitespace-pre-wrap font-sans">{texto}</pre>
  )
}
