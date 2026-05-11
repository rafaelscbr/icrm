import { PageLayout } from '../../components/layout/PageLayout'
import { ReportsTab } from './ReportsTab'

export function PerformancePage() {
  return (
    <PageLayout
      title="Performance"
      subtitle="Visão geral do seu desempenho"
    >
      <ReportsTab />
    </PageLayout>
  )
}
