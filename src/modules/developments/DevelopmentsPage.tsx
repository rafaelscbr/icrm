import { useEffect, useState, useMemo } from 'react'
import {
  Search, Rocket, Pencil, AlertTriangle, CheckCircle2, MapPin,
  Wallet, TrendingUp, Layers, Megaphone,
  Plus,
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Painel, Rotulo } from '../../components/shared/visual'
import { Card } from '../../components/ui/Card'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { Button } from '../../components/ui/Button'
import { DevelopmentForm } from './DevelopmentForm'
import { DevelopmentModal } from './DevelopmentModal'
import { QualificationScale } from './QualificationScale'
import { pendenciasDaRegua } from './qualification'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'
import { useAuthStore } from '../../store/useAuthStore'
import {
  Development, DEVELOPMENT_STATUS_LABEL, DEVELOPMENT_REGIME_LABEL,
} from '../../types'
import { formatCurrency } from '../../lib/formatters'

const STATUS_STYLE: Record<string, string> = {
  lancamento: 'bg-brand-tint text-brand-text border-brand/25',
  em_obra:    'bg-info-bg text-info border-info-line',
  pronto:     'bg-success-bg text-success border-success-line',
}

// ─── Card do lançamento ───────────────────────────────────────────────────────

function DevelopmentCard({ development: d, onOpen, onEdit, canEdit }: {
  development: Development
  onOpen: () => void
  onEdit: () => void
  canEdit: boolean
}) {
  const pendencias = pendenciasDaRegua(d)
  const faixa =
    d.valueMin !== undefined && d.valueMax !== undefined
      ? `${formatCurrency(d.valueMin)} – ${formatCurrency(d.valueMax)}`
      : d.valueMin !== undefined ? `a partir de ${formatCurrency(d.valueMin)}`
      : d.valueMax !== undefined ? `até ${formatCurrency(d.valueMax)}`
      : null

  return (
    <Card padding="none" className="flex flex-col group">
      {/*
        A faixa colorida na borda superior diz o estado da régua sem badge:
        âmbar = ainda é palpite meu, verde = alguém conferiu.
      */}
      <div
        className="h-1 w-full flex-shrink-0"
        style={{ background: d.confirmed ? 'var(--success)' : 'var(--warning)' }}
        aria-hidden
      />

      <button
        onClick={onOpen}
        className="flex-1 text-left p-5 cursor-pointer transition-colors hover:bg-s2/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-b-xl"
        aria-label={`Abrir ${d.name}`}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-t1 truncate">{d.name}</h3>
            <p className="text-xs text-t3 mt-0.5 truncate">
              {[d.builder, d.region ?? 'Região não informada', d.city].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span
            className={`px-2 py-1 rounded-md text-[11px] font-semibold border flex-shrink-0 ${STATUS_STYLE[d.status]}`}
          >
            {DEVELOPMENT_STATUS_LABEL[d.status]}
          </span>
        </div>

        {/* Linha de fatos */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-xs text-t3">
          <span className="inline-flex items-center gap-1.5">
            <Layers size={12} className="text-t4" />
            {DEVELOPMENT_REGIME_LABEL[d.regime]}
          </span>
          {faixa && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Wallet size={12} className="text-t4" />
              {faixa}
            </span>
          )}
          {d.unitTypes.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={12} className="text-t4" />
              {d.unitTypes.join(' e ')} dorm
            </span>
          )}
          {d.metaFormIds.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Megaphone size={12} className="text-t4" />
              {d.metaFormIds.length} {d.metaFormIds.length === 1 ? 'formulário' : 'formulários'}
            </span>
          )}
        </div>

        {/* Réguas */}
        <div className="flex flex-col gap-3.5">
          <QualificationScale label="Renda" min={d.incomeMin} ideal={d.incomeIdeal} suffix="/mês" compact />
          <QualificationScale label="Entrada" min={d.downPaymentMin} ideal={d.downPaymentIdeal} compact />
        </div>
      </button>

      {/* Rodapé — estado da régua e ação */}
      <div
        className="px-5 py-3 flex items-center justify-between gap-3 border-t border-line"
        style={{ background: 'var(--s2)' }}
      >
        {d.confirmed ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success min-w-0">
            <CheckCircle2 size={12} className="flex-shrink-0" />
            Régua confirmada
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning min-w-0">
            <AlertTriangle size={12} className="flex-shrink-0" />
            <span className="truncate" title={`Falta: ${pendencias.join(', ')}`}>
              {pendencias.length === 1
                ? `Falta ${pendencias[0]}`
                : `Faltam ${pendencias.length} itens`}
            </span>
          </span>
        )}

        {canEdit && (
          <button
            onClick={onEdit}
            aria-label={`Editar ${d.name}`}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-t3 hover:bg-surface hover:text-brand-text transition-colors cursor-pointer flex-shrink-0"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
    </Card>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function DevelopmentsPage() {
  const { developments, loading, erro, load } = useDevelopmentsStore()
  const isAdmin = useAuthStore(s => s.isAdmin)

  const [busca, setBusca]           = useState('')
  const [formOpen, setFormOpen]     = useState(false)
  const [editando, setEditando]     = useState<Development | undefined>()
  const [aberto, setAberto]         = useState<Development | undefined>()

  useEffect(() => { load() }, [load])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return developments
      .filter(d => d.active)
      .filter(d => !q || [d.name, d.builder, d.region, d.city].some(v => v?.toLowerCase().includes(q)))
      .sort((a, b) => {
        // Não confirmado sobe: é o que precisa de decisão.
        if (a.confirmed !== b.confirmed) return a.confirmed ? 1 : -1
        return a.name.localeCompare(b.name, 'pt-BR')
      })
  }, [developments, busca])

  const aConfirmar = developments.filter(d => d.active && !d.confirmed).length
  const vgvPotencial = developments
    .filter(d => d.active)
    .reduce((s, d) => s + (d.valueMax ?? d.valueMin ?? 0), 0)

  function abrirNovo() { setEditando(undefined); setFormOpen(true) }
  function abrirEdicao(d: Development) { setEditando(d); setFormOpen(true) }

  return (
    <PageLayout
      icon={Rocket}
      iconTom="marca"
      title="Lançamentos"
      subtitle={erro
        ? 'não foi possível ler os lançamentos'
        : 'Empreendimentos na planta e a condição comercial que qualifica o lead'}
      ctaLabel={isAdmin ? 'Novo lançamento' : undefined}
      onCta={isAdmin ? abrirNovo : undefined}
    >
      {/* Aviso: régua não confirmada trava a inteligência */}
      {aConfirmar > 0 && (
        <div
          className="mb-6 flex items-start gap-3 p-4 rounded-xl border border-warning-line bg-warning-bg"
          role="status"
        >
          <AlertTriangle size={15} className="text-warning flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warning">
              {aConfirmar} {aConfirmar === 1 ? 'lançamento aguarda' : 'lançamentos aguardam'} confirmação da régua
            </p>
            <p className="text-xs text-t2 mt-1 leading-relaxed">
              Os valores vieram das faixas dos formulários do Meta e das vendas já registradas —
              são inferência, não condição oficial. Abra cada um, corrija o que estiver errado e
              marque <span className="text-t1 font-medium">“Régua conferida”</span>.
              A qualificação de lead só passa a rodar depois disso.
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      {developments.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Lançamentos ativos', value: developments.filter(d => d.active).length.toString(), sub: 'em carteira', icon: <Rocket size={15} />, color: 'text-brand-text', bg: 'bg-brand-tint' },
            { label: 'Régua confirmada', value: `${developments.filter(d => d.active && d.confirmed).length}/${developments.filter(d => d.active).length}`, sub: 'prontos para qualificar', icon: <CheckCircle2 size={15} />, color: 'text-success', bg: 'bg-success-bg' },
            { label: 'Ticket mais alto', value: vgvPotencial > 0 ? formatCurrency(Math.max(...developments.filter(d => d.active).map(d => d.valueMax ?? d.valueMin ?? 0))) : '—', sub: 'unidade mais cara', icon: <TrendingUp size={15} />, color: 'text-info', bg: 'bg-info-bg' },
            { label: 'Formulários ligados', value: developments.filter(d => d.active).reduce((s, d) => s + d.metaFormIds.length, 0).toString(), sub: 'trazendo lead do Meta', icon: <Megaphone size={15} />, color: 'text-t1', bg: 'bg-s2' },
          ].map(kpi => (
            <Painel key={kpi.label} className="px-4 py-3.5">
              <div className="flex items-center gap-2 mb-2">
                <span className={`${kpi.color} ${kpi.bg} w-7 h-7 rounded-[9px] border border-line
                                  flex items-center justify-center shrink-0`}>{kpi.icon}</span>
                <Rotulo className="truncate">{kpi.label}</Rotulo>
              </div>
              <p className={`font-heading text-[26px] font-extrabold tabular-nums leading-none
                             tracking-tight ${kpi.color}`}>{kpi.value}</p>
              <p className="text-[11px] text-t4 mt-1.5">{kpi.sub}</p>
            </Painel>
          ))}
        </div>
      )}

      {/* Busca */}
      {developments.length > 0 && (
        <div className="relative mb-5 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3 pointer-events-none" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, construtora ou região…"
            aria-label="Buscar lançamento"
            className="w-full bg-surface border border-line-input rounded-lg pl-9 pr-3 py-2.5 text-sm text-t1 min-h-[42px]
                       placeholder:text-t3 hover:border-line-strong
                       focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-all"
          />
        </div>
      )}

      {/* Lista */}
      {loading && developments.length === 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="h-64 rounded-xl bg-surface border border-line animate-pulse" />
          ))}
        </div>
      ) : (
        <EstadoTela
          carregando={false}
          erro={erro}
          vazio={lista.length === 0}
          onTentarDeNovo={() => { void load() }}
          icone={Rocket}
          titulo={busca ? 'Nenhum lançamento encontrado' : 'Nenhum lançamento cadastrado'}
          descricao={
            busca
              ? 'Tente outro termo de busca.'
              : 'Cadastre os empreendimentos que vocês trabalham. É a régua deles que decide se um lead faz sentido para o produto.'
          }
          acao={isAdmin && !busca && (
            <Button onClick={abrirNovo} className="gap-2">
              <Plus size={14} /> Cadastrar lançamento
            </Button>
          )}
        >
        <div className="grid md:grid-cols-2 gap-4">
          {lista.map(d => (
            <DevelopmentCard
              key={d.id}
              development={d}
              onOpen={() => setAberto(d)}
              onEdit={() => abrirEdicao(d)}
              canEdit={isAdmin}
            />
          ))}
          </div>
        </EstadoTela>
      )}

      {formOpen && (
        <DevelopmentForm
          isOpen={formOpen}
          onClose={() => { setFormOpen(false); setEditando(undefined) }}
          development={editando}
        />
      )}

      {aberto && (
        <DevelopmentModal
          isOpen={!!aberto}
          onClose={() => setAberto(undefined)}
          development={developments.find(d => d.id === aberto.id) ?? aberto}
          onEdit={() => { const d = aberto; setAberto(undefined); abrirEdicao(d) }}
          canEdit={isAdmin}
        />
      )}
    </PageLayout>
  )
}
