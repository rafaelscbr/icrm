import { Badge } from '../ui/Badge'
import { PropertyStatus } from '../../types'
import { TrendingDown, Minus, TrendingUp } from 'lucide-react'

/**
 * A cor aqui é semântica, não decorativa.
 *
 * "Preço de mercado" é o caso NEUTRO — o imóvel está onde deveria estar, não há
 * nada a fazer — e vinha em amarelo, a mesma cor de alerta usada para chamar
 * atenção. Numa grade em que a maioria dos imóveis está a preço de mercado, a
 * tela inteira gritava e as duas exceções que realmente importam (oportunidade
 * e acima do mercado) sumiam no meio.
 *
 * Neutro em cinza; verde e vermelho reservados para o que foge da régua.
 */
const config: Record<PropertyStatus, {
  label: string
  variant: 'green' | 'yellow' | 'red' | 'slate'
  icon: typeof TrendingDown
}> = {
  opportunity:  { label: 'Oportunidade',     variant: 'green',  icon: TrendingDown },
  market_price: { label: 'Preço de mercado', variant: 'slate',  icon: Minus        },
  above_market: { label: 'Acima do mercado', variant: 'red',    icon: TrendingUp   },
}

export function StatusBadge({ status }: { status: PropertyStatus }) {
  const { label, variant, icon: Icon } = config[status]
  return (
    <Badge variant={variant}>
      <Icon size={10} />
      {label}
    </Badge>
  )
}
