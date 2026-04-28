import { ChecklistItem } from '../types'

const KEY = 'task_checklists'

type ChecklistMap = Record<string, ChecklistItem[]>

export function loadChecklists(): ChecklistMap {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

export function saveChecklist(taskId: string, items: ChecklistItem[]) {
  const map = loadChecklists()
  if (items.length === 0) { delete map[taskId] } else { map[taskId] = items }
  localStorage.setItem(KEY, JSON.stringify(map))
}

export function removeChecklist(taskId: string) {
  const map = loadChecklists()
  delete map[taskId]
  localStorage.setItem(KEY, JSON.stringify(map))
}
