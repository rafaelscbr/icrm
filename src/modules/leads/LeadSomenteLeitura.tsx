import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, CalendarClock, Eye, RefreshCw, Timer } from 'lucide-react'
import type { Lead, LeadInteraction, LeadProfile } from '../../types'
import { MAX_TENTATIVAS_FOLLOWUP } from '../../types'
import { db } from '../../lib/db'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { formatCurrency, formatPhone } from '../../lib/formatters'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { useFotoDoCorretor } from '../../components/shared/CorretorComFoto'
import { FotoPerfil } from '../../components/shared/FotoPerfil'
import {
  FichaPainel, FichaBarraTopo, FichaNome, FichaNumeros, FichaSecao, FichaRegua,
} from '../../components/shared/Ficha'
import { ORIGEM_META } from './origens'
import { slaActive } from './SlaBadge'
import { PerfilSomenteLeitura, FormulariosPreenchidos, BaseConhecida } from './LeadProfilePanel'
import { HistoricoSomenteLeitura } from './LeadTimeline'
import { ListaDeFluxos, agruparFluxos } from './fluxos/FluxosDoLead'
import type { LeadFluxo } from '../simulador/shared/fluxo'

/**
 * A ficha de um lead de OUTRO corretor, para o gestor ler (migração 095).
 *
 * É uma ficha à parte, não a ficha de trabalho com os botões escondidos: aqui
 * não existe WhatsApp, ligar, tarefa, mover etapa, transferir, qualificar,
 * editar nem apagar. O telefone aparece como texto — dá para ler, não é um
 * atalho para abordar o lead. E não depende só da tela: o banco não dá ao
 * gestor nenhuma permissão de escrita sobre o lead do colega.
 *
 * Uma leitura por ficha aberta (team_lead_detail devolve tudo de uma vez). É um
 * retrato do momento em que foi lido — o gestor não recebe os eventos ao vivo
 * dos leads dos colegas —, por isso o "atualizar".
 */

type Detalhe = Awaited<ReturnType<typeof db.leads.detalheDaEquipe>>

/**
 * Os fluxos guardados no lead, só para ler (migração 096). Leitura à parte da
 * ficha: se ela falhar, o resto da ficha continua de pé e a falha aparece aqui.
 * Sem as funções de ação, a lista não tem editar, enviar nem arquivar.
 */
function FluxosSomenteLeitura({ leadId }: { leadId: string }) {
  const [versoes, setVersoes] = useState<LeadFluxo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    db.leadFluxos.listar(leadId)
      .then(v => { if (vivo) { setVersoes(v); setErro(null) } })
      .catch(e => { if (vivo) { setVersoes(null); setErro((e as { message?: string })?.message ?? 'Falha ao ler os fluxos') } })
    return () => { vivo = false }
  }, [leadId])

  if (erro) return <FichaSecao titulo="Fluxos"><p className="text-[13.5px] text-error" role="alert">Não foi possível carregar os fluxos: {erro}</p></FichaSecao>
  if (versoes === null) return <FichaSecao titulo="Fluxos"><div className="h-[72px] rounded-[14px] shimmer" role="status" aria-label="Carregando os fluxos" /></FichaSecao>
  const grupos = agruparFluxos(versoes)
  if (grupos.length === 0) return null
  return (
    <FichaSecao titulo={`${grupos.length === 1 ? 'Fluxo guardado' : `${grupos.length} fluxos guardados`}`}>
      <ListaDeFluxos grupos={grupos} />
    </FichaSecao>
  )
}

const DIA_MS = 86_400_000

/** "Hoje", "Ontem", "Há 5 dias" — para a célula de último contato. */
function haQuanto(iso: string | undefined, agora: number): string {
  if (!iso) return 'Sem contato'
  const dias = Math.floor((agora - new Date(iso).getTime()) / DIA_MS)
  if (dias <= 0) return 'Hoje'
  if (dias === 1) return 'Ontem'
  return `Há ${dias} dias`
}

/** Data de tarefa guardada como texto AAAA-MM-DD: sem `new Date`, que a leria em UTC e voltaria um dia. */
function dataDaTarefa(dueDate: string | null, dueTime: string | null): string {
  if (!dueDate) return 'Sem data'
  const [, mes, dia] = dueDate.split('-')
  return `${dia}/${mes}${dueTime ? ` às ${dueTime.slice(0, 5)}` : ''}`
}

