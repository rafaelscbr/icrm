import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calculator, Key, Building2, Users } from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Abas } from '../../components/shared/Abas'
import { useAuthStore } from '../../store/useAuthStore'
import { SimuladorModo, SharedFields } from './shared/types'
import { PosChavesSimulator } from './posChaves/Simulator'
import { DiretoSimulator } from './direto/Simulator'
import { AssociativoSimulator } from './associativo/Simulator'
import { SimuladorFinanciamento } from './financiamento/SimuladorFinanciamento'
import { TrocaDeSimulador, TelaDoSimulador } from './financiamento/TrocaDeSimulador'
import type { RepasseDoFluxo } from './financiamento/estado'
import type { RelatoDoSimulador } from './shared/fluxo'

// Shell do simulador: quadro comum das telas (PageLayout), seletor de modo e
// renderização do modo ativo. Cada modo vive em sua própria pasta (calc.ts +
// Simulator.tsx + Card.tsx + mensagem.ts) e compõe as peças compartilhadas de
// shared/. Para adicionar um modo novo, crie a pasta e registre a aba aqui —
// nada mais.
//
// Era a única tela (com Leads) fora do PageLayout: título sem ícone de área,
// padding próprio e um terceiro estilo de aba. Agora entra no quadro comum,
// e o seletor de modo usa as abas em pílula do sistema.
//
// 24/11/2026: são DOIS simuladores, em telas separadas — Simulador de fluxo e
// Simulador de financiamento — trocados no topo. O Rafael achou confuso os dois
// lado a lado. Os dois ficam montados (só um à vista) para nada se perder na
// troca, e o de financiamento continua puxando os dados do fluxo.

const MODOS: { value: SimuladorModo; label: string; icon: typeof Key }[] = [
  { value: 'pos_chaves',  label: 'Pós-chaves',                icon: Key       },
  { value: 'direto',      label: 'Direto com a construtora',  icon: Building2 },
  { value: 'associativo', label: 'Associativo',               icon: Users     },
]

export function SimuladorPage() {
  const { profile } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const tela: TelaDoSimulador = params.get('tela') === 'financiamento' ? 'financiamento' : 'fluxo'
  const trocarTela = (t: TelaDoSimulador) => setParams(t === 'financiamento' ? { tela: t } : {}, { replace: true })
  // Monta o financiamento na primeira vez que ele é aberto; depois fica montado
  // (escondido) para não perder o que foi preenchido.
  const [abriuFinanciamento, setAbriuFinanciamento] = useState(tela === 'financiamento')
  useEffect(() => { if (tela === 'financiamento') setAbriuFinanciamento(true) }, [tela])
  const [modo, setModo] = useState<SimuladorModo>('pos_chaves')

  // Identificação e valor sobrevivem à troca de modo. Tudo começa vazio: o
  // corretor preenche com os dados do produto que está simulando.
  const [shared, setShared] = useState<SharedFields>({
    empreendimento: '',
    cliente: '',
    telefone: '',
    valorTotal: 0,
  })
  const onShared = (patch: Partial<SharedFields>) => setShared(prev => ({ ...prev, ...patch }))

  // O Simulador de financiamento só LÊ o que o modo ativo do fluxo relata.
  const [repasse, setRepasse] = useState<RepasseDoFluxo | null | undefined>(undefined)
  const aoRelatar = useCallback((r: RelatoDoSimulador<unknown>) => setRepasse(r.repasse), [])

  const corretor = profile?.name ?? ''

  return (
    <PageLayout
      icon={Calculator}
      iconTom="marca"
      title={tela === 'fluxo' ? 'Simulador de *fluxo*' : 'Simulador de *financiamento*'}
      subtitle={tela === 'fluxo'
        ? 'Preencha os campos: a proposta sai em imagem e em texto pronto para o WhatsApp'
        : 'Renda, parcela do banco e saldo nas chaves'}
      largura="painel"
      actions={<TrocaDeSimulador valor={tela} onChange={trocarTela} />}
      band={tela === 'fluxo' ? (
        <Abas
          abas={MODOS}
          valor={modo}
          onChange={setModo}
          rotulo="Tipo de simulação"
          variante="pilula"
        />
      ) : undefined}
    >
      <div hidden={tela !== 'fluxo'}>
        {modo === 'pos_chaves' && (
          <PosChavesSimulator shared={shared} onShared={onShared} corretor={corretor} onRelato={aoRelatar} />
        )}
        {modo === 'direto' && (
          <DiretoSimulator shared={shared} onShared={onShared} corretor={corretor} onRelato={aoRelatar} />
        )}
        {modo === 'associativo' && (
          <AssociativoSimulator shared={shared} onShared={onShared} corretor={corretor} onRelato={aoRelatar} />
        )}
      </div>
      {abriuFinanciamento && <div hidden={tela !== 'financiamento'}>
        <SimuladorFinanciamento
          origem={repasse ?? undefined}
          cliente={shared.cliente}
          empreendimento={shared.empreendimento}
          corretor={corretor}
          telefone={shared.telefone}
        />
      </div>}
    </PageLayout>
  )
}
