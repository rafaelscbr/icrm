import { useCallback, useEffect, useState } from 'react'
import { Send, Loader2, RefreshCw, FlaskConical, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { db } from '../../lib/db'
import { MetaConversionSummary } from '../../types'

/**
 * Eventos devolvidos ao Meta Ads (API de Conversões para CRM).
 *
 * O banco enfileira um evento por lead e por etapa (lead recebido, qualificado,
 * visita, proposta, venda) e a função `meta-conversions` envia a cada 5 min
 * (migração 086). Aqui o admin vê o que saiu, o que espera e o que falhou.
 * Carrega só ao abrir esta tela e no botão — nada de recarga periódica.
 */

const EVENTOS: { nome: string; rotulo: string }[] = [
  { nome: 'lead_recebido',    rotulo: 'Lead recebido' },
  { nome: 'lead_qualificado', rotulo: 'Lead qualificado' },
  { nome: 'visita',           rotulo: 'Visita' },
  { nome: 'proposta',         rotulo: 'Proposta' },
  { nome: 'venda',            rotulo: 'Venda' },
]
const ROTULO = Object.fromEntries(EVENTOS.map(e => [e.nome, e.rotulo]))

function quando(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function MetaConversoesSettings() {
  const [dados, setDados]       = useState<MetaConversionSummary | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro]         = useState(false)
  const [reenviando, setReenviando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(false)
    try {
      setDados(await db.metaConversions.summary())
    } catch {
      setErro(true)   // toast já disparado pela camada db
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  async function reenviar() {
    setReenviando(true)
    try {
      const n = await db.metaConversions.retry()
      toast.success(n > 0 ? `${n} evento(s) de volta à fila — o envio sai em instantes` : 'Nada para reenviar')
      await carregar()
    } catch { /* erro já toastado */ }
    finally { setReenviando(false) }
  }

  const t = dados?.totals ?? {}
  const pendentes = (t.pendente ?? 0) + (t.enviando ?? 0)
  const comErro   = t.erro ?? 0
  const problemas = dados?.problems ?? []

  return (
    <section className="bg-surface border border-line rounded-[14px] overflow-hidden" aria-labelledby="meta-conv-titulo">
      <div className="flex items-start gap-3 px-4 py-3.5 border-b border-line">
        <div className="w-9 h-9 rounded-[10px] bg-brand-tint border border-brand/25 flex items-center justify-center flex-shrink-0">
          <Send size={15} strokeWidth={1.6} className="text-brand" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="meta-conv-titulo" className="font-heading text-sm font-bold text-t1">Retorno ao Meta Ads</h3>
          <p className="text-xs text-t3 mt-0.5">
            O que acontece com cada lead de formulário volta para o Meta, para a campanha aprender quem vira cliente.
          </p>
        </div>
        <button type="button" onClick={() => void carregar()} disabled={carregando}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-xs font-semibold text-t2 hover:bg-s2 cursor-pointer disabled:opacity-50 flex-shrink-0"
          aria-label="Atualizar os números">
          <RefreshCw size={13} strokeWidth={1.8} className={carregando ? 'animate-spin' : ''} aria-hidden /> Atualizar
        </button>
      </div>

      {carregando && !dados ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={18} className="animate-spin text-brand" strokeWidth={1.6} aria-label="Carregando" />
        </div>
      ) : erro || !dados ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
          <p className="text-sm font-medium text-error">Não foi possível carregar os eventos do Meta.</p>
          <button type="button" onClick={() => void carregar()}
            className="text-xs font-semibold text-t2 underline underline-offset-2 cursor-pointer">
            Tentar de novo
          </button>
        </div>
      ) : (
        <div className="px-4 py-4 flex flex-col gap-4">
          {dados.state?.test_mode && (
            <p className="flex items-start gap-2 text-xs text-t2 bg-s2 border border-line rounded-[10px] px-3 py-2.5" role="status">
              <FlaskConical size={14} strokeWidth={1.6} className="flex-shrink-0 mt-0.5 text-brand-text" aria-hidden />
              <span>
                <strong className="font-semibold text-t1">Modo de teste ligado.</strong> Os eventos aparecem em “Eventos de teste” no Gerenciador de Eventos.
                Para encerrar, remova o segredo META_TEST_EVENT_CODE da função.
              </span>
            </p>
          )}

          {/* Os três números que respondem "está funcionando?" */}
          <dl className="grid grid-cols-3 gap-2">
            {[
              { rotulo: 'Enviados',  valor: t.enviado ?? 0, cor: 'text-t1' },
              { rotulo: 'Pendentes', valor: pendentes,      cor: 'text-t1' },
              { rotulo: 'Com erro',  valor: comErro,        cor: comErro > 0 ? 'text-error' : 'text-t1' },
            ].map(n => (
              <div key={n.rotulo} className="rounded-[12px] border border-line bg-s2/60 px-3 py-2.5">
                <dt className="font-label text-[11px] uppercase tracking-wide text-t4">{n.rotulo}</dt>
                <dd className={`font-heading text-xl font-bold tabular-nums ${n.cor}`}>{n.valor}</dd>
              </div>
            ))}
          </dl>

          <div>
            <p className="font-label text-[11px] uppercase tracking-wide text-t4 mb-2">Enviados nos últimos 30 dias</p>
            <ul className="flex flex-col divide-y divide-line rounded-[12px] border border-line bg-s2/60">
              {EVENTOS.map(e => (
                <li key={e.nome} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-t2">{e.rotulo}</span>
                  <span className="font-semibold text-t1 tabular-nums">{dados.sent_by_event[e.nome] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-t3">
            Último envio: <span className="text-t2 tabular-nums">{quando(dados.last_sent_at)}</span>
            {' · '}Última execução: <span className="text-t2 tabular-nums">{quando(dados.state?.last_run_at)}</span>
            {dados.state?.last_run_note && <> — {dados.state.last_run_note}</>}
            {((t.expirado ?? 0) > 0 || (t.cancelado ?? 0) > 0) && (
              <> · {t.expirado ?? 0} expirado(s) (passaram de 7 dias), {t.cancelado ?? 0} cancelado(s) (lead descartado ou qualificação desfeita)</>
            )}
          </p>

          {problemas.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="font-label text-[11px] uppercase tracking-wide text-t4">
                  Falhas{dados.retrying > 0 ? ` · ${dados.retrying} em nova tentativa automática` : ''}
                </p>
                <button type="button" onClick={reenviar} disabled={reenviando}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-xs font-semibold text-t2 hover:bg-s2 cursor-pointer disabled:opacity-50">
                  {reenviando ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RefreshCw size={13} strokeWidth={1.8} aria-hidden />}
                  Tentar de novo agora
                </button>
              </div>
              <ul className="flex flex-col divide-y divide-line rounded-[12px] border border-line">
                {problemas.map(p => (
                  <li key={p.id} className="flex items-start gap-2.5 px-3 py-2.5">
                    <AlertTriangle size={14} strokeWidth={1.6} aria-hidden
                      className={`flex-shrink-0 mt-0.5 ${p.status === 'erro' ? 'text-error' : 'text-t4'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-t1 truncate">
                        {p.lead_name ?? 'Lead removido'} · <span className="text-t2">{ROTULO[p.event_name] ?? p.event_name}</span>
                      </p>
                      <p className="text-xs text-t3 break-words">
                        {p.status === 'erro' ? 'Recusado pelo Meta' : `Tentativa ${p.attempts}, vai tentar de novo`} — {p.last_error ?? 'sem detalhe'}
                      </p>
                    </div>
                    <span className="text-[11px] text-t4 tabular-nums flex-shrink-0">{quando(p.updated_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
