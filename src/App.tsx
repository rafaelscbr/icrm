import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useThemeStore, applyTheme } from './store/useThemeStore'
import { useAuthStore } from './store/useAuthStore'
import { Sidebar } from './components/layout/Sidebar'
import { BottomNav } from './components/layout/BottomNav'
import { GlobalSearch } from './components/shared/GlobalSearch'
import { DashboardPage } from './modules/dashboard/DashboardPage'
import { ContactsPage } from './modules/contacts/ContactsPage'
import { PropertiesPage } from './modules/properties/PropertiesPage'
import { SalesPage } from './modules/sales/SalesPage'
import { PerformancePage } from './modules/performance/PerformancePage'
import { TasksPage } from './modules/tasks/TasksPage'
import { CampaignsPage } from './modules/campaigns/CampaignsPage'
import { LeadsPage } from './modules/leads/LeadsPage'
import { PermutaPage } from './modules/permuta/PermutaPage'
import { LoginPage } from './pages/LoginPage'
import { AdminPage } from './pages/AdminPage'

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

// ── AppRoutes ────────────────────────────────────────────────────────────────
function AppRoutes() {
  const [searchOpen, setSearchOpen] = useState(false)
  const { user, isAdmin } = useAuthStore()

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

  if (!user) return <Navigate to="/login" replace />

  return (
    <>
      <div className="flex min-h-screen page-bg">
        <Sidebar />
        <main className="flex-1 overflow-auto pb-16 lg:pb-0">
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
            {isAdmin && <Route path="/admin" element={<PageWrapper><AdminPage /></PageWrapper>} />}
          </Routes>
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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<AppRoutes />} />
      </Routes>
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
