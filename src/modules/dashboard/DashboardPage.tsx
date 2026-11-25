import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import type { Task } from '../../types'
import { TaskForm } from '../tasks/TaskForm'
import { PageLayout } from '../../components/layout/PageLayout'
import { FunisComerciais, periodoSalvo, salvarPeriodo, useFunisComerciais } from './FunisComerciais'
import { PainelMarinho } from './PainelMarinho'
import type { Meta, Pessoa, Previsao, Semana, Total } from './PainelMarinho'
import { PERIODOS } from './funis'
import type { Periodo } from './funis'
import { useSalesStore } from '../../store/useSalesStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAdminView } from '../../hooks/useAdminView'
import { useAuthStore } from '../../store/useAuthStore'
import { formatCurrencyRound } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'
import { destacar } from '../../components/shared/Destaque'
import { PrimeiroContatoResumo } from '../leads/PrimeiroContatoResumo'
import { OrigemEDescartes } from './OrigemEDescartes'
import { primeiroContato, primeiroContatoPorCorretor, SEM_FILTRO } from '../leads/safra'

/* ═══════════════════════════════════════════════════════════════════════════
   SOUZA COMMAND CENTER — redesenho de 24/11/2026

   Inspirada na tela "Invoices" que o Rafael mostrou (painel escuro com
   cartões de vidro, lista com a linha escolhida em destaque e o detalhe ao
   lado), nas cores da Souza. De cima para baixo:

     1. Painel Marinho (PainelMarinho.tsx)
          · o perfil de quem está na visão, com a foto grande e os totais do
            período (VGV vendido, visitas, propostas, comissão)
          · a meta do mês, com as semanas em barras e a foto de quem vendeu
          · a previsão de VGV (visita + proposta) e a comissão prevista
     2. Funil comercial (FunisComerciais.tsx) — lista (imobiliária inteira,
        produtos ou corretores) e o detalhe em Marinho do escolhido.

   O período escolhido no perfil vale para os totais e para o funil. A meta e
   a previsão são sempre do mês / de agora — e dizem isso na tela.

   Regra do produto: a PREVISÃO é visita + proposta, nunca o funil inteiro.
   Procedência: meta, realizado e previsão vêm da RPC `dashboard_overview`
   (escopada por p_broker_id); o resto, dos stores — os mesmos números do
   Kanban e da aba Conversão.
   ═══════════════════════════════════════════════════════════════════════════ */

interface OverviewData {
  vgl: {
    target: number; realizadoMes: number; vendasMes: number
    expectativa: number; expectativaVisita: number; expectativaProposta: number
    leadsVisita: number; leadsProposta: number
  }
  leadFunnel: Array<{ stage: string; count: number }>
  leadsAtivos: number
  leadsSemInteracao: number
  alertas: { tarefasEmAtraso: number; slaEstourado: number }
}

/** Comissão bruta estimada sobre a previsão (visita + proposta) — 5%, a regra da casa (comissao.ts). */
const PIPELINE_COMMISSION_RATE = 0.05

