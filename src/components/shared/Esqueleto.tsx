import { ListContainer } from '../ui/ListContainer'

/**
 * Esqueletos de carregamento — a tela no formato final, sem o dado.
 *
 * Spinner centralizado esvazia a tela e faz o conteúdo "explodir" quando
 * chega; o esqueleto ocupa o lugar do que vai aparecer, então a carga parece
 * metade do tempo e nada pula de posição. Regra do sistema: spinner só em
 * ação do usuário (salvar, enviar); leitura de tela usa esqueleto.
 *
 * Três formas, que cobrem quase toda tela: linhas de lista, cards em grade e
 * a faixa de indicadores. Quem precisa de outra, compõe com <Osso>.
 */

/** Um bloco cinza que pulsa. Só forma, sem cor. */
export function Osso({ className = '' }: { className?: string }) {
  return <span className={`block rounded-md bg-s3/70 animate-pulse ${className}`} aria-hidden />
}

function Rotulo() {
  return <span className="sr-only" role="status">Carregando…</span>
}

/** Linhas de lista: avatar, duas linhas de texto e um chip à direita. */
export function EsqueletoLinhas({ linhas = 6 }: { linhas?: number }) {
  return (
    <div aria-busy="true">
      <Rotulo />
      <ListContainer>
        {Array.from({ length: linhas }, (_, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-6 py-4 ${i < linhas - 1 ? 'border-b border-line' : ''}`}
          >
            <Osso className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <Osso className="h-3.5 w-[38%] max-w-[240px]" />
              <Osso className="h-3 w-[26%] max-w-[180px]" />
            </div>
            <Osso className="hidden md:block h-3 w-[120px]" />
            <Osso className="hidden lg:block h-3 w-[72px]" />
            <Osso className="h-6 w-[88px] rounded-lg" />
          </div>
        ))}
      </ListContainer>
    </div>
  )
}

/** Cards em grade: título, subtítulo, número grande e barra. */
export function EsqueletoCards({ cards = 3, colunas = 3 }: { cards?: number; colunas?: 2 | 3 | 4 }) {
  const grade = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }[colunas]
  return (
    <div className={`grid grid-cols-1 ${grade} gap-3`} aria-busy="true">
      <Rotulo />
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="rounded-[14px] border border-line surface-premium shadow-card px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Osso className="w-9 h-9 rounded-[11px] flex-shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5">
              <Osso className="h-3.5 w-[55%]" />
              <Osso className="h-2.5 w-[35%]" />
            </div>
          </div>
          <Osso className="h-8 w-[40%]" />
          <Osso className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Faixa de indicadores: rótulo pequeno e número grande. */
export function EsqueletoKpis({ kpis = 4 }: { kpis?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-busy="true">
      <Rotulo />
      {Array.from({ length: kpis }, (_, i) => (
        <div key={i} className="rounded-[14px] border border-line surface-premium shadow-card p-4 flex flex-col gap-3">
          <Osso className="h-2.5 w-[60%]" />
          <Osso className="h-7 w-[45%]" />
          <Osso className="h-2.5 w-[50%]" />
        </div>
      ))}
    </div>
  )
}
