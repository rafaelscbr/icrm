import { ChecklistItem } from '../types'

const KEY = 'task_checklists'
type ChecklistMap = Record<string, ChecklistItem[]>

// Mantido apenas para migração de dados antigos — banco é a fonte de verdade.
export function loadChecklists(): ChecklistMap {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

export function removeChecklist(taskId: string) {
  try {
    const map = loadChecklists()
    delete map[taskId]
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch { /* ignore */ }
}
