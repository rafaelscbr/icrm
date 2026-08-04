import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, BellRing, ClipboardList, UserPlus, RefreshCw, CheckCheck, ArrowRight, BellOff,
  BadgeCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { enablePush, pushPermission } from '../lib/push'
import { PageLayout } from '../components/layout/PageLayout'
import { Abas } from '../components/shared/Abas'
import { EstadoTela } from '../components/shared/EstadoTela'
import { IconeTom, Rotulo, Chip } from '../components/shared/visual'
import { Button } from '../components/ui/Button'
import { useNotificationsStore } from '../store/useNotificationsStore'
import { useAuthStore } from '../store/useAuthStore'
import { AppNotification } from '../types'

/**
 * Notificações.
 *
 * A tela estava fora da linguagem do sistema por um motivo concreto, não de
 * gosto: usava `slate-*` cravado no lugar dos tokens de tema. Medido no
 * navegador, **23 textos ficavam abaixo de 4,5:1 no tema escuro** — "3min
 * atrás" e a data em 2,03:1, os separadores em 1,48:1. No claro, `text-brand`
 * puro sobre branco dava 1,96:1 no "Abrir lead". Cor fixa não tem como servir
 * aos dois temas; é o mesmo defeito de "claro não é escuro invertido".
 *
 * O outro problema era de leitura: lida e não lida tinham o mesmo peso. Todas
 * as linhas vinham com fundo azulado, então nada saltava. Agora a não lida
 * carrega superfície, filete e ouro; a lida recolhe para linha rasa. É o que a
 * tela existe para responder — o que ainda me espera.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  <  1) return 'agora mesmo'
  if (mins  < 60) return `${mins}min atrás`
  if (hours < 24) return `${hours}h atrás`
  if (days  <  7) return `${days}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: days > 365 ? 'numeric' : undefined })
}

/** data por extenso — vai no `title`, não ocupa espaço na linha */
function dataCompleta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  const today     = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const notifDay  = new Date(d); notifDay.setHours(0,0,0,0)

  if (notifDay.getTime() === today.getTime())     return 'Hoje'
  if (notifDay.getTime() === yesterday.getTime()) return 'Ontem'

  const diffDays = Math.floor((today.getTime() - notifDay.getTime()) / 86400000)
  if (diffDays < 7) return 'Esta semana'
  if (diffDays < 30) return 'Este mês'
  return 'Mais antigas'
}

const GROUP_ORDER = ['Hoje', 'Ontem', 'Esta semana', 'Este mês', 'Mais antigas']

function groupNotifications(notifications: AppNotification[]) {
  const groups: Record<string, AppNotification[]> = {}
  for (const n of notifications) {
    const label = dateLabel(n.createdAt)
    if (!groups[label]) groups[label] = []
    groups[label].push(n)
  }
  return GROUP_ORDER.filter(g => groups[g]).map(g => ({ label: g, items: groups[g] }))
}

/** o que a notificação é, em ícone e tom — cada tipo tem o seu lugar */
function aparencia(n: AppNotification) {
  if (n.type === 'lead_assigned')         return { icon: UserPlus,      tom: 'marca'   as const, acao: 'Abrir lead'   }
  if (n.type === 'lead_recaptured')       return { icon: RefreshCw,     tom: 'info'    as const, acao: 'Abrir lead'   }
  // Voltou por conta própria: azul, o mesmo tom do "reaquecendo" no funil.
  if (n.type === 'lead_reentry')          return { icon: RefreshCw,     tom: 'info'    as const, acao: 'Abrir lead'   }
  if (n.type === 'lead_returning_client') return { icon: BadgeCheck,    tom: 'info'    as const, acao: 'Abrir lead'   }
  return                                         { icon: ClipboardList, tom: 'atencao' as const, acao: 'Abrir tarefa' }
}

// ─── Linha ───────────────────────────────────────────────────────────────────

