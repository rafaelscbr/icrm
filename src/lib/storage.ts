export function storageGet<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

export function storageSet<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

export const KEYS = {
  contacts:   'icrm_contacts',
  properties: 'icrm_properties',
  sales:      'icrm_sales',
  tasks:      'icrm_tasks',
  goals:      'icrm_goals',
  dailyLogs:     'icrm_daily_logs',
  campaigns:     'icrm_campaigns',
  campaignLeads: 'icrm_campaign_leads',
} as const
