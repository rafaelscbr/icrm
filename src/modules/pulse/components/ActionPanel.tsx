import { AlertTriangle, Siren, Snowflake, ListTodo, MessageSquareOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Painel, PainelTitulo } from './Primitives'
import type { PulseGargalos } from '../types'

/**
 * Precisa de ação — os gargalos.
 *
 * Estes números vêm do snapshot e NÃO são recalculados por evento: "lead sem
 * atendimento hoje" depende de ausência de registro, e ausência não gera
 * evento. Ficam estáveis entre snapshots, o que é honesto — são indicadores de
 * acúmulo, não de momento.
 */

interface Linha {
  icon:   LucideIcon
  valor:  number
  rotulo: string
  grave:  boolean
}

/**
 * "Sem atendimento hoje" começa todo dia valendo ~100% do funil — às 9h da
 * manhã isso é normal, não é alarme. Marcar vermelho o dia inteiro treinaria
 * exatamente o hábito que este painel quer evitar: ignorá-lo. Só vira alerta
 * depois das 14h e quando passa da metade do funil ativo.
 */
const HORA_COBRANCA = 14

interface Props {
  gargalos:   PulseGargalos
  funilTotal: number
  hora:       number
}

export function ActionPanel({ gargalos, funilTotal, hora }: Props) {
  const atrasoRelevante =
    hora >= HORA_COBRANCA && gargalos.semAtendimentoHoje > funilTotal * 0.5

  const linhas: Linha[] = [
    { icon: MessageSquareOff, valor: gargalos.semAtendimentoHoje, rotulo: 'sem atendimento hoje', grave: atrasoRelevante },
    { icon: Snowflake,        valor: gargalos.aguardando48h,      rotulo: 'parados há +48h',      grave: gargalos.aguardando48h > 5 },
    { icon: Siren,            valor: gargalos.slaEstourado,       rotulo: 'SLA estourado',        grave: gargalos.slaEstourado > 0 },
    { icon: ListTodo,         valor: gargalos.tarefasAtrasadas,   rotulo: 'tarefas em atraso',    grave: gargalos.tarefasAtrasadas > 3 },
  ]

  return (
    <Painel className="shrink-0">
      <PainelTitulo icon={AlertTriangle}>Precisa de ação</PainelTitulo>

      <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {linhas.map(l => {
          const Icon = l.icon
          const cor = l.valor === 0 ? 'text-t4' : l.grave ? 'text-error' : 'text-warning'
          return (
            <div key={l.rotulo} className="flex items-center gap-2 min-w-0">
              <Icon size={14} strokeWidth={1.6} className={`shrink-0 ${cor}`} aria-hidden />
              <span className={`font-heading font-bold tabular-nums text-xl leading-none shrink-0 ${cor}`}>
                {l.valor}
              </span>
              <span className="font-label text-[10px] uppercase tracking-[0.1em] text-t4 truncate">
                {l.rotulo}
              </span>
            </div>
          )
        })}
      </div>
    </Painel>
  )
}
