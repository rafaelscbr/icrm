import {
  Users, MessageSquare, CalendarCheck, BadgeDollarSign,
  UserPlus, TrendingUp, Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatCurrency } from '../../../lib/formatters'
import type { PulseHoje } from '../types'

/**
 * A faixa que responde "como está o dia" em dois segundos.
 * Sete números, nenhuma interação, contraste alto para leitura a distância.
 */

interface Props {
  hoje:             PulseHoje
  corretoresOnline: number
  negociacaoValor:  number
  comissaoPrevista: number
}

function Kpi({ icon: Icon, valor, rotulo, nota, destaque = false }: {
  icon:      LucideIcon
  valor:     string
  rotulo:    string
  /** linha secundária — só aparece quando há o que dizer */
  nota?:     string
  destaque?: boolean
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2 min-w-0">
      <Icon
        size={16}
        strokeWidth={1.6}
        className={destaque ? 'text-brand' : 'text-t4'}
        aria-hidden
      />
      <span
        className={`font-heading font-extrabold tabular-nums leading-none tracking-tight truncate max-w-full ${
          destaque ? 'text-brand text-[30px]' : 'text-t1 text-[34px]'
        }`}
      >
        {valor}
      </span>
      <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4 text-center leading-tight">
        {rotulo}
      </span>
      {nota && (
        <span className="font-label text-[10px] uppercase tracking-[0.1em] text-success tabular-nums leading-none">
          {nota}
        </span>
      )}
    </div>
  )
}

function Divisor() {
  return <div className="w-px self-stretch my-3 bg-line shrink-0" aria-hidden />
}

export function KpiRail({ hoje, corretoresOnline, negociacaoValor, comissaoPrevista }: Props) {
  const n = (v: number) => String(v).padStart(2, '0')

  return (
    <div className="shrink-0 rounded-[14px] border border-line bg-surface shadow-card flex items-stretch py-3">
      <Kpi icon={Users}            valor={n(corretoresOnline)}      rotulo="Online no iCRM" />
      <Divisor />
      <Kpi icon={MessageSquare}    valor={n(hoje.interacoes)}       rotulo="Atendimentos" />
      <Divisor />
      <Kpi icon={CalendarCheck}    valor={n(hoje.visitasMarcadas)}  rotulo="Visitas" />
      <Divisor />
      <Kpi
        icon={BadgeDollarSign}
        valor={n(hoje.vendasQtd)}
        rotulo="Vendas"
        nota={hoje.vendasValor > 0 ? formatCurrency(hoje.vendasValor) : undefined}
      />
      <Divisor />
      <Kpi icon={UserPlus}         valor={n(hoje.leadsNovos)}       rotulo="Leads hoje" />
      <Divisor />
      <Kpi icon={TrendingUp}  valor={formatCurrency(negociacaoValor)}  rotulo="Em negociação" destaque />
      <Divisor />
      {/* Comissão do PIPELINE (5% sobre o que está em visita/proposta). Quando
          há venda fechada hoje, a comissão já realizada aparece embaixo. */}
      <Kpi
        icon={Wallet}
        valor={formatCurrency(comissaoPrevista)}
        rotulo="Comissão prevista"
        nota={hoje.vendasComissao > 0 ? `+${formatCurrency(hoje.vendasComissao)} hoje` : undefined}
        destaque
      />
    </div>
  )
}
