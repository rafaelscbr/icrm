import { Radio } from 'lucide-react'
import { Painel, PainelTitulo } from './Primitives'
import { describe, agruparFeed, horaCurta, type PulseTone } from '../pulseEvents'
import type { PulseEvent } from '../types'

/**
 * O PULSO — o feed que sobe sozinho.
 *
 * É a resposta literal a "o que está acontecendo agora". Não tem scroll manual
 * nem paginação: o que saiu da tela saiu do momento presente. O teto de 60
 * itens vive no store (FEED_MAX).
 */

const TONE_COR: Record<PulseTone, string> = {
  neutral: 'text-t3',
  good:    'text-info',
  warn:    'text-warning',
  win:     'text-success',
}

interface Props {
  feed:        PulseEvent[]
  brokerNames: Record<string, string>
  className?:  string
}

export function LiveFeed({ feed, brokerNames, className = '' }: Props) {
  const linhas = agruparFeed(feed)

  return (
    <Painel className={className}>
      <PainelTitulo
        icon={Radio}
        extra={
          <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4 tabular-nums">
            {linhas.length} eventos
          </span>
        }
      >
        Pulso
      </PainelTitulo>

      {/*
        Rolável: com muita atividade o que saía da área visível ficava
        inalcançável. `overscroll-contain` impede que o gesto vaze para o
        documento (o viewport do quiosque é fixo e não rola).
      */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-3 pulse-scroll">
        {linhas.length === 0 ? (
          <p className="text-t4 text-sm pt-6 text-center">
            Nenhuma atividade registrada hoje ainda.
          </p>
        ) : (
          <ul className="flex flex-col">
            {linhas.map(ev => {
              const view = describe(ev, ev.brokerId ? brokerNames[ev.brokerId] : undefined)
              const Icon = view.icon
              return (
                <li
                  key={ev.id}
                  className="flex items-center gap-3 py-[7px] px-1 -mx-1 rounded border-b border-line/60 last:border-0 pulse-item-in"
                >
                  <span className="font-label text-[11px] tabular-nums text-t4 shrink-0 w-11">
                    {horaCurta(ev.at)}
                  </span>
                  <Icon
                    size={15}
                    strokeWidth={1.6}
                    className={`shrink-0 ${TONE_COR[view.tone]}`}
                    aria-hidden
                  />
                  <span className="text-[15px] text-t1 truncate flex-1 min-w-0">
                    {view.texto}
                  </span>
                  {view.detalhe && (
                    <span className="font-label text-[11px] uppercase tracking-[0.1em] text-t4 shrink-0">
                      {view.detalhe}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Painel>
  )
}
