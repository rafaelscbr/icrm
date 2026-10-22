import { RefreshCw, X } from 'lucide-react'
import { atualizarAgora, dispensarAtualizacao, useAtualizacaoPendente } from '../../lib/atualizacao'

/*
 * Aviso de versão nova. No celular fica logo acima da barra de baixo, para não
 * cobrir o cabeçalho nem a navegação; no desktop, no canto inferior direito.
 * Azul porque é informação, não pendência — ver docs/principios-visuais.md.
 */
export function AvisoDeAtualizacao() {
  const pendente = useAtualizacaoPendente()
  if (!pendente) return null

  return (
    <div
      role="status"
      className="fixed z-50 inset-x-3 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[360px]
                 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]
                 flex items-center gap-3 pl-3 pr-2 py-2.5 rounded-[14px] border border-info-line"
      style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-dropdown)' }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-info-bg">
        <RefreshCw size={15} strokeWidth={2} className="text-info" />
      </div>
      <p className="min-w-0 flex-1 text-sm font-semibold text-t1 leading-snug">Nova versão disponível</p>
      <button
        onClick={atualizarAgora}
        className="flex-shrink-0 px-3 min-h-[36px] rounded-xl text-sm font-semibold text-info bg-info-bg border border-info-line active:scale-95 transition-transform"
      >
        Atualizar
      </button>
      <button
        onClick={dispensarAtualizacao}
        aria-label="Dispensar aviso"
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-t4 hover:text-t2 transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  )
}