const R = formatCurrencyRound

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** As semanas do mês corrente, domingo a sábado (convenção do sistema). */
function semanasDoMes(hoje = new Date()): { ini: string; fim: string; rotulo: string; dias: number; futura: boolean }[] {
  const y = hoje.getFullYear(), m = hoje.getMonth()
  const ultimo = new Date(y, m + 1, 0).getDate()
  const out = []
  let d = 1
  while (d <= ultimo) {
    const dow = new Date(y, m, d).getDay()
    const fimDia = Math.min(ultimo, d + (6 - dow))
    out.push({
      ini: localISO(new Date(y, m, d)), fim: localISO(new Date(y, m, fimDia)),
      rotulo: d === fimDia ? `${d}` : `${d}–${fimDia}`,
      dias: fimDia - d + 1,
      futura: d > hoje.getDate(),
    })
    d = fimDia + 1
  }
  return out
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [taskFormOpen,    setTaskFormOpen]    = useState(false)
  const [overviewData,    setOverviewData]    = useState<OverviewData | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError,   setOverviewError]   = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>(periodoSalvo)

  const { profile, isAdmin, allProfiles } = useAuthStore()
  const { effectiveBrokerId, isGlobalView, isOwnView } = useAdminView()
  const firstName = profile?.name?.split(' ')[0] ?? 'Corretor'

  const { sales, load: loadSales }   = useSalesStore()
  const { tasks, load: loadTasks }   = useTasksStore()
  const { leads, load: loadMyLeads } = useLeadsStore()

  async function loadOverview() {
    setOverviewLoading(true)
    setOverviewError(null)
    // Respeita o modelo de visão: global (null), "Meu Desempenho" ou Corretor X.
    // Para corretor comum effectiveBrokerId = próprio id; a RLS reforça o limite.
    const { data, error } = await supabase.rpc('dashboard_overview', { p_broker_id: effectiveBrokerId })
    if (error) {
      setOverviewError(error.message)
      setOverviewLoading(false)
      return
    }
    setOverviewData(data as OverviewData)
    setOverviewLoading(false)
  }

  useEffect(() => {
    loadSales(); loadTasks(); loadMyLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBrokerId])

  const corretor = isGlobalView ? null : (effectiveBrokerId ?? null)
  const { funis, safra, erro: erroFunis, carregando: carregandoFunis, inicio, perfis, tentarDeNovo } =
    useFunisComerciais({ leads, sales, corretor, periodo })

  function escolherPeriodo(p: Periodo) { setPeriodo(p); salvarPeriodo(p) }
  const descricao = PERIODOS.find(p => p.value === periodo)!.descricao

  // Escopo da visão para o que é lido de stores no cliente.
  const inViewTasks = (arr: Task[]) =>
    isGlobalView ? arr : arr.filter(t => (t.assignedToId ?? t.brokerId) === effectiveBrokerId)

  // ── Quem está na visão ─────────────────────────────────────────────────────
  const pessoa: Pessoa = useMemo(() => {
    if (isGlobalView || !effectiveBrokerId) {
      return { nome: profile?.name ?? 'Souza', foto: profile?.avatarUrl, papel: 'Visão global · a imobiliária inteira' }
    }
    const p = effectiveBrokerId === profile?.id ? profile : allProfiles.find(x => x.id === effectiveBrokerId)
    const parte = p?.commissionShare ? ` · ${p.commissionShare}% da líquida` : ''
    return {
      nome: p?.name ?? 'Corretor',
      foto: p?.avatarUrl,
      papel: (isOwnView || !isAdmin ? 'Seu desempenho' : 'Corretor') + parte,
    }
  }, [isGlobalView, effectiveBrokerId, profile, allProfiles, isOwnView, isAdmin])

  // ── Totais do período ──────────────────────────────────────────────────────
  const totais: Total[] | null = useMemo(() => {
    if (!funis) return null
    const g = funis.geral
    const visitas = inViewTasks(tasks.filter(t =>
      t.category === 'visita' && t.status === 'done' && (!inicio || (t.completedAt ?? t.dueDate ?? '') >= inicio))).length
    const global = isGlobalView
    return [
      { rotulo: 'VGV vendido', valor: R(g.vendido.vgv), nota: `${g.vendido.n} ${g.vendido.n === 1 ? 'venda' : 'vendas'} · ${descricao}` },
      { rotulo: 'Visitas feitas', valor: visitas.toLocaleString('pt-BR'), nota: descricao },
      { rotulo: 'Propostas', valor: g.aberto.proposta.n.toLocaleString('pt-BR'), nota: 'na mesa agora' },
      global
        ? { rotulo: 'Comissão recebida', valor: R(g.vendido.bruta), nota: `bruta · ${descricao}` }
        : { rotulo: 'Sua comissão', valor: R(g.vendido.corretor), nota: `recebida · ${descricao}` },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funis, tasks, inicio, descricao, isGlobalView, effectiveBrokerId])

  // ── Meta do mês e as semanas ───────────────────────────────────────────────
  const hoje = new Date()
  const meta: Meta | null = overviewData ? {
    alvo: overviewData.vgl.target,
    realizado: overviewData.vgl.realizadoMes,
    vendas: overviewData.vgl.vendasMes,
    dia: hoje.getDate(),
    diasNoMes: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate(),
    mes: (m => m.charAt(0).toUpperCase() + m.slice(1))(hoje.toLocaleDateString('pt-BR', { month: 'long' })),
  } : null

  const semanas: Semana[] = useMemo(() => {
    const doMes = sales.filter(s => isGlobalView || s.brokerId === effectiveBrokerId)
    return semanasDoMes().map(w => {
      const daSemana = doMes.filter(s => s.date >= w.ini && s.date <= w.fim)
      const ids = [...new Set(daSemana.map(s => s.brokerId).filter((x): x is string => !!x))]
      return {
        rotulo: w.rotulo, dias: w.dias, futura: w.futura,
        vgv: daSemana.reduce((t, s) => t + s.value, 0),
        vendedores: ids.map(id => ({ id, nome: perfis.get(id)?.name ?? 'Corretor', foto: perfis.get(id)?.avatarUrl })),
      }
    })
  }, [sales, isGlobalView, effectiveBrokerId, perfis])

  const previsao: Previsao | null = overviewData ? {
    total: overviewData.vgl.expectativa,
    visita: overviewData.vgl.expectativaVisita,
    proposta: overviewData.vgl.expectativaProposta,
    leadsVisita: overviewData.vgl.leadsVisita,
    leadsProposta: overviewData.vgl.leadsProposta,
    comissao: overviewData.vgl.expectativa * PIPELINE_COMMISSION_RATE,
  } : null

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }
  const todayFormatted = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <PageLayout
      icon={LayoutDashboard}
      iconTom="marca"
      title={`${greeting()}, *${firstName}*`}
      subtitle={todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1)}
      ctaLabel="Nova Tarefa"
      onCta={() => setTaskFormOpen(true)}
    >
      <PainelMarinho
        pessoa={pessoa}
        totais={totais}
        periodo={periodo}
        onPeriodo={escolherPeriodo}
        meta={meta}
        semanas={semanas}
        previsao={previsao}
        erro={overviewError}
        carregando={overviewLoading}
        onRecarregar={loadOverview}
        onAbrirKanban={() => navigate('/leads')}
      />

      <FunisComerciais
        funis={funis}
        erro={erroFunis}
        carregando={carregandoFunis}
        onTentarDeNovo={tentarDeNovo}
        perfis={perfis}
        periodo={periodo}
        mostrarCorretores={isGlobalView && isAdmin}
        admin={isAdmin}
      />

      {/* Resultado do 1º contato (migração 114) — a mesma safra do funil acima */}
      {safra && (
        <section aria-labelledby="primeiro-contato-titulo" className="dash-painel-branco mb-10">
          <header className="mb-5">
            <h2 id="primeiro-contato-titulo" className="font-display text-[22px] font-bold text-t1 tracking-[-0.025em]">
              {destacar('Primeiro *contato*')}
            </h2>
            <p className="text-[13px] text-t4 mt-0.5">O que aconteceu na 1ª chamada dos leads que chegaram {descricao}</p>
          </header>
          <PrimeiroContatoResumo
            r={primeiroContato(safra, { corretor, produto: null })}
            porCorretor={isGlobalView && isAdmin ? primeiroContatoPorCorretor(safra, SEM_FILTRO) : []}
          />
        </section>
      )}

      {/* De onde vêm (DDD, migração 115) e por que saem — a mesma safra do funil */}
      {safra && <OrigemEDescartes safra={safra} corretor={corretor} descricao={descricao} />}

      <TaskForm isOpen={taskFormOpen} onClose={() => setTaskFormOpen(false)} />
    </PageLayout>
  )
}
