import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Siren, Flame, Phone, CalendarCheck, Snowflake, Bell, Sparkles, ArrowRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { IconeTom, Rotulo } from '../../components/shared/visual'
import type { Tom } from '../../components/shared/visual'
import { useCallQueueStore } from '../../store/useCallQueueStore'
import { useUnreadCount } from '../../store/useNotificationsStore'
import { DAILY_TARGETS } from '../../lib/metasConfig'
import type { Lead, Task } from '../../types'

/**
 * Próxima melhor ação.
 *
 * O Dashboard já sabia de tudo — SLA estourado, tarefa vencida, visita amanhã,
 * meta do dia, lead esfriando, avisos por ler — mas espalhado em oito cards e
 * uma lista. Aqui ele diz UMA coisa: o que fazer agora, por que, e o botão que
 * faz. As outras sugestões ficam ao lado, em chips, na ordem de urgência.
 *
 * Regras que mantêm isso honesto:
 * - só sugere o que o sistema observou (contadores do banco e dos stores);
 * - o "porquê" é a regra da casa escrita, não opinião;
 * - sem pendência, sugere prospectar — vazio nunca é silêncio.
 */

interface Sugestao {
  id: string
  tom: Tom
  icon: LucideIcon
  titulo: string
  porque: string
  acao: string
  run: () => void
}

const DIA_MS = 86_400_000

function dataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ProximaAcao({
  leads, tasks, slaEstourado, tarefasVencidas, brokerId, loading, onAbrirLead,
}: {
  /** leads ativos já recortados pela visão */
  leads: Lead[]
  /** tarefas pendentes já recortadas pela visão */
  tasks: Task[]
  slaEstourado: number
  tarefasVencidas: number
  /** corretor em foco; null na Visão Global (metas diárias são por pessoa) */
  brokerId: string | null
  loading: boolean
  onAbrirLead: (lead: Lead) => void
}) {
  const navigate = useNavigate()
  const contarLigacoes = useCallQueueStore(s => s.contarLigacoes)
  const avisos = useUnreadCount()
  const [ligacoesHoje, setLigacoesHoje] = useState<number | null>(null)

  useEffect(() => {
    if (!brokerId) { setLigacoesHoje(null); return }
    let vivo = true
    contarLigacoes(brokerId)
      .then(c => { if (vivo) setLigacoesHoje(c.hoje) })
      .catch(() => { if (vivo) setLigacoesHoje(null) })
    return () => { vivo = false }
  }, [brokerId, contarLigacoes])

  const sugestoes = useMemo<Sugestao[]>(() => {
    const out: Sugestao[] = []
    const agora = Date.now()
    const amanha = dataLocal(new Date(agora + DIA_MS))

    const comSla = leads.filter(l => l.slaDueAt && !l.firstContactAt && new Date(l.slaDueAt).getTime() < agora)
    const nSla = Math.max(slaEstourado, comSla.length)
    if (nSla > 0) {
      out.push({
        id: 'sla', tom: 'risco', icon: Siren,
        titulo: `${nSla} lead${nSla !== 1 ? 's' : ''} com SLA de 1º contato estourado`,
        porque: 'O Meta Ads cobra o primeiro contato em 5 minutos úteis. Cada hora a mais derruba a taxa de resposta, e o lead volta para o rodízio.',
        acao: comSla[0] ? 'Abrir o mais antigo' : 'Abrir o funil',
        run: () => comSla[0] ? onAbrirLead(comSla[0]) : navigate('/leads'),
      })
    }

    if (tarefasVencidas > 0) {
      out.push({
        id: 'vencidas', tom: 'risco', icon: Flame,
        titulo: `${tarefasVencidas} tarefa${tarefasVencidas !== 1 ? 's' : ''} vencida${tarefasVencidas !== 1 ? 's' : ''}`,
        porque: 'Tarefa vencida é um compromisso que o cliente lembra e o sistema já não cobra. Resolver ou reagendar hoje limpa a lista de amanhã.',
        acao: 'Ver as atrasadas',
        run: () => navigate('/tarefas?foco=overdue'),
      })
    }

    const visitasAmanha = tasks.filter(t => t.category === 'visita' && t.dueDate === amanha)
    if (visitasAmanha.length > 0) {
      const n = visitasAmanha.length
      out.push({
        id: 'visitas', tom: 'atencao', icon: CalendarCheck,
        titulo: `${n} visita${n !== 1 ? 's' : ''} amanhã`,
        porque: 'Visita confirmada na véspera é visita que acontece. A confirmação de hoje evita o buraco na agenda de amanhã.',
        acao: 'Confirmar com o cliente',
        run: () => navigate('/tarefas?foco=upcoming'),
      })
    }

    if (brokerId && ligacoesHoje !== null && ligacoesHoje < DAILY_TARGETS.ligacoes) {
      const faltam = DAILY_TARGETS.ligacoes - ligacoesHoje
      out.push({
        id: 'ligacoes', tom: 'marca', icon: Phone,
        titulo: `Faltam ${faltam} tentativa${faltam !== 1 ? 's' : ''} para a meta do dia`,
        porque: `${DAILY_TARGETS.ligacoes} tentativas por dia é o mínimo combinado da casa. A fila entrega o próximo contato pronto — é mais rápido que qualquer lembrete.`,
        acao: 'Abrir a fila',
        run: () => navigate('/prospeccao/ligacoes'),
      })
    }

    const esfriando = leads.filter(l => {
      if (l.funnelStage !== 'atendimento' && l.funnelStage !== 'visita') return false
      const ref = l.stageChangedAt ?? l.createdAt
      return ref ? (agora - new Date(ref).getTime()) / DIA_MS >= 4 : false
    })
    if (esfriando.length > 0) {
      const n = esfriando.length
      out.push({
        id: 'esfriando', tom: 'info', icon: Snowflake,
        titulo: `${n} lead${n !== 1 ? 's' : ''} em atendimento parado${n !== 1 ? 's' : ''} há 4 dias ou mais`,
        porque: 'Quem chegou a Atendimento já respondeu uma vez. É o lead mais barato de reaquecer — e o que mais se perde por esquecimento.',
        acao: 'Dar sequência',
        run: () => navigate('/leads?etapa=atendimento'),
      })
    }

    if (avisos > 0) {
      out.push({
        id: 'avisos', tom: 'info', icon: Bell,
        titulo: `${avisos} assunto${avisos !== 1 ? 's' : ''} nas notificações`,
        porque: 'Lead transferido, tarefa delegada e cliente que voltou chegam por aqui. Um assunto pode ser vinte leads esperando.',
        acao: 'Ver avisos',
        run: () => navigate('/notificacoes'),
      })
    }

    if (out.length === 0) {
      out.push({
        id: 'prospectar', tom: 'sucesso', icon: Sparkles,
        titulo: 'Tudo em dia',
        porque: 'Sem SLA vencido, tarefa atrasada ou visita pendente. É o melhor momento para alimentar o topo do funil.',
        acao: 'Abrir a fila de ligações',
        run: () => navigate('/prospeccao/ligacoes'),
      })
    }
    return out
  }, [leads, tasks, slaEstourado, tarefasVencidas, brokerId, ligacoesHoje, avisos, navigate, onAbrirLead])

  if (loading) return null

  const [principal, ...outras] = sugestoes
  const critica = principal.tom === 'risco'

  return (
    <section
      aria-label="Próxima melhor ação"
      className={`entrada relative overflow-hidden rounded-[16px] border surface-premium px-5 py-4 mb-8
                  flex flex-col gap-3 ${critica ? 'border-error-line atencao-pulse' : 'border-line'}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center gap-2">
        <span className={`w-1 h-3.5 rounded-full ${critica ? 'bg-error' : 'bg-brand'}`} aria-hidden />
        <Sparkles size={13} strokeWidth={1.7} className="text-t3" aria-hidden />
        <Rotulo>Próxima melhor ação</Rotulo>
        {outras.length > 0 && (
          <span className="ml-auto text-[11px] text-t4 tabular-nums">
            +{outras.length} sugest{outras.length !== 1 ? 'ões' : 'ão'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <IconeTom icon={principal.icon} tom={principal.tom} tamanho="lg" />
        <div className="flex-1 min-w-[240px]">
          <p className="font-heading text-[17px] font-extrabold text-t1 leading-tight tracking-[-0.01em]">
            {principal.titulo}
          </p>
          <p className="text-[13px] text-t3 mt-1 max-w-[62ch]">{principal.porque}</p>
        </div>
        <button
          onClick={principal.run}
          className="flex items-center gap-2 rounded-[12px] px-4 py-2.5 min-h-[42px] shrink-0
                     grad-brand font-heading text-[13px] font-bold transition-transform
                     active:scale-[0.98] cursor-pointer hover:brightness-105
                     focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          {principal.acao} <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      {outras.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-line">
          {outras.map(s => (
            <button
              key={s.id}
              onClick={s.run}
              title={s.porque}
              className="flex items-center gap-1.5 rounded-full border border-line bg-s2/50 px-3 py-1.5
                         text-[12px] font-medium text-t2 hover:text-t1 hover:border-line-strong hover:bg-s2
                         transition-colors cursor-pointer
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <s.icon size={12} strokeWidth={1.8} aria-hidden className="text-t3" />
              {s.titulo}
              <ArrowRight size={11} strokeWidth={2} aria-hidden className="text-t4" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
