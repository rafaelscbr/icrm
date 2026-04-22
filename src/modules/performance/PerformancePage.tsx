import { useState } from 'react'
import { Activity, BarChart3 } from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { DailyProductivityTab } from './DailyProductivityTab'
import { ReportsTab } from './ReportsTab'

type Tab = 'produtividade' | 'relatorios'

const TABS: { value: Tab; label: string; icon: typeof Activity }[] = [
  { value: 'produtividade', label: 'Produtividade Diária', icon: Activity  },
  { value: 'relatorios',    label: 'Relatórios',           icon: BarChart3 },
]

export function PerformancePage() {
  const [tab, setTab] = useState<Tab>('produtividade')

  return (
    <PageLayout
      title="Performance"
      subtitle={tab === 'produtividade' ? 'Registre e acompanhe sua produtividade diária' : 'Visão geral do seu desempenho'}
    >
      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-150 cursor-pointer
              ${tab === value
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300 hover:bg-white/8'
              }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'produtividade' && <DailyProductivityTab />}
      {tab === 'relatorios'    && <ReportsTab />}
    </PageLayout>
  )
}
