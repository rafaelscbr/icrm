import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Phone, MessageSquare, Flame, ArrowUpRight, BadgeDollarSign,
  AlertTriangle, Clock, Target, Trophy, Medal,
} from 'lucide-react'
import { Painel, PainelTitulo, Rotulo, IconeTom, Barra, Dica, Chip, TOM } from './Primitivas'
import { useCallCampaignsStore } from '../../../store/useCallCampaignsStore'
import { formatCurrency } from '../../../lib/formatters'
import { DAILY_TARGETS } from '../../../lib/metasConfig'
import type { CallPerformance } from '../../../types'
import toast from 'react-hot-toast'

/**
 * Desempenho da prospecção por ligação.
 *
 * Honestidade da métrica é o ponto desta tela. "Ligações" conta cliques em
 * "Ligar pelo WhatsApp" — o único evento que o sistema observa sozinho, já que
 * não existe URL que inicie chamada. Atendimento e interesse são DECLARADOS por
 * quem ligou, e por isso "sem desfecho" aparece em destaque: sem esse número, a
 * taxa de atendimento seria uma média sobre uma amostra encolhida em silêncio.
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
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 size={24} className="animate-spin text-brand" aria-hidden />
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

  const porHora    = dados?.porHora ?? []
  const maxHora    = Math.max(1, ...porHora.map(h => h.ligacoes))
  const melhorHora = [...porHora]
    .filter(h => h.ligacoes >= 5)
    .sort((a, b) => pct(b.produtivas, b.ligacoes) - pct(a.produtivas, a.ligacoes))[0]
  const maxLigacoes = Math.max(1, ...corretores.map(c => c.ligacoes))

  const kpis = [
    { label: 'Ligações',       valor: totais.ligacoes,     icon: Phone,         tom: 'neutro'  as const, nota: 'cliques em ligar' },
    { label: 'Falou',          valor: totais.falou,        icon: MessageSquare, tom: 'info'    as const, nota: `${pct(totais.falou, totais.ligacoes)}% das ligações` },
    { label: 'Interessados',   valor: totais.interessados, icon: Flame,         tom: 'marca'   as const, nota: `${pct(totais.interessados, totais.falou)}% de quem falou` },
    { label: 'Foram ao funil', valor: totais.transferidos, icon: ArrowUpRight,  tom: 'sucesso' as const, nota: totais.vendas > 0 ? `${totais.vendas} venda(s)` : 'nenhuma venda ainda' },
  ]

  return (
    <div className="flex flex-col gap-5">

      {/* Janela */}
      <div
        className="flex items-center gap-1 bg-s2/50 border border-line rounded-[14px] p-1 w-fit"
        role="group"
        aria-label="Período de análise"
      >
        {([7, 30, 90] as Janela[]).map(j => (
          <button
            key={j}
            onClick={() => setJanela(j)}
            aria-pressed={janela === j}
            className={`px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-all cursor-pointer
                        min-h-[40px] focus:outline-none focus:ring-2 focus:ring-brand/30
              ${janela === j ? 'grad-brand' : 'text-t3 hover:text-t1'}`}
          >
            {j} dias
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Painel key={k.label} className="px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <IconeTom icon={k.icon} tom={k.tom} tamanho="sm" />
              <Rotulo>{k.label}</Rotulo>
            </div>
            <p className={`font-heading font-extrabold tabular-nums leading-none text-[30px]
                           tracking-tight ${k.tom === 'neutro' ? 'text-t1' : TOM[k.tom].texto}`}>
              {k.valor.toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-t4 mt-1">{k.nota}</p>
          </Painel>
        ))}
      </div>

      {/* VGL originado — único bloco dourado */}
      {totais.vgl > 0 && (
        <Painel dourado className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <IconeTom icon={BadgeDollarSign} tom="marca" />
            <div className="min-w-0">
              <Rotulo>VGL originado pela ligação</Rotulo>
              <p className="font-heading font-extrabold tabular-nums text-[28px] text-brand leading-none mt-1">
                {formatCurrency(totais.vgl)}
              </p>
            </div>
            <span className="ml-auto text-[13px] text-t3 text-right">
              {totais.vendas} {totais.vendas === 1 ? 'venda fechada' : 'vendas fechadas'}
            </span>
          </div>
        </Painel>
      )}

      {/* Ligações sem desfecho */}
      {totais.semDesfecho > 0 && (
        <Dica tom="atencao">
          <span className="font-bold tabular-nums">{totais.semDesfecho}</span>{' '}
          {totais.semDesfecho === 1 ? 'ligação foi feita' : 'ligações foram feitas'}
          {' '}({pct(totais.semDesfecho, totais.ligacoes)}%) sem registro do que aconteceu.
          As taxas acima só contam ligações com desfecho — quanto maior este número, menos
          confiável fica a leitura.
        </Dica>
      )}

      {/* Ranking */}
      <Painel>
        <PainelTitulo icon={Trophy}
          extra={<Rotulo>{corretores.length} {corretores.length === 1 ? 'corretor' : 'corretores'}</Rotulo>}>
          Por corretor
        </PainelTitulo>

        {corretores.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-t3">
            Nenhuma ligação registrada no período.
          </p>
        ) : (
          <ul className="px-3 pb-3 flex flex-col gap-2">
            {corretores.map((c, i) => {
              const bateuHoje = c.hoje >= DAILY_TARGETS.ligacoes
              return (
                <li key={c.brokerId} className="rounded-[12px] border border-line bg-s2/40 px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    {i === 0 && corretores.length > 1
                      ? <Medal size={15} strokeWidth={1.7} className="text-brand shrink-0" aria-label="líder" />
                      : <span className="w-[15px] shrink-0" aria-hidden />}

                    <span className="font-heading text-[14px] font-bold text-t1 truncate flex-1">
                      {c.nome ?? 'Corretor'}
                    </span>

                    <Chip icon={Target} tom={bateuHoje ? 'sucesso' : 'neutro'}>
                      {c.hoje}/{DAILY_TARGETS.ligacoes} hoje
                    </Chip>
                  </div>

                  <div className="mt-2.5">
                    <Barra pct={(c.ligacoes / maxLigacoes) * 100} tom="info" altura={5} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
                    <Metrica rotulo="ligações"  valor={c.ligacoes.toLocaleString('pt-BR')} />
                    <Metrica rotulo="falou"     valor={`${c.falou} · ${pct(c.falou, c.ligacoes)}%`} />
                    <Metrica rotulo="interesse" valor={`${c.interessados} · ${pct(c.interessados, c.falou)}%`} tom="marca" />
                    <Metrica rotulo="ao funil"  valor={String(c.transferidos)} />
                    <Metrica rotulo="vendas"    valor={c.vendas > 0 ? String(c.vendas) : '—'}
                             tom={c.vendas > 0 ? 'sucesso' : 'neutro'} />
                    {c.semDesfecho > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-warning">
                        <AlertTriangle size={10} strokeWidth={1.8} aria-hidden />
                        {c.semDesfecho} sem desfecho
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Painel>

      {/* Melhor horário — a métrica mais acionável da tela */}
      {porHora.length > 0 && (
        <Painel>
          <PainelTitulo icon={Clock} tom="info"
            extra={melhorHora
              ? <Chip icon={Target} tom="marca">
                  melhor às {String(melhorHora.hora).padStart(2, '0')}h · {pct(melhorHora.produtivas, melhorHora.ligacoes)}% produtivas
                </Chip>
              : undefined}>
            Ligações por hora do dia
          </PainelTitulo>

          <div className="px-4 pb-4">
            {/* A coluna precisa de altura própria (h-full dentro da faixa): altura
                percentual não resolve contra pai automático. */}
            <div className="flex items-end gap-1 h-32">
              {Array.from({ length: 24 }, (_, h) => {
                const dado = porHora.find(p => p.hora === h)
                const qtd  = dado?.ligacoes ?? 0
                const alt  = qtd > 0 ? Math.max(8, (qtd / maxHora) * 100) : 3
                const util = h >= 9 && h < 18
                return (
                  <div key={h} className="flex-1 min-w-0 h-full flex items-end">
                    <div
                      className="w-full rounded-t-[4px] transition-all duration-500"
                      style={{
                        height: `${alt}%`,
                        // Fora da janela útil a barra fica apagada de propósito:
                        // ligar às 22h conta, mas não é o que a tela recomenda.
                        opacity: qtd === 0 ? 0.18 : util ? 1 : 0.5,
                        background: util
                          ? 'linear-gradient(180deg, var(--brand), var(--brand-dark) 80%)'
                          : 'var(--t5)',
                        boxShadow: util && qtd > 0 ? '0 0 12px var(--brand-shadow)' : undefined,
                      }}
                      title={`${String(h).padStart(2, '0')}h — ${qtd} ligações`}
                    />
                  </div>
                )
              })}
            </div>

            <div className="flex gap-1 mt-2">
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="flex-1 min-w-0 text-center text-[11px] text-t5 tabular-nums">
                  {h % 3 === 0 ? h : ''}
                </span>
              ))}
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-t4 mt-3">
              <Clock size={11} strokeWidth={1.6} aria-hidden />
              Em cinza, ligações fora da janela útil (Seg–Sex 9h–18h, Sáb 9h–13h).
            </p>
          </div>
        </Painel>
      )}
    </div>
  )
}

function Metrica({ rotulo, valor, tom = 'neutro' }: {
  rotulo: string
  valor: string
  tom?: 'neutro' | 'marca' | 'sucesso'
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-heading text-[14px] font-bold tabular-nums
                        ${tom === 'neutro' ? 'text-t2' : TOM[tom].texto}`}>
        {valor}
      </span>
      <span className="font-label text-[11px] uppercase tracking-[0.1em] text-t4">{rotulo}</span>
    </span>
  )
}
