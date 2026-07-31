import { Gauge } from 'lucide-react'
import { Painel, PainelTitulo } from './Primitives'
import { CLIMATE_COLOR, type ClimateResult } from '../climate'

/**
 * Clima da imobiliária.
 *
 * Dez segmentos e uma palavra. É o único elemento da tela pensado para ser lido
 * de pé, do outro lado da sala.
 *
 * Sem ícone de chama, por identidade — o acento de intensidade da marca é o
 * ouro, não fogo.
 */
export function ClimateGauge({ clima }: { clima: ClimateResult }) {
  const cor = CLIMATE_COLOR[clima.level]
  const acesos = Math.round((clima.score / 100) * 10)

  return (
    <Painel className="shrink-0">
      <PainelTitulo icon={Gauge}>Clima do dia</PainelTitulo>

      <div className="px-4 pb-4 pt-1">
        <div
          className="font-heading font-extrabold tracking-tight leading-none text-[27px] mb-3"
          style={{ color: cor }}
        >
          {clima.label}
        </div>

        <div className="flex items-center gap-1.5" role="img" aria-label={`Intensidade ${clima.score} de 100`}>
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className="flex-1 h-2 rounded-full transition-colors duration-[420ms]"
              style={{
                background: i < acesos ? cor : 'var(--surface-3)',
                opacity:    i < acesos ? 1 : 0.7,
              }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </Painel>
  )
}
