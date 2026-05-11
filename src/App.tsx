import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useThemeStore, applyTheme } from './store/useThemeStore'
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
// Lives inside BrowserRouter so it can use useLocation for the keyboard
// shortcut listener that opens GlobalSearch.
function AppRoutes() {
  const [searchOpen, setSearchOpen] = useState(false)

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

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0D1117',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            fontSize: '12px',
            padding: '8px 12px',
          },
          success: {
            iconTheme: { primary: '#22C55E', secondary: '#1A1D27' },
          },
          error: {
            iconTheme: { primary: '#EF4444', secondary: '#1A1D27' },
          },
        }}
      />
    </BrowserRouter>
  )
}
