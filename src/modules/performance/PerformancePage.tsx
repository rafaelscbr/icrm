import { useState, lazy, Suspense } from 'react'
import { Users, Megaphone, TrendingUp, BarChart3} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Abas } from '../../components/shared/Abas'
import { BrokersTab } from './BrokersTab'
import { CampaignsBaseTab } from './CampaignsBaseTab'
// Aba com gráfico: o ECharts só baixa quando a aba abre, não junto com a tela.
const SalesTab = lazy(() => import('./SalesTab').then(m => ({ default: m.SalesTab })))

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
      icon={BarChart3}
      iconTom="info"
      title="Análise *Comercial*"
      subtitle="Performance de corretores, campanhas e vendas"
      band={
        <Abas
          abas={TABS.map(t => ({ value: t.id, label: t.label, icon: t.icon }))}
          valor={tab}
          onChange={setTab}
          rotulo="Seções da análise"
        />
      }
    >
      {tab === 'corretores' && <BrokersTab />}
      {tab === 'campanhas'  && <CampaignsBaseTab />}
      {tab === 'vendas'     && <Suspense fallback={<div className="h-64 rounded-[18px] shimmer" aria-hidden />}><SalesTab /></Suspense>}
    </PageLayout>
  )
}
