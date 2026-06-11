import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useThemeStore, applyTheme } from './store/useThemeStore'
import { useAuthStore } from './store/useAuthStore'
import { usePresenceStore } from './store/usePresenceStore'
import { getUserLocation } from './lib/geolocation'
import { logActivity } from './lib/activityLogger'
import { Sidebar } from './components/layout/Sidebar'
import { BottomNav } from './components/layout/BottomNav'
import { GlobalSearch } from './components/shared/GlobalSearch'
import { useNotificationsStore } from './store/useNotificationsStore'
import { useTasksStore } from './store/useTasksStore'
import { useSalesStore } from './store/useSalesStore'
import { useGoalsStore } from './store/useGoalsStore'
import { useLeadInteractionsStore } from './store/useLeadInteractionsStore'
import { useLeadsStore } from './store/useLeadsStore'
import { useCampaignsStore } from './store/useCampaignsStore'
import { useCampaignLeadsStore } from './store/useCampaignLeadsStore'
import { useCampaignActivityStore } from './store/useCampaignActivityStore'
import { useContactsStore } from './store/useContactsStore'
import { supabase } from './lib/supabase'

// ── Code splitting por rota ──────────────────────────────────────────────────
// Cada página vira um chunk separado — o carregamento inicial baixa apenas a
// tela aberta, em vez do app inteiro (gráficos, xlsx, kanban etc. de uma vez).
const DashboardPage     = lazy(() => import('./modules/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const ContactsPage      = lazy(() => import('./modules/contacts/ContactsPage').then(m => ({ default: m.ContactsPage })))
const PropertiesPage    = lazy(() => import('./modules/properties/PropertiesPage').then(m => ({ default: m.PropertiesPage })))
const SalesPage         = lazy(() => import('./modules/sales/SalesPage').then(m => ({ default: m.SalesPage })))
const PerformancePage   = lazy(() => import('./modules/performance/PerformancePage').then(m => ({ default: m.PerformancePage })))
const TasksPage         = lazy(() => import('./modules/tasks/TasksPage').then(m => ({ default: m.TasksPage })))
const CampaignsPage     = lazy(() => import('./modules/campaigns/CampaignsPage').then(m => ({ default: m.CampaignsPage })))
const LeadsPage         = lazy(() => import('./modules/leads/LeadsPage').then(m => ({ default: m.LeadsPage })))
const PermutaPage       = lazy(() => import('./modules/permuta/PermutaPage').then(m => ({ default: m.PermutaPage })))
const SimuladorPage     = lazy(() => import('./modules/simulador/SimuladorPage').then(m => ({ default: m.SimuladorPage })))
const LoginPage         = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })))
const AdminPage         = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })))
const ActivityLogsPage  = lazy(() => import('./pages/ActivityLogsPage').then(m => ({ default: m.ActivityLogsPage })))
const GoalsPage         = lazy(() => import('./modules/goals/GoalsPage').then(m => ({ default: m.GoalsPage })))
const WeekHistoryPage   = lazy(() => import('./modules/goals/WeekHistoryPage').then(m => ({ default: m.WeekHistoryPage })))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const VirtualOfficePage = lazy(() => import('./modules/office/VirtualOfficePage').then(m => ({ default: m.VirtualOfficePage })))
const LeadListsPage     = lazy(() => import('./modules/lead-lists/LeadListsPage').then(m => ({ default: m.LeadListsPage })))

// Fallback exibido enquanto o chunk da rota é baixado (apenas na 1ª visita)
function RouteLoading() {
  return (
    <div className="h-full flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ── PageWrapper ──────────────────────────────────────────────────────────────
// Wraps page content in a div with the `page-fade` CSS animation class.
// Re-keyed on every route change so the animation replays on navigation.
function PageWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="page-fade h-full">
      {children}
    </div>
  )
}

// ── PresenceTracker ───────────────────────────────────────────────────────────
// Tracks current page in Supabase Realtime Presence and logs page visits.
function PresenceTracker() {
  const location = useLocation()
  const { user, profile } = useAuthStore()
  const { init, updatePage, cleanup } = usePresenceStore()

  useEffect(() => {
    if (!user || !profile) return
    getUserLocation().then(loc => {
      init(user.id, profile.name, profile.role, loc)
    })
    return () => { cleanup() }
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    updatePage(location.pathname)
    logActivity('page_visit', { path: location.pathname }, location.pathname)
  }, [location.pathname])

  return null
}

