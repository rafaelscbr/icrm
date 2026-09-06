/**
 * Carregadores das rotas — um lugar só para o `lazy()` do App e para a
 * pré-carga no hover do menu.
 *
 * A troca de tela tinha um custo invisível: cada rota é um chunk, e o chunk
 * só começava a baixar no clique. Passar o mouse por um item do menu é o
 * melhor sinal de "vou para lá" que existe, então o download começa ali. O
 * `lazy()` do App usa a MESMA função, logo o Vite gera um chunk só por rota
 * e a pré-carga aquece exatamente o que o clique vai pedir.
 */

export const carregadores = {
  '/':                    () => import('./modules/dashboard/DashboardPage'),
  '/contatos':            () => import('./modules/contacts/ContactsPage'),
  '/imoveis':             () => import('./modules/properties/PropertiesPage'),
  '/lancamentos':         () => import('./modules/developments/DevelopmentsPage'),
  '/vendas':              () => import('./modules/sales/SalesPage'),
  '/performance':         () => import('./modules/performance/PerformancePage'),
  '/tarefas':             () => import('./modules/tasks/TasksPage'),
  '/prospeccao/disparos': () => import('./modules/campaigns/CampaignsPage'),
  '/prospeccao/ligacoes': () => import('./modules/prospeccao/ligacoes/LigacoesPage'),
  '/leads':               () => import('./modules/leads/LeadsPage'),
  '/simulador':           () => import('./modules/simulador/SimuladorPage'),
  '/admin':               () => import('./pages/AdminPage'),
  '/metas':               () => import('./modules/goals/GoalsPage'),
  '/metas/historico':     () => import('./modules/goals/WeekHistoryPage'),
  '/notificacoes':        () => import('./pages/NotificationsPage'),
  '/escritorio':          () => import('./modules/office/VirtualOfficePage'),
  '/base-leads':          () => import('./modules/lead-lists/LeadListsPage'),
} as const

const aquecidas = new Set<string>()

/** Começa a baixar o chunk da rota. Idempotente e silencioso. */
export function prefetchRota(caminho: string) {
  const carregar = (carregadores as Record<string, (() => Promise<unknown>) | undefined>)[caminho]
  if (!carregar || aquecidas.has(caminho)) return
  aquecidas.add(caminho)
  carregar().catch(() => { aquecidas.delete(caminho) })
}
