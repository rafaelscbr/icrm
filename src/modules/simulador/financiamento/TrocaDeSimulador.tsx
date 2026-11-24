import { Segmentado } from '../../../components/shared/visual'

export type TelaDoSimulador = 'fluxo' | 'financiamento'

/**
 * A troca entre os dois simuladores, no topo da tela. São telas separadas
 * (24/11/2026): o Rafael achou confuso o financiamento ao lado do fluxo.
 */
export function TrocaDeSimulador({ valor, onChange }: { valor: TelaDoSimulador; onChange: (t: TelaDoSimulador) => void }) {
  return (
    <Segmentado
      rotulo="Qual simulador"
      valor={valor}
      onChange={onChange}
      opcoes={[{ value: 'fluxo', label: 'Fluxo' }, { value: 'financiamento', label: 'Financiamento' }]}
    />
  )
}
