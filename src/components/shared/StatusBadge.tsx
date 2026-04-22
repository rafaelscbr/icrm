import { Badge } from '../ui/Badge'
import { PropertyStatus } from '../../types'
import { TrendingDown, Minus, TrendingUp } from 'lucide-react'

const config: Record<PropertyStatus, { label: string; variant: 'green' | 'yellow' | 'red'; icon: typeof TrendingDown }> = {
  opportunity:   { label: 'Oportunidade',      variant: 'green',  icon: TrendingDown },
  market_price:  { label: 'Preço de mercado',  variant: 'yellow', icon: Minus        },
  above_market:  { label: 'Acima do mercado',  variant: 'red',    icon: TrendingUp   },
}

export function StatusBadge({ status }: { status: PropertyStatus }) {
  const { label, variant, icon: Icon } = config[status]
  return (
    <Badge variant={variant}>
      <Icon size={10} className="mr-1" />
      {label}
    </Badge>
  )
}
