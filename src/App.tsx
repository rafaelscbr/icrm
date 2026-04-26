import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Sidebar } from './components/layout/Sidebar'
import { BottomNav } from './components/layout/BottomNav'
import { DashboardPage } from './modules/dashboard/DashboardPage'
import { ContactsPage } from './modules/contacts/ContactsPage'
import { PropertiesPage } from './modules/properties/PropertiesPage'
import { SalesPage } from './modules/sales/SalesPage'
import { PerformancePage } from './modules/performance/PerformancePage'
import { TasksPage } from './modules/tasks/TasksPage'
import { GoalsPage } from './modules/goals/GoalsPage'
import { WeekHistoryPage } from './modules/goals/WeekHistoryPage'
import { CampaignsPage } from './modules/campaigns/CampaignsPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-[#0F1117]">
        <Sidebar />
        <main className="flex-1 overflow-auto pb-16 lg:pb-0">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/contatos" element={<ContactsPage />} />
            <Route path="/imoveis" element={<PropertiesPage />} />
            <Route path="/vendas" element={<SalesPage />} />
            <Route path="/tarefas"     element={<TasksPage />} />
            <Route path="/metas"           element={<GoalsPage />} />
            <Route path="/metas/historico" element={<WeekHistoryPage />} />
            <Route path="/campanhas"   element={<CampaignsPage />} />
            <Route path="/performance" element={<PerformancePage />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1A1D27',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            fontSize: '14px',
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
