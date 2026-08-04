import { useEffect, useState, useMemo } from 'react'
import {
  TrendingUp, Pencil, Trash2, Search, BadgePercent, DollarSign, Wallet, Plus,
  LineChart as LineChartIcon,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { IconeTom, Rotulo, SecaoTitulo } from '../../components/shared/visual'
import { ListContainer } from '../../components/ui/ListContainer'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { CabecalhoLista, AcoesLinha, ContextoLinha, celula } from '../../components/shared/lista'
import type { Coluna } from '../../components/shared/lista'
import { Modal } from '../../components/ui/Modal'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { SaleForm } from './SaleForm'
import { useSalesStore } from '../../store/useSalesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePeriodStore, matchesPeriod } from '../../store/usePeriodStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Sale, SaleType, calcSaleCommissions } from '../../types'
import { formatCurrency, formatCurrencyFull, formatDateShort } from '../../lib/formatters'
import toast from 'react-hot-toast'

const TYPE_CONFIG: Record<SaleType, { label: string; variant: 'indigo' | 'purple' }> = {
  ready:    { label: 'Pronto', variant: 'indigo'  },
  off_plan: { label: 'Planta', variant: 'purple'  },
}

/**
 * "Retroativa" = lançada em um mês POSTERIOR ao da venda, ou seja, registrada
 * com atraso.
 *
 * A regra anterior comparava a data da venda com HOJE, o que marcava como
 * retroativa praticamente toda venda passada — no filtro "Acumulado" o aviso
 * aparecia em todas as 22 linhas e não dizia nada. O que interessa é a
 * distância entre quando a venda aconteceu (`date`) e quando ela entrou no
 * sistema (`createdAt`).
 */
function lancadaRetroativamente(s: Sale): boolean {
  const [vAno, vMes] = s.date.split('-').map(Number)
  const criada = new Date(s.createdAt)
  const cAno = criada.getFullYear()
  const cMes = criada.getMonth() + 1
  return cAno > vAno || (cAno === vAno && cMes > vMes)
}

const FILTER_OPTIONS: { value: SaleType | null; label: string }[] = [
  { value: null,       label: 'Todas'  },
  { value: 'ready',    label: 'Pronto' },
  { value: 'off_plan', label: 'Planta' },
]

