import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Phone, MessageSquare, Flame, ArrowUpRight, BadgeDollarSign,
  AlertTriangle, Clock, Target,
} from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import { useCallCampaignsStore } from '../../../store/useCallCampaignsStore'
import { formatCurrency } from '../../../lib/formatters'
import { DAILY_TARGETS } from '../../../lib/metasConfig'
import type { CallPerformance } from '../../../types'
import toast from 'react-hot-toast'

/**
 * Desempenho da prospecção por ligação.
 *
 * Honestidade da métrica é o ponto desta tela. "Ligações" conta cliques em
 * "Ligar pelo WhatsApp" — é o único evento que o sistema observa sozinho, já
 * que não existe URL que inicie chamada. Atendimento e interesse são
 * DECLARADOS por quem ligou, e por isso "sem desfecho" aparece em destaque:
 * sem esse número, a taxa de atendimento seria uma média sobre uma amostra
 * silenciosamente encolhida.
 */

type Janela = 7 | 30 | 90

function desdeISO(dias: Janela): string {
  const d = new Date()
  d.setDate(d.getDate() - (dias - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0
}

interface Props {
  /** undefined = todas as campanhas de ligação */
  campaignId?: string
}

export function CallPerformanceTab({ campaignId }: Props) {
  const { loadPerformance } = useCallCampaignsStore()

  const [dados,      setDados]      = useState<CallPerformance | null>(null)
  const [janela,     setJanela]     = useState<Janela>(30)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setDados(await loadPerformance(campaignId, desdeISO(janela)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar o desempenho')
    } finally {
      setCarregando(false)
    }
  }, [campaignId, janela, loadPerformance])

  useEffect(() => { void carregar() }, [carregar])

  if (carregando && !dados) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={22} className="animate-spin text-brand" />
        <p className="text-sm text-t3">Carregando o desempenho…</p>
      </div>
    )
  }

  const corretores = dados?.corretores ?? []
  const totais = corretores.reduce((acc, c) => ({
    ligacoes:     acc.ligacoes     + c.ligacoes,
    falou:        acc.falou        + c.falou,
    interessados: acc.interessados + c.interessados,
    semDesfecho:  acc.semDesfecho  + c.semDesfecho,
    transferidos: acc.transferidos + c.transferidos,
    vendas:       acc.vendas       + c.vendas,
    vgl:          acc.vgl          + c.vgl,
  }), { ligacoes: 0, falou: 0, interessados: 0, semDesfecho: 0, transferidos: 0, vendas: 0, vgl: 0 })

  const porHora   = dados?.porHora ?? []
  const maxHora   = Math.max(1, ...porHora.map(h => h.ligacoes))
  const melhorHora = [...porHora]
    .filter(h => h.ligacoes >= 5)
    .sort((a, b) => pct(b.produtivas, b.ligacoes) - pct(a.produtivas, a.ligacoes))[0]

  return (
    <div className="flex flex-col gap-6">

      {/* Janela */}
      <div className="flex items-center gap-1 bg-s2/50 border border-line rounded-[14px] p-1 w-fit">
        {([7, 30, 90] as Janela[]).map(j => (
          <button
            key={j}
            onClick={() => setJanela(j)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer
              ${janela === j ? 'bg-brand text-[var(--brand-btn-text)]' : 'text-t3 hover:text-t1'}`}
          >
            {j} dias
          </button>
        ))}
      </div>

      {/* Números do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Ligações',        value: totais.ligacoes.toLocaleString('pt-BR'), icon: Phone,          nota: 'cliques em ligar' },
          { label: 'Falou',           value: totais.falou.toLocaleString('pt-BR'),    icon: MessageSquare,  nota: `${pct(totais.falou, totais.ligacoes)}% das ligações` },
          { label: 'Interessados',    value: totais.interessados.toLocaleString('pt-BR'), icon: Flame,      nota: `${pct(totais.interessados, totais.falou)}% de quem falou` },
          { label: 'Foram ao funil',  value: totais.transferidos.toLocaleString('pt-BR'), icon: ArrowUpRight, nota: totais.vendas > 0 ? `${totais.vendas} venda(s)` : 'nenhuma venda ainda' },
        ].map(k => (
          <Card key={k.label} className="!py-4">
            <div className="flex items-center gap-2 mb-1">
              <k.icon size={13} className="text-t4" strokeWidth={1.6} />
              <p className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4">{k.label}</p>
            </div>
            <p className="text-2xl font-bold text-t1 tabular-nums leading-tight">{k.value}</p>
            <p className="text-[11px] text-t4 mt-0.5">{k.nota}</p>
          </Card>
        ))}
      </div>

      {/* VGL originado */}
      {totais.vgl > 0 && (
        <div className="flex items-center gap-2.5 rounded-[14px] border border-success-line bg-success-bg px-4 py-3">
          <BadgeDollarSign size={15} className="text-success flex-shrink-0" strokeWidth={1.6} />
          <p className="text-sm text-success">
            <span className="font-bold tabular-nums">{formatCurrency(totais.vgl)}</span> em vendas
            originadas pela prospecção por ligação neste período.
          </p>
        </div>
      )}

      {/* Ligações sem desfecho */}
      {totais.semDesfecho > 0 && (
        <div className="flex items-start gap-2.5 rounded-[14px] border border-warning-line bg-warning-bg px-4 py-3">
          <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" strokeWidth={1.6} />
          <p className="text-[13px] text-warning">
            <span className="font-bold tabular-nums">{totais.semDesfecho}</span> ligações
            ({pct(totais.semDesfecho, totais.ligacoes)}%) foram feitas sem registro do que aconteceu.
            As taxas acima consideram só as ligações com desfecho — quanto maior este número,
            menos confiável fica a leitura.
          </p>
        </div>
      )}

      {/* Ranking */}
      <div>
        <p className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 mb-3">
          Por corretor
        </p>

        {corretores.length === 0 ? (
          <div className="rounded-[14px] border border-line bg-s2/40 px-4 py-10 text-center">
            <p className="text-sm text-t3">Nenhuma ligação registrada no período.</p>
          </div>
        ) : (
          <div className="rounded-[14px] border border-line overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-s2/60 border-b border-line">
                  {['Corretor', 'Hoje', 'Ligações', 'Falou', 'Interesse', 'Ao funil', 'Vendas'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2.5 font-label text-[11px] font-bold uppercase tracking-[0.14em]
                                  text-t4 ${i === 0 ? 'text-left' : 'text-right'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corretores.map(c => {
                  const bateuHoje = c.hoje >= DAILY_TARGETS.ligacoes
                  return (
                    <tr key={c.brokerId} className="border-b border-line last:border-0">
                      <td className="px-3 py-2.5 text-t1 font-medium">{c.nome ?? 'Corretor'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={bateuHoje ? 'text-success font-bold' : 'text-t2'}>
                          {c.hoje}
                        </span>
                        <span className="text-t5">/{DAILY_TARGETS.ligacoes}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-t2 tabular-nums">{c.ligacoes.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2.5 text-right text-t3 tabular-nums">
                        {c.falou} <span className="text-t5">· {pct(c.falou, c.ligacoes)}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="text-brand-text font-semibold">{c.interessados}</span>
                        <span className="text-t5"> · {pct(c.interessados, c.falou)}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-t2 tabular-nums">{c.transferidos}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {c.vendas > 0
                          ? <span className="text-success font-semibold">{c.vendas}</span>
                          : <span className="text-t5">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Melhor horário — a métrica mais acionável desta tela */}
      {porHora.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4">
              Ligações por hora do dia
            </p>
            {melhorHora && (
              <span className="flex items-center gap-1.5 text-[11px] text-brand-text">
                <Target size={11} strokeWidth={1.6} />
                melhor retorno às {String(melhorHora.hora).padStart(2, '0')}h
                ({pct(melhorHora.produtivas, melhorHora.ligacoes)}% produtivas)
              </span>
            )}
          </div>

          <div className="rounded-[14px] border border-line bg-s2/40 px-4 py-4">
            {/* A coluna precisa de altura própria (h-full dentro da faixa de
                h-28): altura percentual não resolve contra pai automático, e a
                barra sumia. */}
            <div className="flex items-end gap-1 h-28">
              {Array.from({ length: 24 }, (_, h) => {
                const dado = porHora.find(p => p.hora === h)
                const qtd  = dado?.ligacoes ?? 0
                const alt  = qtd > 0 ? Math.max(6, (qtd / maxHora) * 100) : 2
                const dentroDaJanela = h >= 9 && h < 18
                return (
                  <div key={h} className="flex-1 min-w-0 h-full flex items-end">
                    <div
                      className={`w-full rounded-t transition-all ${dentroDaJanela ? 'bg-brand' : 'bg-t5'}`}
                      style={{ height: `${alt}%`, opacity: qtd > 0 ? 1 : 0.2 }}
                      title={`${String(h).padStart(2, '0')}h — ${qtd} ligações`}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-1 mt-1.5">
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="flex-1 min-w-0 text-center text-[11px] text-t5 tabular-nums">
                  {h % 3 === 0 ? h : ''}
                </span>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-t4 mt-3">
              <Clock size={11} strokeWidth={1.6} />
              Em cinza, ligações fora da janela útil (Seg–Sex 9h–18h, Sáb 9h–13h).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
