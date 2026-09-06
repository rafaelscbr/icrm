import { create } from 'zustand'
import { WeekSnapshot, WeekSnapshotEntry, Goal, Task, Sale } from '../types'
import { calcProgressForRange } from './useGoalsStore'
import { db } from '../lib/db'
import { getCurrentUserId } from '../lib/auth'
import { mensagemDeErro } from '../lib/erros'

function localFmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Semana = Domingo → Sábado (America/Sao_Paulo)
function getWeekStartOf(d: Date): Date {
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())   // domingo (getDay 0) = início
  start.setHours(0, 0, 0, 0)
  return start
}

function getWeekEndOf(start: Date): Date {
  const end = new Date(start)
  end.setDate(start.getDate() + 6)          // sábado = fim
  return end
}

function computeScore(entries: WeekSnapshotEntry[]): number {
  if (entries.length === 0) return 0
  const sum = entries.reduce(
    (acc, e) => acc + Math.min(1, e.target > 0 ? e.achieved / e.target : 0),
    0
  )
  return Math.round((sum / entries.length) * 100)
}

export type WeekSnapshotDeCorretor = WeekSnapshot & { brokerId: string }

interface WeekSnapshotStore {
  snapshots: WeekSnapshot[]
  /** Histórico de TODOS os corretores — só a Visão Global do admin lê isto. */
  snapshotsTodos: WeekSnapshotDeCorretor[]
  loading:   boolean
  /** mensagem da última falha de leitura; null quando deu certo */
  erro:      string | null
  // Carrega histórico do banco para o usuário atual
  load:         (brokerId?: string) => Promise<void>
  // Carrega o histórico de todos os corretores (admin, Visão Global)
  loadTodos:    () => Promise<void>
  // Verifica semanas passadas e salva no banco se ainda não estiverem registradas
  checkAndSave: (tasks: Task[], sales: Sale[], goals: Goal[]) => Promise<void>
}

// Evita duas gravações simultâneas do mesmo lote: o efeito que chama
// checkAndSave dispara a cada mudança de tarefas, vendas ou metas, e duas
// rodadas em paralelo apareciam como semanas duplicadas na tela.
let salvando = false

export const useWeekSnapshotStore = create<WeekSnapshotStore>((set, get) => ({
  snapshots: [],
  snapshotsTodos: [],
  loading:   false,
  erro:      null,

  load: async (brokerId?: string) => {
    const id = brokerId ?? getCurrentUserId()
    if (!id) return
    set({ loading: true, erro: null })
    try {
      const snapshots = await db.weekSnapshots.fetchForBroker(id)
      set({ snapshots })
    } catch (err) {
      console.error('[weekSnapshots] load:', err)
      set({ erro: mensagemDeErro(err) })
    } finally {
      set({ loading: false })
    }
  },

  loadTodos: async () => {
    set({ loading: true, erro: null })
    try {
      const todos = await db.weekSnapshots.fetchForAdmin()
      set({ snapshotsTodos: todos })
    } catch (err) {
      console.error('[weekSnapshots] loadTodos:', err)
      set({ erro: mensagemDeErro(err) })
    } finally {
      set({ loading: false })
    }
  },

  checkAndSave: async (tasksTodas, salesTodas, goalsTodas) => {
    const brokerId = getCurrentUserId()
    if (!brokerId || salvando) return

    // O snapshot é do usuário logado, então só entram as metas, tarefas e
    // vendas DELE. Na Visão Global a página passa tudo de todo mundo, e sem
    // este recorte o histórico do admin registrava as metas dos corretores
    // como se fossem suas — semanas com dez linhas repetidas e progresso
    // somado da equipe inteira.
    const goals = goalsTodas.filter(g => !g.brokerId || g.brokerId === brokerId)
    const tasks = tasksTodas.filter(t => !t.brokerId || t.brokerId === brokerId)
    const sales = salesTodas.filter(s => !s.brokerId || s.brokerId === brokerId)

    // Acionamento fica fora do snapshot: o realizado vem de disparo_logs e não é
    // reconstituível retroativamente a partir de tasks/sales — gravaria 0 errado.
    const weeklyGoals = goals.filter(g => g.active && g.period === 'weekly' && g.category !== 'acionamento')
    if (weeklyGoals.length === 0) return

    // Find earliest date in the dataset so we don't snapshot empty pre-app weeks
    const allDates = [
      ...tasks.map(t => (t.dueDate || t.createdAt).split('T')[0]),
      ...sales.map(s => s.date),
    ].filter(Boolean).sort()
    const firstDate = allDates[0]
    if (!firstDate) return

    const existing = new Set(get().snapshots.map(s => s.id))
    const now = new Date()
    const thisWeekStart = getWeekStartOf(now)
    const newSnapshots: WeekSnapshot[] = []

    // Check up to 52 past weeks (never the current week)
    for (let i = 1; i <= 52; i++) {
      const weekStartDate = new Date(thisWeekStart)
      weekStartDate.setDate(thisWeekStart.getDate() - i * 7)
      const weekStart = localFmt(weekStartDate)

      // Skip weeks before the first recorded activity
      if (weekStart < firstDate.substring(0, 10)) break

      // ID is weekStart + brokerId for uniqueness across brokers
      const snapId = weekStart
      if (existing.has(snapId)) continue

      const weekEnd = localFmt(getWeekEndOf(weekStartDate))

      const entries: WeekSnapshotEntry[] = weeklyGoals.map(goal => ({
        goalId:   goal.id,
        goalName: goal.name,
        category: goal.category,
        target:   goal.target,
        achieved: calcProgressForRange(goal, tasks, sales, weekStart, weekEnd),
      }))

      newSnapshots.push({
        id:       snapId,
        weekStart,
        weekEnd,
        entries,
        score:    computeScore(entries),
        savedAt:  now.toISOString(),
      })
    }

    if (newSnapshots.length === 0) return

    // Persiste no banco e só então atualiza o store — o banco é a fonte.
    salvando = true
    try {
      await Promise.all(
        newSnapshots.map(snap =>
          db.weekSnapshots.upsert(snap, brokerId).catch(err =>
            console.error('[weekSnapshots] checkAndSave upsert:', err)
          )
        )
      )
      set(s => {
        const porSemana = new Map(s.snapshots.map(x => [x.weekStart, x]))
        for (const snap of newSnapshots) if (!porSemana.has(snap.weekStart)) porSemana.set(snap.weekStart, snap)
        return {
          snapshots: [...porSemana.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
        }
      })
    } finally {
      salvando = false
    }
  },
}))
