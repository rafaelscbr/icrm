import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  TrendingUp, Pencil, Trash2, Search, Plus, ChevronRight,
} from 'lucide-react'
import { Grafico, eixoCategoria, eixoValor } from '../../components/charts/Grafico'
import type { CoresGrafico } from '../../components/charts/Grafico'
import { PageLayout } from '../../components/layout/PageLayout'
import { FaixaNumeros, Segmentado } from '../../components/shared/visual'
import { ListContainer } from '../../components/ui/ListContainer'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { CabecalhoLista, AcoesLinha, ContextoLinha, celula } from '../../components/shared/lista'
import type { Coluna } from '../../components/shared/lista'
import { Modal } from '../../components/ui/Modal'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { SaleForm } from './SaleForm'
import { SaleFicha } from './SaleFicha'
import { useSalesStore } from '../../store/useSalesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePeriodStore, matchesPeriod } from '../../store/usePeriodStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Sale, SaleType, calcSaleCommissions } from '../../types'
import { formatCurrency, formatCurrencyFull, formatDateShort } from '../../lib/formatters'
import { useLeadsStore } from '../../store/useLeadsStore'
import { avisarComDesfazer } from '../../lib/desfazer'

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
  const { sales: allSales, load, remove, restaurar, loading, erro } = useSalesStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const sales = isAdmin && viewAsBrokerId ? allSales.filter(s => s.brokerId === viewAsBrokerId) : allSales
  const { contacts, loadByIds: loadContactsByIds } = useContactsStore()
  const { startDate, endDate, getLabel } = usePeriodStore()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<SaleType | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Sale | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Sale | undefined>()
  const [vendoId, setVendoId] = useState<string | null>(null)

  // `?nova=1` abre o formulário — é o atalho do "Criar" da barra do topo.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('nova') !== '1') return
    setEditing(undefined)
    setFormOpen(true)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

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

  const formatAxisValue = useCallback((v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
    return `${v}`
  }, [])

  // Mês é período fechado: barra, com o valor escrito em cima. A curva
  // suavizada de antes desenhava mergulhos entre meses que não existiam.
  const opcaoMensal = useCallback((t: CoresGrafico) => ({
    grid: { left: 4, right: 8, top: 28, bottom: 4, containLabel: true },
    xAxis: eixoCategoria(t, monthlyData.map(m => m.month)),
    yAxis: eixoValor(t, formatAxisValue),
    tooltip: {
      formatter: (ps: Array<{ dataIndex: number }>) => {
        const m = monthlyData[ps[0].dataIndex]
        return `<b>${m.month}</b><br/>${formatCurrency(m.value)} · ${m.count} venda${m.count !== 1 ? 's' : ''}`
      },
    },
    series: [{
      type: 'bar',
      data: monthlyData.map(m => m.value),
      barMaxWidth: 34,
      itemStyle: { color: t.marca, borderRadius: [6, 6, 0, 0] },
      emphasis: { itemStyle: { color: t.marca, opacity: 0.85 } },
      label: {
        show: true, position: 'top', color: t.texto, fontSize: 11, fontWeight: 600,
        formatter: (p: { value: number }) => (p.value > 0 ? formatAxisValue(p.value) : ''),
      },
    }],
  }), [monthlyData, formatAxisValue])


  async function handleDelete() {
    if (!deleteTarget) return
    const venda = deleteTarget
    // O banco solta o vínculo do lead ganho (leads.sale_id ON DELETE SET NULL).
    // Guardado aqui para o Desfazer religar a venda ao lead.
    const leadsLigados = useLeadsStore.getState().leads.filter(l => l.saleId === venda.id).map(l => l.id)
    try {
      await remove(venda.id)
      setDeleteTarget(undefined)
      avisarComDesfazer('Venda excluída', async () => {
        await restaurar(venda)
        for (const id of leadsLigados) await useLeadsStore.getState().update(id, { saleId: venda.id })
      })
    } catch { /* erro já avisado pela camada db — a venda continua na lista */ }
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
      // v7: o período recorta a tela inteira, então mora no topo, junto da
      // ação principal — antes ocupava uma linha sozinho acima dos números.
      actions={<PeriodSelector />}
    >

      {/* v10: uma faixa de números no lugar de três cartões com ícone */}
      <FaixaNumeros
        className="mb-5"
        itens={[
          { rotulo: 'VGV no período', valor: formatCurrency(valueInPeriod), destaque: true,
            nota: `${salesInPeriod.length} venda${salesInPeriod.length !== 1 ? 's' : ''} · ticket médio ${formatCurrency(avgTicket)}` },
          { rotulo: 'Comissão gerada', valor: formatCurrency(periodComm), nota: 'negociada no período' },
          { rotulo: 'Sua comissão', valor: formatCurrency(periodBroker), nota: 'sua parte no período', tom: periodBroker > 0 ? 'text-success' : 'text-t1' },
        ]}
      />

      {/* Gráfico mensal — doze meses sem venda viravam um card de 200 px de
          eixos vazios. O gráfico só aparece quando tem o que desenhar. */}
      {sales.length > 0 && (
        <div className="bento px-5 pt-4 pb-3 mb-5">
          <p className="text-[13px] font-semibold text-t2 mb-1">VGV fechado por mês</p>
          {monthlyData.every(m => m.value === 0) ? (
            <p className="text-[13px] text-t3 py-3">Nenhuma venda fechada nos últimos 12 meses.</p>
          ) : (
          <Grafico
            altura={180}
            rotulo={'VGV fechado por mês. ' + monthlyData.filter(m => m.value > 0).map(m => `${m.month}: ${formatCurrency(m.value)}`).join('; ')}
            opcao={opcaoMensal}
          />
          )}
        </div>
      )}

      {/* Busca e tipo numa linha */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t4" aria-hidden />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar cliente ou imóvel"
            aria-label="Buscar venda por cliente ou imóvel"
            className="campo w-full h-9 pl-9 pr-3 text-[13.5px]"
          />
        </div>
        <Segmentado
          rotulo="Tipo de venda"
          valor={typeFilter}
          onChange={setTypeFilter}
          opcoes={FILTER_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
        />
      </div>

      {/* Carregando, falhou e vazio pela mesma tríade — ver EstadoTela. */}
      <EstadoTela
        carregando={loading && sales.length === 0}
        erro={erro}
        vazio={filtered.length === 0}
        onTentarDeNovo={() => { void load() }}
        icone={TrendingUp}
        titulo="Nenhuma *venda* no período"
        descricao="Troque o período no seletor acima ou registre uma venda."
        acao={
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }} className="gap-2">
            <Plus size={14} /> Nova venda
          </Button>
        }
      >
        <>
          {/* ── Celular: linhas — toque abre a ficha da venda ───────────── */}
          <ListContainer className="lg:hidden">
            {filtered.map(s => {
              const client = contacts.find(c => c.id === s.clientId)
              const { brokerCommission: bc } = calcSaleCommissions(s)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setVendoId(s.id)}
                  className="lista-linha w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-line last:border-0"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14.5px] font-semibold text-t1 truncate">{client?.name ?? '—'}</span>
                    <span className="block text-[12.5px] text-t4 truncate">{s.propertyName} · {formatDateShort(s.date)}</span>
                  </span>
                  <span className="text-right flex-shrink-0">
                    <span className="block text-[14px] font-semibold text-t1 tabular-nums">{formatCurrency(s.value)}</span>
                    {bc > 0 && <span className="block text-[12px] text-success tabular-nums">{formatCurrency(bc)}</span>}
                  </span>
                  <ChevronRight size={16} strokeWidth={1.8} className="text-t4 flex-shrink-0" aria-hidden />
                </button>
              )
            })}
            <div className="flex items-center justify-between px-4 py-3 bg-s2">
              <p className="text-[12.5px] text-t4">{filtered.length} venda{filtered.length !== 1 ? 's' : ''}</p>
              <p className="text-[14px] font-semibold text-t1 tabular-nums">
                {formatCurrencyFull(filtered.reduce((acc, s) => acc + s.value, 0))}
              </p>
            </div>
          </ListContainer>

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

                  <button type="button" onClick={() => setVendoId(s.id)}
                    className={celula(COLUNAS[0], 'text-left cursor-pointer focus:outline-none focus-visible:underline')}>
                    <p className="text-sm font-medium text-t1 truncate">{client?.name ?? '—'}</p>
                    {/* "retroativo" é contexto, não estado comparável: texto,
                        não pílula. */}
                    <ContextoLinha itens={[isRetro && <span key="r">lançada em outro mês</span>]} />
                  </button>

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

      {vendoId && (() => {
        const venda = allSales.find(x => x.id === vendoId)
        return venda ? (
          <SaleFicha
            sale={venda}
            onClose={() => setVendoId(null)}
            onEdit={() => { setVendoId(null); setEditing(venda); setFormOpen(true) }}
            onDelete={() => { setVendoId(null); setDeleteTarget(venda) }}
          />
        ) : null
      })()}

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
