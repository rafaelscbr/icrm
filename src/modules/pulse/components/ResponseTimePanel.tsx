import { Timer } from 'lucide-react'
import { Painel, PainelTitulo } from './Primitives'
import {
  formatarDuracaoUtil, nivelPrimeiroContato, nivelSegundaTentativa, nivelSla,
  COR_NIVEL, SLA_PRIMEIRO_CONTATO_MIN,
} from '../tempos'
import type { PulseTempos } from '../types'

/**
 * Tempo de resposta.
 *
 * Diferente do resto do painel, estes números são uma janela móvel de 30 DIAS,
 * não do dia corrente — com poucos leads por dia a média diária oscilaria
 * demais para servir de diagnóstico. O rótulo "30 dias" está no cabeçalho
 * justamente para não criar a expectativa de que muda a cada minuto.
 */

function Metrica({ rotulo, mediaMin, medianaMin, amostra, cor }: {
  rotulo:     string
  mediaMin:   number
  medianaMin: number
  amostra:    number
  cor:        string
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="font-label text-[10px] uppercase tracking-[0.12em] text-t4 mb-1">
        {rotulo}
      </div>
      <div
        className="font-heading font-extrabold tabular-nums leading-none text-[26px] tracking-tight"
        style={{ color: cor }}
      >
        {amostra === 0 ? '—' : formatarDuracaoUtil(mediaMin)}
      </div>
      <div className="font-label text-[10px] uppercase tracking-[0.1em] text-t4 tabular-nums mt-1">
        {amostra === 0 ? 'sem dados' : `mediana ${formatarDuracaoUtil(medianaMin)}`}
      </div>
    </div>
  )
}

export function ResponseTimePanel({ tempos }: { tempos: PulseTempos }) {
  const p1 = tempos.primeiroContato
  const p2 = tempos.segundaTentativa

  const corSla = COR_NIVEL[nivelSla(p1.pctDentroSla, p1.amostra)]

  return (
    <Painel className="shrink-0">
      <PainelTitulo
        icon={Timer}
        extra={
          <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4">
            30 dias
          </span>
        }
      >
        Tempo de resposta
      </PainelTitulo>

      <div className="px-4 pb-3">
        <div className="flex gap-4">
          <Metrica
            rotulo="Até o 1º contato"
            mediaMin={p1.mediaMin}
            medianaMin={p1.medianaMin}
            amostra={p1.amostra}
            cor={COR_NIVEL[nivelPrimeiroContato(p1.mediaMin, p1.amostra)]}
          />
          <div className="w-px self-stretch bg-line" aria-hidden />
          <Metrica
            rotulo="Até a 2ª tentativa"
            mediaMin={p2.mediaMin}
            medianaMin={p2.medianaMin}
            amostra={p2.amostra}
            cor={COR_NIVEL[nivelSegundaTentativa(p2.mediaMin, p2.amostra)]}
          />
        </div>

        {/* Cumprimento do SLA — a leitura mais acionável das duas métricas */}
        {p1.amostra > 0 && (
          <div className="mt-3 pt-2.5 border-t border-line/60">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span
                className="font-heading font-bold tabular-nums text-base leading-none"
                style={{ color: corSla }}
              >
                {p1.pctDentroSla}%
              </span>
              <span className="font-label text-[10px] uppercase tracking-[0.1em] text-t4">
                dentro do SLA de {SLA_PRIMEIRO_CONTATO_MIN} min
              </span>
              <span className="ml-auto font-label text-[10px] uppercase tracking-[0.1em] text-t5 tabular-nums">
                {p1.amostra} leads
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-s3 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-[420ms]"
                style={{ width: `${p1.pctDentroSla}%`, background: corSla }}
              />
            </div>
          </div>
        )}
      </div>
    </Painel>
  )
}