function NotificationItem({
  n, onRead,
}: { n: AppNotification; onRead: (id: string) => void }) {
  const navigate = useNavigate()
  const { icon, tom, acao } = aparencia(n)
  const naoLida = !n.read
  const temDestino = n.resourceType === 'task' || n.resourceType === 'lead'

  function handleClick() {
    if (naoLida) onRead(n.id)
    if (n.resourceType === 'task') navigate('/tarefas')
    // Direto no card — ver comentário em NotificationsPopover.
    if (n.resourceType === 'lead') navigate(n.resourceId ? `/leads?lead=${n.resourceId}` : '/leads')
  }

  return (
    <button
      onClick={handleClick}
      className={`group relative w-full text-left flex items-start gap-4 rounded-[14px] px-4 py-4 min-h-[44px]
                  border transition-all cursor-pointer overflow-hidden
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
        ${naoLida
          ? 'surface-premium border-line shadow-card hover:brightness-105'
          : 'bg-transparent border-transparent hover:bg-s2/60'}`}
    >
      {/* Filete: o sinal de "ainda te espera". Barato de ver de canto de olho. */}
      {naoLida && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full grad-brand" aria-hidden />}

      <IconeTom icon={icon} tom={naoLida ? tom : 'neutro'} tamanho="md" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm leading-snug ${naoLida ? 'font-bold text-t1' : 'font-medium text-t3'}`}>
            {n.title}
          </p>
          {naoLida && (
            <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" aria-label="Não lida" />
          )}
        </div>

        {n.body && (
          <p className={`text-[13px] mt-0.5 truncate ${naoLida ? 'text-t2' : 'text-t4'}`}>
            {n.body}
          </p>
        )}

        <div className="flex items-center gap-2 mt-2">
          {/* A data por extenso saiu da linha e foi para o `title`: aparecia
              duas vezes (relativa e absoluta) e roubava a atenção do que
              importa, que é o assunto. */}
          <span className="font-label text-[11px] text-t4 tabular-nums" title={dataCompleta(n.createdAt)}>
            {timeAgo(n.createdAt)}
          </span>
          {temDestino && (
            <span className={`flex items-center gap-1 font-label text-[11px] font-bold uppercase tracking-[0.08em]
                              transition-colors ${naoLida ? 'text-brand-text' : 'text-t4'} group-hover:text-brand-text`}>
              {acao} <ArrowRight size={11} strokeWidth={2} aria-hidden />
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

type Filtro = 'all' | 'unread'

export function NotificationsPage() {
  const { user } = useAuthStore()
  const { notifications, loading, erro, load, markRead, markAllRead } = useNotificationsStore()
  const [filtro, setFiltro] = useState<Filtro>('all')
  const [pushState, setPushState] = useState<NotificationPermission | 'unsupported'>(pushPermission())
  const [enabling,  setEnabling]  = useState(false)

  async function handleEnablePush() {
    if (!user) return
    setEnabling(true)
    const result = await enablePush(user.id)
    setEnabling(false)
    setPushState(pushPermission())
    if (result === 'ok')          toast.success('Notificações ativadas neste dispositivo')
    else if (result === 'denied') toast.error('Permissão negada — habilite nas configurações do navegador')
    else if (result === 'error')  toast.error('Não foi possível ativar — tente novamente')
  }

  const unreadCount = notifications.filter(n => !n.read).length
  const filtered = filtro === 'unread' ? notifications.filter(n => !n.read) : notifications
  const groups = groupNotifications(filtered)

  function handleMarkAll() {
    if (user) markAllRead(user.id)
  }

  return (
    <PageLayout
      icon={Bell}
      iconTom={unreadCount > 0 ? 'marca' : 'neutro'}
      title="Notificações"
      subtitle={erro
        ? 'não foi possível ler as notificações'
        : unreadCount > 0
          ? `${unreadCount} esperando você`
          : 'tudo lido'}
      band={
        <Abas
          abas={[
            { value: 'all'    as Filtro, label: 'Todas',     badge: erro ? undefined : notifications.length },
            { value: 'unread' as Filtro, label: 'Não lidas', badge: erro ? undefined : unreadCount },
          ]}
          valor={filtro}
          onChange={setFiltro}
          rotulo="Filtro de notificações"
          fim={
            unreadCount > 0 ? (
              <Button variant="secondary" onClick={handleMarkAll} className="gap-2 !text-xs">
                <CheckCheck size={13} /> Marcar tudo como lido
              </Button>
            ) : undefined
          }
        />
      }
    >
      {/* Estado do push no dispositivo — informação de configuração, não a
          matéria da tela. Fica em faixa discreta: o ouro é para o que exige
          ação, e ativar push não é o trabalho do dia. */}
      <div className="mb-5">
        {pushState === 'default' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-s2/50 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <IconeTom icon={BellRing} tom="info" tamanho="sm" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-t2">Avisos neste dispositivo estão desligados</p>
                <p className="text-xs text-t4">Sem isso, você só vê o que aconteceu ao abrir o sistema.</p>
              </div>
            </div>
            <Button variant="secondary" onClick={handleEnablePush} disabled={enabling} className="gap-2 !text-xs">
              <BellRing size={13} /> {enabling ? 'Ativando…' : 'Ativar'}
            </Button>
          </div>
        )}
        {pushState === 'granted' && (
          <Chip icon={BellRing} tom="sucesso">Avisos ativos neste dispositivo</Chip>
        )}
        {pushState === 'denied' && (
          <div className="flex items-center gap-3 rounded-[14px] border border-warning-line bg-warning-bg px-4 py-3">
            <IconeTom icon={BellOff} tom="atencao" tamanho="sm" />
            <div>
              <p className="text-[13px] font-semibold text-warning">Avisos bloqueados pelo navegador</p>
              <p className="text-xs text-t3">
                O bloqueio é do navegador, não do sistema — libere nas configurações do site para voltar a receber.
              </p>
            </div>
          </div>
        )}
      </div>

      <EstadoTela
        carregando={loading && notifications.length === 0}
        erro={erro}
        vazio={groups.length === 0}
        onTentarDeNovo={() => { if (user) void load(user.id) }}
        icone={Bell}
        titulo={filtro === 'unread' ? 'Nada esperando você' : 'Nenhuma notificação ainda'}
        descricao={filtro === 'unread'
          ? 'Tudo que chegou já foi lido.'
          : 'Tarefas delegadas, leads atribuídos e reentradas no funil aparecem aqui.'}
      >
        <div className="flex flex-col gap-6">
          {groups.map(group => {
            const naoLidasNoGrupo = group.items.filter(n => !n.read).length
            return (
              <section key={group.label}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Rotulo>{group.label}</Rotulo>
                  <span className="h-px flex-1 bg-line" aria-hidden />
                  {naoLidasNoGrupo > 0 && (
                    <span className="font-label text-[11px] font-bold text-brand-text tabular-nums">
                      {naoLidasNoGrupo} não {naoLidasNoGrupo === 1 ? 'lida' : 'lidas'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {group.items.map(n => (
                    <NotificationItem key={n.id} n={n} onRead={markRead} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </EstadoTela>
    </PageLayout>
  )
}
