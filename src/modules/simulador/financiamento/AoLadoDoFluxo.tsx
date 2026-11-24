import { ReactNode, useCallback, useEffect, useState } from 'react'
import { Landmark, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { SidePanel } from '../../../components/ui/SidePanel'
import { SimuladorFinanciamento } from './SimuladorFinanciamento'
import type { EstadoFinanciamento, RepasseDoFluxo, ResumoFinanciamento } from './estado'

/**
 * Põe o Simulador de financiamento AO LADO do Simulador de fluxo.
 *
 *   • Tela larga (≥ 1536 px): coluna à direita, fixa na rolagem, recolhível.
 *   • Abaixo disso (notebook, tablet, celular): botão flutuante que abre a
 *     gaveta lateral — tela cheia no celular.
 *
 * O estado do financiamento mora AQUI, não no painel: assim ele sobrevive a
 * recolher, abrir a gaveta ou girar o tablet (o painel remonta com o último
 * estado). No modo Direto com a construtora não há banco e nada aparece.
 */

const LARGA = '(min-width: 1536px)'

function useTelaLarga(): boolean {
  const [larga, setLarga] = useState(() => typeof window !== 'undefined' && window.matchMedia(LARGA).matches)
  useEffect(() => {
    const mq = window.matchMedia(LARGA)
    const aoMudar = () => setLarga(mq.matches)
    mq.addEventListener('change', aoMudar)
    return () => mq.removeEventListener('change', aoMudar)
  }, [])
  return larga
}

const RECOLHIDO = 'icrm.financiamento.recolhido'

export function AoLadoDoFluxo({
  children, origem, inicial, onEstado, onSalvarNoLead, salvando, cliente, empreendimento, corretor,
}: {
  children: ReactNode
  origem: RepasseDoFluxo | null | undefined
  inicial?: EstadoFinanciamento
  onEstado?: (e: EstadoFinanciamento, r: ResumoFinanciamento | null) => void
  onSalvarNoLead?: () => void
  salvando?: boolean
  cliente?: string
  empreendimento?: string
  corretor?: string
}) {
  const larga = useTelaLarga()
  const [gaveta, setGaveta] = useState(false)
  const [recolhido, setRecolhido] = useState(() => {
    try { return localStorage.getItem(RECOLHIDO) === '1' } catch { return false }
  })
  const recolher = (v: boolean) => {
    setRecolhido(v)
    try { localStorage.setItem(RECOLHIDO, v ? '1' : '0') } catch { /* preferência só deste navegador */ }
  }

  const [estado, setEstado] = useState<EstadoFinanciamento | undefined>(inicial)
  const aoMudar = useCallback((e: EstadoFinanciamento, r: ResumoFinanciamento | null) => {
    setEstado(e)
    onEstado?.(e, r)
  }, [onEstado])

  const semBanco = origem === null
  const painel = (
    <SimuladorFinanciamento
      comTitulo={larga}
      origem={origem ?? undefined} inicial={estado} onEstado={aoMudar}
      onSalvarNoLead={onSalvarNoLead} salvando={salvando}
      cliente={cliente} empreendimento={empreendimento} corretor={corretor}
    />
  )

  if (semBanco) return <>{children}</>

  if (larga) {
    return (
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">{children}</div>
        {recolhido ? (
          <button type="button" onClick={() => recolher(false)}
                  className="sticky top-4 flex-shrink-0 flex flex-col items-center gap-2 w-11 py-4 rounded-[18px] bg-[#0F2759] text-white cursor-pointer
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
                  aria-label="Abrir o Simulador de financiamento">
            <PanelRightOpen size={17} aria-hidden />
            <span className="text-[12.5px] font-semibold [writing-mode:vertical-rl] rotate-180">Financiamento</span>
          </button>
        ) : (
          <aside aria-label="Simulador de financiamento"
                 className="sticky top-4 w-[400px] flex-shrink-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rolagem-limpa
                            rounded-[24px] border border-line bg-page p-4">
            <div className="flex justify-end -mb-8 relative z-10">
              <button type="button" onClick={() => recolher(true)} aria-label="Recolher o Simulador de financiamento"
                      className="ficha-icone"><PanelRightClose size={17} aria-hidden /></button>
            </div>
            {painel}
          </aside>
        )}
      </div>
    )
  }

  return (
    <>
      {children}
      <button type="button" onClick={() => setGaveta(true)}
              className="fixed right-4 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] lg:bottom-6 z-40 inline-flex items-center gap-2
                         h-12 px-4 rounded-full bg-[#0F2759] text-white text-[14px] font-semibold shadow-lg cursor-pointer
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60">
        <Landmark size={17} aria-hidden /> Financiamento
      </button>
      <SidePanel isOpen={gaveta} onClose={() => setGaveta(false)} title="Simulador de financiamento"
                 subtitle="Renda, parcela e saldo nas chaves" size="md">
        {painel}
      </SidePanel>
    </>
  )
}