// ── AppRoutes ────────────────────────────────────────────────────────────────
function AppRoutes() {
  const [searchOpen, setSearchOpen] = useState(false)
  const { user, isAdmin } = useAuthStore()
  const { load: loadNotifications, subscribe: subscribeNotifications } = useNotificationsStore()
  const { subscribe: subscribeTasks }        = useTasksStore()
  const { subscribe: subscribeSales }        = useSalesStore()
  const { subscribe: subscribeGoals }        = useGoalsStore()
  const { subscribe: subscribeInteractions } = useLeadInteractionsStore()
  const { subscribe: subscribeLeads }        = useLeadsStore()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Inicia todas as subscriptions realtime ao autenticar
  useEffect(() => {
    if (!user) return

    // Notificações (filtradas por user_id)
    loadNotifications(user.id)
    const unsubNotifications  = subscribeNotifications(user.id)

    // Entidades operacionais — RLS garante que cada usuário vê apenas o que tem permissão
    const unsubLeads         = subscribeLeads()
    const unsubTasks         = subscribeTasks()
    const unsubSales         = subscribeSales()
    const unsubGoals         = subscribeGoals()
    const unsubInteractions  = subscribeInteractions()
    const unsubCampaigns     = useCampaignsStore.getState().subscribe()
    const unsubCampaignLeads = useCampaignLeadsStore.getState().subscribe()
    const unsubActivity      = useCampaignActivityStore.getState().subscribe()
    const unsubContacts      = useContactsStore.getState().subscribe()

    return () => {
      unsubNotifications()
      unsubLeads()
      unsubTasks()
      unsubSales()
      unsubGoals()
      unsubInteractions()
      unsubCampaigns()
      unsubCampaignLeads()
      unsubActivity()
      unsubContacts()
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ao voltar para a aba após inatividade: renova a sessão (token JWT pode ter
  // vencido), reautentica o socket realtime e reconcilia os dados com o banco.
  // Reconciliação é SILENCIOSA (sem flag de loading — a tela não pisca) e tem
  // intervalo mínimo para não refazer fetch a cada alternância rápida de aba.
  //
  // getSession() pode travar indefinidamente após a aba ficar suspensa por muito
  // tempo (lock interno do supabase-js que não é liberado) — quando isso acontece
  // NENHUMA leitura/escrita volta a funcionar até um F5. O timeout detecta o
  // travamento e recarrega a página automaticamente (no máx. 1x a cada 2 min).
  useEffect(() => {
    if (!user) return
    let lastReconcile = 0
    async function onVisible() {
      if (document.visibilityState !== 'visible') {
        // Aba oculta: pausa o timer de refresh do token (ele é throttled pelo
        // browser de qualquer forma); ao voltar, startAutoRefresh força a
        // verificação imediata do token em vez de esperar o próximo tick.
        supabase.auth.stopAutoRefresh()
        return
      }
      supabase.auth.startAutoRefresh()

      const result = await Promise.race([
        supabase.auth.getSession().then(r => r.data.session),
        new Promise<'hang'>(resolve => setTimeout(() => resolve('hang'), 8000)),
      ])

      if (result === 'hang') {
        const last = Number(sessionStorage.getItem('souza:lastForcedReload') ?? 0)
        if (Date.now() - last > 120_000) {
          sessionStorage.setItem('souza:lastForcedReload', String(Date.now()))
          console.warn('[session] getSession travado após inatividade — recarregando a página')
          window.location.reload()
        }
        return
      }

      if (result) supabase.realtime.setAuth(result.access_token)
      if (Date.now() - lastReconcile < 30_000) return
      lastReconcile = Date.now()
      useLeadsStore.getState().reload()
      if (useLeadInteractionsStore.getState().allLoaded) {
        useLeadInteractionsStore.getState().reload()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user?.id])

  if (!user) return <Navigate to="/login" replace />

  return (
    <>
      <PresenceTracker />
      <div className="flex min-h-screen page-bg">
        <Sidebar />
        <main className="flex-1 overflow-auto pb-nav-safe lg:!pb-0">
          <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<PageWrapper><DashboardPage /></PageWrapper>} />
            <Route path="/contatos" element={<PageWrapper><ContactsPage /></PageWrapper>} />
            <Route path="/imoveis" element={<PageWrapper><PropertiesPage /></PageWrapper>} />
            <Route path="/vendas" element={<PageWrapper><SalesPage /></PageWrapper>} />
            <Route path="/tarefas" element={<PageWrapper><TasksPage /></PageWrapper>} />
            <Route path="/campanhas" element={<PageWrapper><CampaignsPage /></PageWrapper>} />
            <Route path="/leads" element={<PageWrapper><LeadsPage /></PageWrapper>} />
            <Route path="/performance" element={<PageWrapper><PerformancePage /></PageWrapper>} />
            <Route path="/permuta" element={<PageWrapper><PermutaPage /></PageWrapper>} />
            <Route path="/simulador" element={<PageWrapper><SimuladorPage /></PageWrapper>} />
            <Route path="/metas" element={<PageWrapper><GoalsPage /></PageWrapper>} />
            <Route path="/metas/historico" element={<PageWrapper><WeekHistoryPage /></PageWrapper>} />
            <Route path="/notificacoes" element={<PageWrapper><NotificationsPage /></PageWrapper>} />
            <Route path="/escritorio"  element={<PageWrapper><VirtualOfficePage /></PageWrapper>} />
            <Route path="/base-leads" element={<PageWrapper><LeadListsPage /></PageWrapper>} />
            {isAdmin && <Route path="/admin" element={<PageWrapper><AdminPage /></PageWrapper>} />}
            {isAdmin && <Route path="/admin/logs" element={<PageWrapper><ActivityLogsPage /></PageWrapper>} />}
          </Routes>
          </Suspense>
        </main>
        <BottomNav />
      </div>

      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { theme } = useThemeStore()
  const { init, loading } = useAuthStore()

  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => { init() }, [init])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--page-bg)' }}>
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--page-bg)' }}>
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<AppRoutes />} />
        </Routes>
      </Suspense>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--t1)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            fontSize: '13px',
            padding: '10px 14px',
            boxShadow: 'var(--shadow-dropdown)',
          },
          success: {
            iconTheme: { primary: 'var(--success)', secondary: 'var(--surface)' },
          },
          error: {
            iconTheme: { primary: 'var(--error)', secondary: 'var(--surface)' },
          },
        }}
      />
    </BrowserRouter>
  )
}