export function LeadSomenteLeitura({ leadId, nome, corretor, corretorId, onClose }: {
  leadId: string
  /** nome do lead como veio no quadro — aparece já, enquanto a ficha carrega */
  nome: string
  /** nome do corretor responsável */
  corretor: string
  /** id do corretor — para a foto já na abertura; sem ele, a foto chega com a ficha */
  corretorId?: string | null
  onClose: () => void
}) {
  const [dados, setDados] = useState<Detalhe | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setDados(await db.leads.detalheDaEquipe(leadId))
      setErro(null)
    } catch (e) {
      // Falhou: não se mostra uma ficha velha como se fosse a de agora.
      setDados(null)
      setErro((e as { message?: string })?.message ?? 'Falha ao ler o lead')
    } finally {
      setCarregando(false)
    }
  }, [leadId])

  useEffect(() => { void carregar() }, [carregar])

  const lead = dados?.lead
  const primeiroNome = corretor.split(' ')[0]
  const fotoDe = useFotoDoCorretor()

  return (
    <FichaPainel
      rotulo={`Lead ${lead?.name ?? nome}, somente leitura`}
      onClose={onClose}
      topo={
        <>
          <FichaBarraTopo
            onClose={onClose}
            contexto={<>
              <Eye size={13} strokeWidth={1.8} className="text-info flex-shrink-0" aria-hidden />
              <span className="truncate">Somente leitura · lead de {primeiroNome}</span>
              {/* a foto logo depois do nome: de quem é este lead, de relance */}
              <FotoPerfil nome={corretor} url={fotoDe(corretorId ?? lead?.brokerId)} tamanho={24} />
            </>}
            acoes={
              <button type="button" onClick={() => void carregar()} disabled={carregando}
                      className="ficha-icone disabled:opacity-50" aria-label="Atualizar a ficha" title="Atualizar">
                <RefreshCw size={17} strokeWidth={1.8} className={carregando ? 'animate-spin' : ''} aria-hidden />
              </button>
            }
          />
          <FichaNome>{lead?.name ?? nome}</FichaNome>
          {lead && <Cabecalho lead={lead} />}
          <div className="h-4" />
        </>
      }
    >
      {carregando && !dados && (
        <div className="flex flex-col gap-3" role="status" aria-label="Carregando a ficha">
          {[72, 120, 96, 160].map((h, i) => <div key={i} className="rounded-[14px] shimmer" style={{ height: h }} aria-hidden />)}
        </div>
      )}

      {erro && (
        <div role="alert" className="rounded-[14px] border border-error-line bg-error-bg px-4 py-3.5">
          <p className="text-[14px] font-semibold text-t1">Não foi possível abrir este lead.</p>
          <p className="text-[13px] text-t3 mt-0.5">{erro}</p>
          <button type="button" onClick={() => void carregar()}
                  className="mt-3 h-9 px-3.5 rounded-[10px] bg-surface border border-line text-[13px] font-semibold text-t1 hover:bg-s2 cursor-pointer">
            Tentar de novo
          </button>
        </div>
      )}

      {dados && lead && <Corpo lead={lead} perfil={dados.perfil} historico={dados.historico} tarefas={dados.tarefas} />}
    </FichaPainel>
  )
}

/** Quem é: telefone e e-mail como TEXTO, origem, quando entrou — e em que pé está. */
function Cabecalho({ lead }: { lead: Lead }) {
  const origem = ORIGEM_META[lead.origin]
  const entrou = new Date(lead.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <>
      <p className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[14px] text-t2">
        <span className="tabular-nums select-all">{lead.phone ? formatPhone(lead.phone) : 'Sem telefone'}</span>
        {lead.email && <span className="select-all truncate">{lead.email}</span>}
        {lead.qualifiedAt && (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
            <BadgeCheck size={14} strokeWidth={1.8} aria-hidden /> Qualificado
          </span>
        )}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-t4">
        {origem && <origem.icon size={12} strokeWidth={1.6} aria-hidden />}
        {origem?.label ?? 'Origem não informada'} · entrou em {entrou}
      </p>
      <div className="mt-5">
        <FichaRegua
          etapas={FUNNEL_STAGES.map(e => ({ chave: e, rotulo: STAGE_THEME[e].label }))}
          atual={lead.funnelStage}
          cor={`var(--stage-${lead.funnelStage})`}
          rotulo="Etapa do funil"
        />
      </div>
    </>
  )
}

