import { useState } from 'react'
import { Calculator, Key, Building2, Users } from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Abas } from '../../components/shared/Abas'
import { useAuthStore } from '../../store/useAuthStore'
import { SimuladorModo, SharedFields } from './shared/types'
import { PosChavesSimulator } from './posChaves/Simulator'
import { DiretoSimulator } from './direto/Simulator'
import { AssociativoSimulator } from './associativo/Simulator'

// Shell do simulador: quadro comum das telas (PageLayout), seletor de modo e
// renderização do modo ativo. Cada modo vive em sua própria pasta (calc.ts +
// Simulator.tsx + Card.tsx) e compõe as peças compartilhadas de shared/. Para
// adicionar um modo novo, crie a pasta e registre a aba aqui — nada mais.
//
// Era a única tela (com Leads) fora do PageLayout: título sem ícone de área,
// padding próprio e um terceiro estilo de aba. Agora entra no quadro comum,
// e o seletor de modo usa as abas em pílula do sistema.

const MODOS: { value: SimuladorModo; label: string; icon: typeof Key }[] = [
  { value: 'pos_chaves',  label: 'Pós-chaves',                icon: Key       },
  { value: 'direto',      label: 'Direto com a construtora',  icon: Building2 },
  { value: 'associativo', label: 'Associativo',               icon: Users     },
]

export function SimuladorPage() {
  const { profile } = useAuthStore()
  const [modo, setModo] = useState<SimuladorModo>('pos_chaves')

  // Identificação e valor sobrevivem à troca de modo
  const [shared, setShared] = useState<SharedFields>({
    empreendimento: 'Porto Velas 3D',
    cliente: '',
    valorTotal: 758584.61,
  })
  const onShared = (patch: Partial<SharedFields>) => setShared(prev => ({ ...prev, ...patch }))

  return (
    <PageLayout
      icon={Calculator}
      iconTom="marca"
      title="Simulador de fluxo de pagamento"
      subtitle="Preencha os campos e baixe a proposta pronta para enviar ao cliente"
      band={
        <Abas
          abas={MODOS}
          valor={modo}
          onChange={setModo}
          rotulo="Tipo de simulação"
        />
      }
    >
      {modo === 'pos_chaves' && (
        <PosChavesSimulator shared={shared} onShared={onShared} corretor={profile?.name ?? ''} />
      )}
      {modo === 'direto' && (
        <DiretoSimulator shared={shared} onShared={onShared} corretor={profile?.name ?? ''} />
      )}
      {modo === 'associativo' && (
        <AssociativoSimulator shared={shared} onShared={onShared} corretor={profile?.name ?? ''} />
      )}
    </PageLayout>
  )
}
