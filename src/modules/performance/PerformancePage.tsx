import { useState } from 'react'
import { Users, Megaphone, TrendingUp } from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { BrokersTab } from './BrokersTab'
import { CampaignsBaseTab } from './CampaignsBaseTab'
import { SalesTab } from './SalesTab'

type Tab = 'corretores' | 'campanhas' | 'vendas'

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'corretores', label: 'Corretores',       icon: Users     },
  { id: 'campanhas',  label: 'Campanhas & Base',  icon: Megaphone },
  { id: 'vendas',     label: 'Vendas',            icon: TrendingUp },
]

export function PerformancePage() {
  const [tab, setTab] = useState<Tab>('corretores')

  return (
    <PageLayout
      title="Análise Comercial"
      subtitle="Performance de corretores, campanhas e vendas"
    >
      {/* Tab bar */}
      <div className="flex gap-0 mb-8 border-b border-line">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold border-b-2 -mb-px transition-all cursor-pointer
              ${tab === id
                ? 'border-brand text-t1'
                : 'border-transparent text-t3 hover:text-t2 hover:border-line-strong'
              }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'corretores' && <BrokersTab />}
      {tab === 'campanhas'  && <CampaignsBaseTab />}
      {tab === 'vendas'     && <SalesTab />}
    </PageLayout>
  )
}