function Corpo({ lead, perfil, historico, tarefas }: {
  lead: Lead
  perfil: LeadProfile | null
  historico: LeadInteraction[]
  tarefas: { id: string; title: string; category: string | null; dueDate: string | null; dueTime: string | null; priority: string | null }[]
}) {
  const agora = Date.now()
  const produto = usePropertiesStore(s => lead.propertyId ? s.properties.find(p => p.id === lead.propertyId)?.name : undefined)
    ?? lead.propertyName
  const diasNaEtapa = Math.floor((agora - new Date(lead.stageChangedAt ?? lead.createdAt).getTime()) / DIA_MS)
  const prazoCorrendo = slaActive(lead)
  const prazoVencido = prazoCorrendo && new Date(lead.slaDueAt!).getTime() < agora
  const prazoTexto = prazoCorrendo
    ? new Date(lead.slaDueAt!).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  const permuta = lead.permutaType === 'imovel'
    ? ['Imóvel', lead.permutaPropertyRegion, lead.permutaPropertyValue ? formatCurrency(lead.permutaPropertyValue) : null]
    : lead.permutaType === 'carro'
      ? ['Carro', lead.permutaCarModel, lead.permutaCarValue ? formatCurrency(lead.permutaCarValue) : null]
      : null

  const { getByType } = useLeadConfigStore()
  const motivos = getByType('discard_reason')

  return (
    <div className="flex flex-col gap-7">
      {/* Descartado (migração 116): o motivo e quando, como na ficha de trabalho */}
      {lead.discardReason && (
        <section className="ficha-agora" style={{ ['--tom' as string]: 'var(--error)' }}>
          <p className="text-[12.5px] font-semibold text-error">
            Descartado{lead.discardedAt ? ` em ${new Date(lead.discardedAt).toLocaleDateString('pt-BR')}` : ''}
            {' '}· parou em {STAGE_THEME[lead.funnelStage]?.columnLabel.toLowerCase() ?? lead.funnelStage}
          </p>
          <p className="text-[16px] font-semibold text-t1 mt-1">
            {motivos.find(r => r.slug === lead.discardReason)?.label ?? lead.discardReason}
          </p>
        </section>
      )}

      {/* Em que pé está: prazo de 1º contato, quando ainda corre */}
      {prazoCorrendo && (
        <p className={`flex items-center gap-2 text-[13.5px] font-semibold ${prazoVencido ? 'text-error' : 'text-warning'}`} role="status">
          <Timer size={15} strokeWidth={1.9} aria-hidden />
          {prazoVencido ? `1º contato não feito · o prazo venceu ${prazoTexto}` : `Aguardando o 1º contato · prazo até ${prazoTexto}`}
        </p>
      )}

      <FichaNumeros itens={[
        { rotulo: 'Ticket', valor: lead.averageTicket ? formatCurrency(lead.averageTicket) : '—' },
        { rotulo: 'Último contato', valor: haQuanto(lead.lastContactAt, agora) },
        lead.funnelStage === 'followup'
          ? { rotulo: 'Toques', valor: `${lead.followupStep}/${MAX_TENTATIVAS_FOLLOWUP}` }
          : { rotulo: 'Nesta etapa', valor: `${diasNaEtapa} ${diasNaEtapa === 1 ? 'dia' : 'dias'}` },
      ]} />

      {produto && (
        <FichaSecao titulo="Produto de interesse">
          <p className="text-[14.5px] text-t1">{produto}</p>
          {permuta && (
            <p className="text-[13px] text-t3 mt-1">Permuta: {permuta.filter(Boolean).join(' · ')}</p>
          )}
        </FichaSecao>
      )}

      {tarefas.length > 0 && (
        <FichaSecao titulo={`${tarefas.length === 1 ? 'Tarefa' : 'Tarefas'} em aberto`}>
          <ul className="flex flex-col">
            {tarefas.map(t => (
              <li key={t.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
                <CalendarClock size={15} strokeWidth={1.8} className="text-t4 flex-shrink-0" aria-hidden />
                <span className="flex-1 min-w-0 text-[14px] text-t1 truncate">{t.title}</span>
                <span className="text-[12.5px] text-t4 tabular-nums flex-shrink-0">{dataDaTarefa(t.dueDate, t.dueTime)}</span>
              </li>
            ))}
          </ul>
        </FichaSecao>
      )}

      {perfil && <PerfilSomenteLeitura data={perfil} />}

      <FluxosSomenteLeitura leadId={lead.id} />

      {lead.notes?.trim() && (
        <FichaSecao titulo="Anotações">
          <p className="text-[14px] text-t2 leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
        </FichaSecao>
      )}

      <FichaSecao titulo={`Histórico · ${historico.length} ${historico.length === 1 ? 'registro' : 'registros'}`}>
        <HistoricoSomenteLeitura itens={historico} />
      </FichaSecao>

      {perfil && <FormulariosPreenchidos forms={perfil.forms} />}
      {perfil && <BaseConhecida lists={perfil.lists} />}
    </div>
  )
}
