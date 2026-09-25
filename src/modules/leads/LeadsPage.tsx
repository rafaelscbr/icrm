import { useState, useEffect, useMemo } from 'react'
import { useIntelligenceStore } from '../../store/useIntelligenceStore'
import { TemperatureDot, FitBadge } from '../../components/shared/IntelBadges'
import { aoTeclarAbrir } from '../../components/shared/lista'
import { fitDeserveBadge } from '../../lib/intelligence'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, LayoutGrid, List, BarChart3,
  MessageCircle, Users, UserPlus, UserX, ChevronRight, RefreshCw, Settings2,
  Percent, Home, BadgeCheck, Snowflake, SearchX,
} from 'lucide-react'
import { avisoReentrada } from './reentrada'
import toast from 'react-hot-toast'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { EsqueletoLinhas, EsqueletoCards } from '../../components/shared/Esqueleto'
import { PageLayout } from '../../components/layout/PageLayout'
import { Abas } from '../../components/shared/Abas'
import { Button } from '../../components/ui/Button'
import { Lead, LeadFunnelStage } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { useKanbanPrefs, KanbanSort } from '../../store/useKanbanPrefs'
import { useLeadFiltersStore, OrdemLista } from '../../store/useLeadFiltersStore'
import { formatPhone, formatCurrency, whatsappUrl } from '../../lib/formatters'
import { Avatar } from '../../components/ui/Avatar'
import { LeadForm } from './LeadForm'
import { LeadModal } from './LeadModal'
import { LeadKanban, STAGE_CONFIG } from './LeadKanban'
import { LeadVisitaTaskModal } from './LeadVisitaTaskModal'
import { LeadsDashboard } from './LeadsDashboard'
import { LeadConversionTab } from './LeadConversionTab'
import { SlaBadge } from './SlaBadge'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { LeadSettings } from './LeadSettings'
import { ORIGEM_META } from './origens'
import { diasSemContato, nivelContato, haQuantoTempo } from './contato'
import {
  ContextoFiltro, aplicarFiltros, contarFiltros, ordenar, chaveProduto,
} from './leadFiltros'
import { BarraDeFiltros, PainelDeFiltros, OpcaoCatalogo } from './FiltrosDoFunil'

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

const ORDENS_LISTA: OrdemLista[] = ['criacao', 'sem_contato', 'prioridade', 'valor', 'etapa', 'antigos']
const ORDENS_KANBAN: KanbanSort[] = ['manual', ...ORDENS_LISTA]

type Tab = 'leads' | 'kanban' | 'dashboard' | 'conversao' | 'configuracoes'

/**
 * Relógio de minuto. Os filtros de tempo ("sem contato há mais de 2 dias",
 * "entraram hoje") dependem do agora; um tique por minuto mantém a tela
 * honesta sem recalcular a cada render. Não toca a rede.
 */
function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return agora
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

// ─── LeadRow ──────────────────────────────────────────────────────────────────

