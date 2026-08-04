import { Radio, MoonStar, ArrowLeft } from 'lucide-react'

/**
 * Faixa de identidade da página.
 *
 * Com duas telas quase idênticas em estrutura, o olho precisa de meio segundo
 * para saber onde está. A distinção é CROMÁTICA, não textual: ao vivo é ouro e
 * verde pulsante; passado é azul-frio e lua. Dá para saber a página de longe,
 * sem ler.
 */

export type TipoPagina = 'ao_vivo' | 'ontem'

const CONFIG = {
  ao_vivo: {
    icone: Radio,
    titulo: 'Ao vivo',
    dourado: true,
  },
  ontem: {
    icone: MoonStar,
    titulo: 'Ontem',
    dourado: false,
  },
} as const

export function PageBanner({ tipo, data, aoVoltar }: {
  tipo:      TipoPagina
  data:      Date
  /** presente só nas páginas que não são a ao vivo — sempre há como voltar */
  aoVoltar?: () => void
}) {
  const { icone: Icone, titulo, dourado } = CONFIG[tipo]

  const dataLonga = data.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  return (
    <div
      className={`shrink-0 relative overflow-hidden rounded-[14px] border px-4 py-2.5
        flex items-center gap-3 ${dourado ? 'pulse-banner-vivo' : 'pulse-banner-passado'}`}
    >
      <Icone
        size={17}
        strokeWidth={1.6}
        className={dourado ? 'text-brand' : 'text-info'}
        aria-hidden
      />

      <span
        className={`font-heading font-extrabold tracking-tight text-lg leading-none ${
          dourado ? 'gradient-text' : 'text-info'
        }`}
      >
        {titulo}
      </span>

      {tipo === 'ao_vivo' && (
        <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live-dot" aria-hidden />
      )}

      <span className="font-label text-[11px] uppercase tracking-[0.16em] text-t4">
        {dataLonga}
      </span>

      {aoVoltar && (
        <button
          onClick={aoVoltar}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-success-line
                     bg-success-bg px-3 py-1.5 transition-colors hover:bg-success/15"
        >
          <ArrowLeft size={13} strokeWidth={1.8} className="text-success" aria-hidden />
          <span className="font-label text-[10px] uppercase tracking-[0.16em] text-success">
            Ao vivo
          </span>
        </button>
      )}
    </div>
  )
}