export function SalesPage() {
  const { sales: allSales, load, remove, loading, erro } = useSalesStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const sales = isAdmin && viewAsBrokerId ? allSales.filter(s => s.brokerId === viewAsBrokerId) : allSales
  const { contacts, loadByIds: loadContactsByIds } = useContactsStore()
  const { startDate, endDate, getLabel } = usePeriodStore()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<SaleType | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Sale | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Sale | undefined>()

  useEffect(() => {
    load()
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') === '1') {
      setFormOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [load])

  // Só os contatos citados nesta tela — antes era o fetchAll de 12.543 linhas
  // (~7,7 MB) para exibir algumas dezenas de nomes.
  useEffect(() => {
    const ids = sales.map(s => s.clientId).filter(Boolean)
    if (ids.length > 0) loadContactsByIds(ids)
  }, [sales]) // eslint-disable-line react-hooks/exhaustive-deps

  // Uma definição só de largura, lida pelo cabeçalho, pelas linhas e pelo
  // rodapé — ver components/shared/lista.tsx.
  const COLUNAS: Coluna[] = [
    { chave: 'cliente',  rotulo: 'Cliente',       largura: 'flex-1' },
    { chave: 'produto',  rotulo: 'Empreendimento', largura: 'w-[190px]' },
    { chave: 'data',     rotulo: 'Data',          largura: 'w-[118px]' },
    { chave: 'valor',    rotulo: 'Valor',         largura: 'w-[130px]', alinhar: 'dir' },
    { chave: 'comissao', rotulo: 'Comissão',      largura: 'w-[150px]', alinhar: 'dir' },
    ...(isAdmin ? [{ chave: 'corretor', rotulo: 'Corretor', largura: 'w-[110px]' } as Coluna] : []),
  ]

  const filtered = sales.filter(s => {
    const client = contacts.find(c => c.id === s.clientId)
    const matchQuery = !query.trim() ||
      (client?.name ?? '').toLowerCase().includes(query.toLowerCase()) ||
      s.propertyName.toLowerCase().includes(query.toLowerCase())
    const matchType   = !typeFilter || s.type === typeFilter
    const matchPeriod = matchesPeriod(s.date, startDate, endDate)
    return matchQuery && matchType && matchPeriod
  })

  // Todos os KPIs respeitam o período selecionado
  const periodLabel   = getLabel()
  const salesInPeriod = sales.filter(s => matchesPeriod(s.date, startDate, endDate))
  const valueInPeriod = salesInPeriod.reduce((acc, s) => acc + s.value, 0)
  const avgTicket     = salesInPeriod.length > 0 ? valueInPeriod / salesInPeriod.length : 0
  const periodComm    = salesInPeriod.reduce((acc, s) => acc + calcSaleCommissions(s).totalCommission, 0)
  const periodBroker  = salesInPeriod.reduce((acc, s) => acc + calcSaleCommissions(s).brokerCommission, 0)

  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - (11 - i))
      const year = d.getFullYear()
      const month = d.getMonth()
      const monthSales = sales.filter(s => {
        const sd = new Date(s.date + 'T00:00:00')
        return sd.getFullYear() === year && sd.getMonth() === month
      })
      return {
        month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        value: monthSales.reduce((a, s) => a + s.value, 0),
        count: monthSales.length,
      }
    })
  }, [sales])

  const formatAxisValue = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
    return `${v}`
  }

  function handleDelete() {
    if (!deleteTarget) return
    remove(deleteTarget.id)
    toast.success('Venda excluída')
    setDeleteTarget(undefined)
  }

  return (
    <PageLayout
      icon={TrendingUp}
      iconTom="sucesso"
      title="Vendas"
      subtitle={erro
        ? 'não foi possível ler as vendas'
        : `${salesInPeriod.length} venda${salesInPeriod.length !== 1 ? 's' : ''} · ${periodLabel}`}
      ctaLabel="Nova Venda"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >
      {/* Seletor de período */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-t3">Todos os dados filtrados pelo período</p>
        <PeriodSelector />
      </div>

      {/* ── KPIs — com hierarquia ──────────────────────────────────────────
          Eram quatro cards idênticos: mesmo tamanho, mesmo peso, nenhum
          protagonista. VGV é o número que define o mês, então ele fica grande
          e sozinho; ticket, comissão gerada e comissão do corretor são apoio
          e ocupam o porte compacto. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5 lg:mb-6">
        <div className="lg:col-span-1 relative overflow-hidden rounded-[16px] border border-line
                        surface-premium shadow-card gold-edge gold-glow-tl p-5">
          <div className="flex items-center gap-2">
            <IconeTom icon={Wallet} tom="marca" tamanho="sm" />
            <Rotulo>VGV no período</Rotulo>
          </div>
          <p className="font-heading text-[clamp(1.9rem,3.5vw,2.5rem)] font-black text-t1 tabular-nums leading-none tracking-[-0.03em] mt-3">
            {formatCurrency(valueInPeriod)}
          </p>
          <p className="text-xs text-t3 mt-2">
            {salesInPeriod.length} venda{salesInPeriod.length !== 1 ? 's' : ''} · ticket médio {formatCurrency(avgTicket)}
          </p>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          {[
            { label: 'Comissão gerada', value: periodComm,   hint: 'negociada no período', icon: BadgePercent, tone: 'text-t1',      tom: 'info'    as const },
            { label: 'Sua comissão',    value: periodBroker, hint: 'sua parte no período', icon: DollarSign,   tone: 'text-success', tom: 'sucesso' as const },
          ].map(k => (
            <div key={k.label} className="rounded-[14px] border border-line surface-premium shadow-card p-4 flex flex-col">
              <div className="flex items-center gap-2">
                <IconeTom icon={k.icon} tom={k.tom} tamanho="sm" />
                <Rotulo className="truncate">{k.label}</Rotulo>
              </div>
              <p className={`font-heading text-[22px] font-black tabular-nums leading-none mt-3 ${k.tone}`}>
                {formatCurrency(k.value)}
              </p>
              <p className="text-[11px] text-t4 mt-2">{k.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Gráfico mensal */}
      {sales.length > 0 && (
        <Card className="mb-5 lg:mb-6">
          <div className="mb-4">
            <SecaoTitulo icon={LineChartIcon} tom="sucesso" descricao="VGV fechado por mês">
              Evolução mensal
            </SecaoTitulo>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--t4)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: 'var(--t4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatAxisValue}
                width={42}
              />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow-dropdown)' }}
                labelStyle={{ color: 'var(--t3)', fontSize: 11 }}
                formatter={(value: number, _name: string, props: { payload?: { count?: number } }) => [
                  `${formatCurrency(value)}  ·  ${props.payload?.count ?? 0} venda${(props.payload?.count ?? 0) !== 1 ? 's' : ''}`,
                  'VGV',
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--brand)"
                strokeWidth={2}
                dot={{ fill: 'var(--brand)', r: 3 }}
                activeDot={{ r: 5 }}
                name="VGV"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por cliente ou imóvel..."
            className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 transition-all min-h-[44px]"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 sm:pb-0">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => setTypeFilter(opt.value)}
              className={`
                flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer min-h-[44px]
                ${typeFilter === opt.value
                  ? 'bg-brand-tint border-brand/40 text-brand-text'
                  : 'bg-s3/50 border-line text-t3 hover:text-t2'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Carregando, falhou e vazio pela mesma tríade — ver EstadoTela. */}
      <EstadoTela
        carregando={loading && sales.length === 0}
        erro={erro}
        vazio={filtered.length === 0}
        onTentarDeNovo={() => { void load() }}
        icone={TrendingUp}
        titulo="Nenhuma venda no período"
        descricao="Troque o período no seletor acima ou registre uma venda."
        acao={
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }} className="gap-2">
            <Plus size={14} /> Nova venda
          </Button>
        }
      >
        <>
          {/* ── Mobile cards ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 lg:hidden">
            {filtered.map(s => {
              const client = contacts.find(c => c.id === s.clientId)
              const { label, variant } = TYPE_CONFIG[s.type]
              const { totalCommission: tc, brokerCommission: bc } = calcSaleCommissions(s)
              const hasComm = tc > 0
              const isRetro = lancadaRetroativamente(s)
              return (
                <Card key={s.id} className="!p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={client?.name ?? '?'} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{client?.name ?? '—'}</p>
                        {isRetro && (
                          <span className="text-[11px] font-semibold text-amber-500/80 uppercase tracking-wide">retroativo</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditing(s); setFormOpen(true) }}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-s3/70 text-t3 hover:text-t2 transition-colors cursor-pointer"
                      ><Pencil size={15} /></button>
                      <button
                        onClick={() => setDeleteTarget(s)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-red-500/10 text-t3 hover:text-red-400 transition-colors cursor-pointer"
                      ><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-t3 truncate flex-1 mr-2">{s.propertyName}</p>
                      <Badge variant={variant}>{label}</Badge>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-line">
                      <span className="text-xs text-t3">{formatDateShort(s.date)}</span>
                      <span className="text-sm font-bold text-green-400 tabular-nums">{formatCurrencyFull(s.value)}</span>
                    </div>
                    {hasComm && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-t4">Comissão</span>
                        <div className="text-right">
                          <p className="text-xs text-brand-text tabular-nums font-medium">{formatCurrencyFull(tc)}</p>
                          <p className="text-xs text-emerald-400 tabular-nums">Corretor: {formatCurrencyFull(bc)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
            {/* Mobile footer */}
            <div className="flex items-center justify-between px-4 py-3 bg-s2/50 rounded-xl border border-line">
              <p className="text-xs text-t3">{filtered.length} venda{filtered.length !== 1 ? 's' : ''}</p>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-100 tabular-nums">
                  {formatCurrencyFull(filtered.reduce((acc, s) => acc + s.value, 0))}
                </p>
                <p className="text-xs text-brand-text tabular-nums">
                  {formatCurrencyFull(filtered.reduce((acc, s) => acc + calcSaleCommissions(s).totalCommission, 0))}
                </p>
              </div>
            </div>
          </div>

          {/* ── Desktop table ──────────────────────────────────────────── */}
          <ListContainer className="hidden lg:block">
            <CabecalhoLista colunas={COLUNAS} antes="w-8" depois="w-[76px]" />
            {filtered.map((s, i) => {
              const client     = contacts.find(c => c.id === s.clientId)
              const brokerName = isAdmin ? (allProfiles.find(p => p.id === s.brokerId)?.name ?? '—') : null
              const { label } = TYPE_CONFIG[s.type]
              const { totalCommission: tc, brokerCommission: bc } = calcSaleCommissions(s)
              const hasComm = tc > 0
              const isRetro = lancadaRetroativamente(s)
              return (
                <div
                  key={s.id}
                  className={`group flex items-center gap-4 px-6 py-3.5 hover:bg-s3/50 row-accent transition-colors ${i < filtered.length - 1 ? 'border-b border-line' : ''}`}
                >
                  <Avatar name={client?.name ?? '?'} size="sm" />

                  <div className={celula(COLUNAS[0])}>
                    <p className="text-sm font-medium text-t1 truncate">{client?.name ?? '—'}</p>
                    {/* "retroativo" é contexto, não estado comparável: texto,
                        não pílula. */}
                    <ContextoLinha itens={[isRetro && <span key="r">lançada em outro mês</span>]} />
                  </div>

                  <div className={celula(COLUNAS[1])}>
                    <p className="text-sm text-t2 truncate">{s.propertyName}</p>
                    <p className="text-xs text-t4">{label}</p>
                  </div>

                  <p className={celula(COLUNAS[2], 'text-sm text-t3 tabular-nums')}>{formatDateShort(s.date)}</p>

                  <div className={celula(COLUNAS[3])}>
                    <p className="font-heading text-[13px] font-bold text-success tabular-nums">
                      {formatCurrencyFull(s.value)}
                    </p>
                  </div>

                  <div className={celula(COLUNAS[4])}>
                    {hasComm ? (
                      <>
                        <p className="text-[13px] font-semibold text-t2 tabular-nums">{formatCurrencyFull(tc)}</p>
                        <p className="text-[11px] text-t4 tabular-nums">sua parte {formatCurrencyFull(bc)}</p>
                      </>
                    ) : (
                      <span className="text-xs text-t5">—</span>
                    )}
                  </div>

                  {isAdmin && (
                    <span className={celula(COLUNAS[5], 'text-xs text-t3 truncate')}>{brokerName}</span>
                  )}

                  <AcoesLinha largura="w-[76px]">
                    <button
                      onClick={() => { setEditing(s); setFormOpen(true) }}
                      aria-label={`Editar venda de ${client?.name ?? 'cliente'}`}
                      className="w-9 h-9 flex items-center justify-center rounded-[10px] hover:bg-s3/70 text-t3 hover:text-t1
                                 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                    ><Pencil size={14} /></button>
                    <button
                      onClick={() => setDeleteTarget(s)}
                      aria-label={`Excluir venda de ${client?.name ?? 'cliente'}`}
                      className="w-9 h-9 flex items-center justify-center rounded-[10px] hover:bg-error-bg text-t3 hover:text-error
                                 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
                    ><Trash2 size={14} /></button>
                  </AcoesLinha>
                </div>
              )
            })}
            {/* O rodapé declarava 6 colunas enquanto as linhas usavam 7 na
                visão admin: os totais caíam embaixo das colunas erradas. Agora
                lê as mesmas COLUNAS que a linha. */}
            <div className="flex items-center gap-4 px-6 py-3 border-t border-line bg-s2/30">
              <span className="w-8 flex-shrink-0" aria-hidden />
              <p className={celula(COLUNAS[0], 'text-xs text-t3')}>
                {filtered.length} venda{filtered.length !== 1 ? 's' : ''} no período
              </p>
              <span className={celula(COLUNAS[1])} aria-hidden />
              <span className={celula(COLUNAS[2])} aria-hidden />
              <div className={celula(COLUNAS[3])}>
                <p className="font-heading text-[13px] font-black text-t1 tabular-nums">
                  {formatCurrencyFull(filtered.reduce((acc, s) => acc + s.value, 0))}
                </p>
              </div>
              <div className={celula(COLUNAS[4])}>
                <p className="text-[13px] font-bold text-t2 tabular-nums">
                  {formatCurrencyFull(filtered.reduce((acc, s) => acc + calcSaleCommissions(s).totalCommission, 0))}
                </p>
                <p className="text-[11px] text-t4 tabular-nums">
                  sua parte {formatCurrencyFull(filtered.reduce((acc, s) => acc + calcSaleCommissions(s).brokerCommission, 0))}
                </p>
              </div>
              {isAdmin && <span className={celula(COLUNAS[5])} aria-hidden />}
              <span className="w-[76px] flex-shrink-0" aria-hidden />
            </div>
          </ListContainer>
        </>
      </EstadoTela>

      <SaleForm
        key={editing?.id ?? 'new'}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        sale={editing}
      />

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Excluir venda" size="sm">
        <p className="text-sm text-t3 mb-6">
          Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(undefined)}>Cancelar</Button>
          <Button variant="danger"    className="flex-1" onClick={handleDelete}>Excluir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