function LeadRow({ lead, onClick, mostrarEncaixe = true, agora }: {
  lead: Lead; onClick: () => void
  /** o chip de encaixe só informa quando a lista é mista — ver LeadsPage */
  mostrarEncaixe?: boolean
  agora: number
}) {
  const { advanceFollowup } = useLeadsStore()
  const { add: addInteraction } = useLeadInteractionsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const { getById } = useContactsStore()
  const { properties } = usePropertiesStore()

  // Visão admin global: identifica o corretor responsável
  const brokerName = isAdmin && !viewAsBrokerId && lead.brokerId
    ? allProfiles.find(p => p.id === lead.brokerId)?.name
    : undefined
  const property     = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const contact      = lead.contactId  ? getById(lead.contactId) : undefined
  const displayName  = contact?.name   ?? lead.name
  const displayPhone = contact?.phone  ?? lead.phone
  const conf         = STAGE_CONFIG[lead.funnelStage]
  const originConf   = ORIGEM_META[lead.origin]
  const isDiscarded  = !!lead.discardReason
  // Tempo sem contato só é alerta no funil aberto. Descartado e ganho têm o
  // silêncio que deveriam ter.
  const emAberto     = !isDiscarded && !lead.closedAt
  const dias         = diasSemContato(lead, agora)
  const nivel        = emAberto ? nivelContato(lead, agora) : 'em_dia'
  const intel        = useIntelligenceStore(s => s.intel[lead.id])
  const aviso        = avisoReentrada(lead)

  // Mesmo comportamento do Kanban: registra a interação no banco (dispara o
  // trigger de 1º contato do SLA Meta Ads) e avança o followup.
  async function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(whatsappUrl(displayPhone), '_blank')
    try {
      await advanceFollowup(lead.id)
      await addInteraction({
        leadId: lead.id,
        type: 'whatsapp',
        description: 'Interagiu via WhatsApp',
        interactedAt: new Date().toISOString(),
      })
      toast.success('Contato registrado')
    } catch { /* erro já toastado pela camada db */ }
  }

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={aoTeclarAbrir(onClick)}
      aria-label={`Abrir lead ${displayName}`}
      className={`lista-linha flex items-center gap-4 px-5 py-3.5 hover:bg-s3/50 transition-colors cursor-pointer border-b border-line last:border-0 group row-accent
        ${isDiscarded ? 'opacity-50' : ''}
      `}
    >
      <Avatar name={displayName} size="sm" />

      {/* O nome cresce até 46% da linha e para. Sem o teto, produto, valor e
          etapa iam parar na borda direita com 600 px de vazio no meio — a
          linha deixava de ser varrida num movimento só. */}
      <div className="flex-1 min-w-0 md:max-w-[46%]">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Ponto de temperatura antes do nome: na lista o olho desce pela
              coluna da esquerda, e é ali que a leitura em massa acontece. */}
          {intel && <TemperatureDot temp={intel.temperature} />}
          <span className="text-sm font-medium text-t1 truncate">{displayName}</span>
          {/* Reentrada não vista — mesmo aviso do Kanban, mesma regra (ver
              reentrada.ts). Na lista ele fica colado no nome porque é aqui que
              a varredura acontece. */}
          {aviso && (
            <span
              className="inline-flex items-center gap-1 font-label text-[11px] font-bold uppercase
                         tracking-[0.08em] text-info flex-shrink-0"
              title={aviso.detalhe}
            >
              {aviso.tipo === 'cliente'
                ? <BadgeCheck size={11} strokeWidth={1.8} aria-hidden />
                : <RefreshCw  size={11} strokeWidth={1.8} aria-hidden />}
              {aviso.texto}
            </span>
          )}
          {mostrarEncaixe && intel && fitDeserveBadge(intel.fitOrigin?.fit) && (
            <FitBadge fit={intel.fitOrigin!.fit} produto={intel.fitOrigin!.name} compact />
          )}
          <SlaBadge lead={lead} />
        </div>
        {/* Segunda linha: telefone, corretor e vínculo com o CRM viram TEXTO,
            não mais pílulas.

            A linha carregava sete elementos com moldura própria — temperatura,
            encaixe, SLA, corretor, CRM, origem e etapa — todos com borda, fundo
            e o mesmo peso visual. Quando tudo tem destaque, nada tem: o olho
            não achava por onde entrar. Só temperatura, encaixe e SLA (o que
            exige decisão) seguem com forma; o resto é contexto e lê como
            contexto. */}
        <div className="flex items-center gap-2 mt-0.5 text-xs text-t3 min-w-0">
          <span className="tabular-nums flex-shrink-0">{formatPhone(displayPhone)}</span>
          {brokerName && (
            <>
              <span className="text-t5" aria-hidden>·</span>
              <span className="truncate" title={`Corretor responsável: ${brokerName}`}>
                {brokerName.split(' ')[0]}
              </span>
            </>
          )}
          {/* O vínculo com o CRM é a regra, então não se escreve; a EXCEÇÃO
              é o que se marca. "no CRM" em todas as linhas era textura. */}
          {!lead.contactId && (
            <>
              <span className="text-t5" aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 text-t4 flex-shrink-0" title="Lead sem contato vinculado no CRM">
                <UserX size={10} strokeWidth={1.6} aria-hidden /> sem cadastro
              </span>
            </>
          )}
        </div>
      </div>

      {/* Produto e valor eram a MESMA célula, num encadeamento de `else`: quem
          tinha produto nunca via o valor. São dois fatos diferentes e agora
          ocupam colunas diferentes. */}
      <div className="hidden md:block flex-shrink-0 w-[150px] min-w-0">
        {property ? (
          <p className="text-xs text-t3 truncate">{property.name}</p>
        ) : lead.propertyName ? (
          <p className="text-xs text-t3 truncate flex items-center gap-1">
            <Home size={10} className="flex-shrink-0" aria-hidden /> {lead.propertyName}
          </p>
        ) : (
          <p className="text-xs text-t5">—</p>
        )}
      </div>

      <div className="hidden lg:block text-right flex-shrink-0 w-[92px]">
        {lead.averageTicket ? (
          <p className="font-heading text-[13px] font-bold text-t2 tabular-nums">
            {formatCurrency(lead.averageTicket)}
          </p>
        ) : (
          <p className="text-xs text-t5">—</p>
        )}
      </div>

      {/* Contato: o dado da ordem "mais tempo sem contato". Em cima, há quanto
          tempo alguém falou com o lead; embaixo, quando ele entrou. O ícone
          acompanha a cor — cor sozinha não diz status. */}
      <div
        className="hidden sm:flex flex-col flex-shrink-0 w-[112px] min-w-0"
        title={lead.lastContactAt
          ? `Último contato em ${new Date(lead.lastContactAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · entrou em ${new Date(lead.createdAt).toLocaleDateString('pt-BR')}`
          : `Nenhum contato registrado · entrou em ${new Date(lead.createdAt).toLocaleDateString('pt-BR')}`}
      >
        <span className={`inline-flex items-center gap-1 text-xs tabular-nums truncate
          ${nivel === 'parado' ? 'text-error font-semibold' : nivel === 'esfriando' ? 'text-warning font-semibold' : 'text-t2'}`}>
          {nivel !== 'em_dia' && <Snowflake size={11} strokeWidth={1.8} className="flex-shrink-0" aria-hidden />}
          {lead.lastContactAt ? haQuantoTempo(dias) : 'sem contato'}
        </span>
        <span className="text-[11px] text-t4 tabular-nums truncate">entrou {dataCurta(lead.createdAt)}</span>
      </div>

      {/* Origem sem moldura: é procedência, não estado. Com 99% dos leads
          vindo do Meta, ela desce de prioridade e só aparece em tela larga. */}
      <div className="hidden xl:flex items-center gap-1.5 text-xs text-t4 flex-shrink-0 w-[104px]">
        {originConf && <><originConf.icon size={11} strokeWidth={1.6} aria-hidden /> {originConf.label}</>}
      </div>

      {/* Etapa nunca quebra em duas linhas; a tentativa de follow-up sai do
          chip e vira número ao lado. */}
      <div className="w-[118px] flex-shrink-0 flex items-center gap-1.5 whitespace-nowrap">
        <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-lg border ${conf.bg} ${conf.color} ${conf.border}`}>
          {conf.label}
        </span>
        {lead.funnelStage === 'followup' && lead.followupStep > 0 && (
          <span className="text-[11px] text-t4 tabular-nums" title={`${lead.followupStep}ª tentativa de follow-up`}>
            {lead.followupStep}ª
          </span>
        )}
      </div>

      <div className="ml-auto w-[52px] flex-shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
        {!isDiscarded && (
          <button
            onClick={handleWhatsApp}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-green-400 hover:text-white hover:bg-green-500 border border-green-500/20 hover:border-green-500 transition-all"
            title="Abrir WhatsApp"
          >
            <MessageCircle size={13} />
          </button>
        )}
        <ChevronRight size={14} className="text-t4" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const { leads: allLeads, loading, erro, load, visitaSuggestLeadId, clearVisitaSuggest } = useLeadsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const visitaSuggestLead = visitaSuggestLeadId ? allLeads.find(l => l.id === visitaSuggestLeadId) : undefined
  const leads = useMemo(
    () => (isAdmin && viewAsBrokerId ? allLeads.filter(l => l.brokerId === viewAsBrokerId) : allLeads),
    [allLeads, isAdmin, viewAsBrokerId],
  )
  const { load: loadProps, properties } = usePropertiesStore()
  const { loadByIds: loadContactsByIds, contacts } = useContactsStore()
  const { load: loadConfig }   = useLeadConfigStore()
  const { load: loadIntel, intel } = useIntelligenceStore()

  // Filtro por corretor só faz sentido na visão admin global (sem corretor fixado)
  const showBrokerFilter = isAdmin && !viewAsBrokerId

  const [tab,           setTab]           = useState<Tab>('leads')
  const { filtros, definir, limpar, ordemLista, setOrdemLista } = useLeadFiltersStore()
  const { sort: ordemKanban, setSort: setOrdemKanban } = useKanbanPrefs()
  const [painelFiltros, setPainelFiltros] = useState(false)
  const agora = useAgora()
  // Escopo da lista/kanban: funil ativo, descartados ou ganhos (vendas encerradas)
  const [listView,      setListView]      = useState<'active' | 'discarded' | 'won'>('active')
  const [showForm,      setShowForm]      = useState(false)
  const [searchParams,  setSearchParams]  = useSearchParams()

  // Painel do lead — derivado da URL, não de estado local (ver comentário abaixo).
  const openLeadId = searchParams.get('lead')
  const setSelectedLead = (l: Lead | null) => {
    const next = new URLSearchParams(searchParams)
    if (l) next.set('lead', l.id)
    else   next.delete('lead')
    setSearchParams(next, { replace: !l })
  }

  useEffect(() => { load(); loadProps(); loadConfig(); loadIntel() }, [])  // eslint-disable-line react-hooks/exhaustive-deps -- cargas de abertura da tela: rodam uma vez, não a cada render

  // Só os contatos vinculados aos leads — antes era o fetchAll de 12.543 linhas
  // (~7,7 MB) para exibir algumas dezenas de nomes.
  useEffect(() => {
    const ids = leads.map(l => l.contactId).filter((id): id is string => !!id)
    if (ids.length > 0) loadContactsByIds(ids)
  }, [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * A URL é a fonte de verdade do painel: `/leads?lead=<id>`.
   *
   * Antes o deep-link `?open=` era consumido e apagado assim que abria — o
   * painel ficava aberto com a URL limpa, então não dava para compartilhar o
   * lead nem usar o voltar do navegador. Agora o parâmetro permanece enquanto
   * o painel estiver aberto, e fechar é só removê-lo.
   *
   * `?open=` continua aceito para não quebrar links já enviados por aí.
   */
  useEffect(() => {
    const legacy = searchParams.get('open')
    if (!legacy) return
    const next = new URLSearchParams(searchParams)
    next.delete('open')
    next.set('lead', legacy)
    setSearchParams(next, { replace: true })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lead do painel — resolvido a partir do id na URL contra a base carregada.
  const selectedLead = openLeadId ? allLeads.find(l => l.id === openLeadId) ?? null : null

  // Funil ativo = aberto (nem descartado nem ganho/encerrado) — foto real do agora
  const active    = leads.filter(l => !l.discardReason && !l.closedAt)
  const discarded = leads.filter(l => !!l.discardReason)
  const won       = leads.filter(l => !!l.closedAt)

  // Conjunto base: respeita o escopo da view (contagens estáveis)
  const scoped = useMemo(() => {
    if (listView === 'discarded') return leads.filter(l => !!l.discardReason)
    if (listView === 'won')       return leads.filter(l => !!l.closedAt)
    return leads.filter(l => !l.discardReason && !l.closedAt)
  }, [leads, listView])

  const isListTab        = tab === 'leads'
  const isKanbanTab      = tab === 'kanban'
  const isDashTab        = tab === 'dashboard'
  const isConvTab        = tab === 'conversao'
  const isConfigTab      = tab === 'configuracoes'

  // Contexto dos filtros: a busca procura pelo nome que a tela MOSTRA (o do
  // contato do CRM, quando vinculado) e pelo produto, cadastrado ou livre.
  const ctx: ContextoFiltro = useMemo(() => {
    const contatoPorId = new Map(contacts.map(c => [c.id, c]))
    const imovelPorId  = new Map(properties.map(p => [p.id, p]))
    return {
      intel,
      agora,
      ignorarEtapa: isKanbanTab,
      nomeExibido: l => (l.contactId ? contatoPorId.get(l.contactId)?.name : undefined) ?? l.name,
      nomeProduto: l => (l.propertyId ? imovelPorId.get(l.propertyId)?.name : undefined) ?? l.propertyName,
    }
  }, [intel, agora, isKanbanTab, contacts, properties])

  // A lista ordena aqui; o Kanban ordena por coluna, com a ordem dele.
  const filtered = useMemo(() => {
    const passam = aplicarFiltros(scoped, filtros, ctx)
    return isKanbanTab ? passam : ordenar(passam, ordemLista, agora)
  }, [scoped, filtros, ctx, isKanbanTab, ordemLista, agora])

  const nFiltros   = contarFiltros(filtros, ctx)
  const temRecorte = nFiltros > 0 || filtros.busca.trim() !== ''

  // Kanban filtrado: cada coluna mostra "12 de 40" — sem o total, a coluna
  // encolhida parece funil vazio.
  const totalPorEtapa = useMemo(() => {
    if (!isKanbanTab || !temRecorte) return undefined
    const out = {} as Record<LeadFunnelStage, number>
    for (const s of STAGES) out[s] = 0
    for (const l of scoped) out[l.funnelStage] = (out[l.funnelStage] ?? 0) + 1
    return out
  }, [isKanbanTab, temRecorte, scoped])

  // Catálogos do painel: o que existe no escopo, não o que existe no mundo.
  const produtosCatalogo: OpcaoCatalogo[] = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const l of scoped) {
      const key = chaveProduto(l)
      if (!key) continue
      const label = ctx.nomeProduto?.(l) ?? 'Imóvel'
      const cur = map.get(key)
      if (cur) cur.count++
      else map.set(key, { label, count: 1 })
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([value, { label }]) => ({ value, label }))
  }, [scoped, ctx])

  const corretoresCatalogo: OpcaoCatalogo[] | null = useMemo(() => {
    if (!showBrokerFilter) return null
    const ids = new Set(scoped.map(l => l.brokerId ?? ''))
    const opts = allProfiles
      .filter(p => ids.has(p.id))
      .map(p => ({ value: p.id, label: p.name }))
    if (ids.has('')) opts.push({ value: '', label: 'Sem corretor' })
    return opts
  }, [showBrokerFilter, scoped, allProfiles])

  // `/leads?novo=1` abre o formulário (busca ⌘K); `?etapa=<etapa>` filtra a
  // lista (Próxima melhor ação do Dashboard).
  useEffect(() => {
    const novo = searchParams.get('novo') === '1'
    const etapa = searchParams.get('etapa')
    if (!novo && !etapa) return
    if (novo) setShowForm(true)
    if (etapa && (STAGES as string[]).includes(etapa)) {
      // Link com etapa é pergunta fechada ("quem está em visita?"): recortes
      // antigos da sessão não podem esconder a resposta.
      setTab('leads')
      setListView('active')
      limpar()
      definir({ busca: '', etapas: [etapa as LeadFunnelStage] })
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams]) // eslint-disable-line react-hooks/exhaustive-deps -- limpar/definir são estáveis (zustand)

  // O chip de encaixe ("Difícil", "Ideal") só informa quando a lista é mista.
  // Em cem linhas todas "Difícil" ele vira textura e some da leitura.
  const encaixeMisto = useMemo(() => {
    const fits = new Set<string>()
    for (const l of filtered) {
      const f = intel[l.id]?.fitOrigin?.fit
      if (f) fits.add(f)
    }
    return fits.size > 1
  }, [filtered, intel])

  const TABS: { value: Tab; label: string; icon: typeof List; badge?: number }[] = [
    { value: 'leads',          label: 'Leads',          icon: List,        badge: erro ? undefined : active.length },
    { value: 'kanban',         label: 'Kanban',          icon: LayoutGrid                        },
    { value: 'dashboard',      label: 'Dashboard',       icon: BarChart3                         },
    { value: 'conversao',      label: 'Conversão',       icon: Percent                           },
    { value: 'configuracoes',  label: 'Configurações',   icon: Settings2                         },
  ]

  return (
    <PageLayout
      icon={UserPlus}
      iconTom="marca"
      title="Leads"
      subtitle={erro ? 'não foi possível ler o funil' : `Funil de prospecção · ${active.length} ativos`}
      ctaLabel="Novo Lead"
      onCta={() => setShowForm(true)}
      // O Kanban rola na horizontal e merece a largura toda; as outras visões
      // ficam no mesmo contêiner das demais telas.
      largura={isKanbanTab ? 'total' : 'padrao'}
      band={
        <Abas
          abas={TABS.map(t => ({ value: t.value, label: t.label, icon: t.icon, badge: t.badge }))}
          valor={tab}
          onChange={setTab}
          rotulo="Visões do funil"
          variante="sublinhado"
        />
      }
    >
      {isDashTab && <LeadsDashboard leads={leads} onOpenLead={setSelectedLead} />}
      {isConvTab && <LeadConversionTab />}
      {isConfigTab && <LeadSettings />}

      {(isListTab || isKanbanTab) && (
        <>
          <BarraDeFiltros
            vista={isKanbanTab ? 'kanban' : 'lista'}
            base={scoped}
            visiveis={filtered.length}
            ctx={ctx}
            agora={agora}
            ordem={isKanbanTab ? ordemKanban : ordemLista}
            opcoesOrdem={isKanbanTab ? ORDENS_KANBAN : ORDENS_LISTA}
            onOrdem={o => (isKanbanTab ? setOrdemKanban(o) : setOrdemLista(o as OrdemLista))}
            escopo={listView}
            onEscopo={setListView}
            ganhos={won.length}
            descartados={discarded.length}
            onAbrirPainel={() => setPainelFiltros(true)}
            produtos={produtosCatalogo}
            corretores={corretoresCatalogo}
          />
          <PainelDeFiltros
            isOpen={painelFiltros}
            onClose={() => setPainelFiltros(false)}
            vista={isKanbanTab ? 'kanban' : 'lista'}
            base={scoped}
            visiveis={filtered.length}
            ctx={ctx}
            agora={agora}
            produtos={produtosCatalogo}
            corretores={corretoresCatalogo}
          />

          {/* Falha vence tudo: sem a leitura completa, "nenhum lead
              encontrado" seria uma afirmação falsa sobre o funil. */}
          {erro ? (
            <EstadoTela carregando={false} erro={erro} vazio={false}
                        onTentarDeNovo={() => { void load() }}>
              <></>
            </EstadoTela>
          ) : loading && allLeads.length === 0 ? (
            isKanbanTab ? <EsqueletoCards cards={6} colunas={3} /> : <EsqueletoLinhas linhas={8} />
          ) : filtered.length === 0 && temRecorte ? (
            // Vazio por causa do filtro é outro estado: o funil tem leads, o
            // recorte é que não pegou ninguém. A saída fica a um toque.
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-s3/60 flex items-center justify-center">
                <SearchX size={28} strokeWidth={1.5} className="text-t3" aria-hidden />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-t2">Nenhum lead com esses filtros</p>
                <p className="text-xs text-t4 mt-1">
                  {scoped.length} {scoped.length === 1 ? 'lead fica' : 'leads ficam'} de fora do recorte atual
                </p>
              </div>
              <Button variant="secondary" size="md" onClick={() => { limpar(); definir({ busca: '' }) }}>
                Limpar filtros e busca
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-s3/60 flex items-center justify-center">
                <Users size={28} className="text-t3" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-t2">
                  {listView === 'discarded' ? 'Nenhum lead descartado'
                    : listView === 'won' ? 'Nenhuma venda ganha ainda'
                    : 'Nenhum lead no funil'}
                </p>
                {listView === 'active' && (
                  <p className="text-xs text-t4 mt-1">Clique em "Novo Lead" para começar</p>
                )}
              </div>
              {listView === 'active' && (
                <Button onClick={() => setShowForm(true)} size="md">
                  <Plus size={14} /> Criar primeiro lead
                </Button>
              )}
            </div>
          ) : isKanbanTab ? (
            <LeadKanban
              leads={filtered}
              totalPorEtapa={totalPorEtapa}
              filtroSemContatoAtivo={filtros.semContato === '2'}
              // Descartado e ganho não esfriam: o atalho só existe no funil aberto.
              onFiltrarSemContato={listView === 'active'
                ? () => definir({ semContato: filtros.semContato === '2' ? null : '2' })
                : undefined}
            />
          ) : (
            <div className="rounded-xl border border-line overflow-hidden list-surface stagger-children">
              {/* O cabeçalho espelha a linha: mesmas larguras, mesma ordem. */}
              <div className="flex items-center gap-4 px-5 py-2.5 border-b border-line bg-s3/20 select-none">
                <span className="w-8 flex-shrink-0" aria-hidden />
                <span className="flex-1 min-w-0 md:max-w-[46%] font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Nome</span>
                <span className="hidden md:block w-[150px] flex-shrink-0 font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Produto</span>
                <span className="hidden lg:block w-[92px] flex-shrink-0 text-right font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Valor</span>
                <span className="hidden sm:block w-[112px] flex-shrink-0 font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Contato</span>
                <span className="hidden xl:block w-[104px] flex-shrink-0 font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Origem</span>
                <span className="w-[118px] flex-shrink-0 font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Etapa</span>
                <span className="ml-auto w-[52px] flex-shrink-0" aria-hidden />
              </div>
              {filtered.map(lead => (
                <LeadRow key={lead.id} lead={lead} mostrarEncaixe={encaixeMisto} agora={agora} onClick={() => setSelectedLead(lead)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <LeadForm isOpen={showForm} onClose={() => setShowForm(false)} />
      {selectedLead && (
        <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}

      {/* Sugestão de agendamento ao mover lead para a coluna Visita */}
      {visitaSuggestLead && (
        <LeadVisitaTaskModal lead={visitaSuggestLead} onClose={clearVisitaSuggest} />
      )}
    </PageLayout>
  )
}
