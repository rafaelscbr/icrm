import { Fragment } from 'react'
import type { ReactNode } from 'react'

/**
 * Palavra de destaque — Instrument Serif itálica em dourado (01/11/2026).
 *
 * Uma por frase. Ver `.destaque` no index.css.
 */
export function Destaque({ children }: { children: ReactNode }) {
  return <em className="destaque">{children}</em>
}

/**
 * Converte `*palavra*` em <Destaque>. Textos sem marcador passam intactos —
 * por isso títulos de seção, estados vazios e saudações podem aceitar string
 * comum e ganhar o destaque só onde alguém marcou.
 */
export function destacar(texto: ReactNode): ReactNode {
  if (typeof texto !== 'string' || !texto.includes('*')) return texto
  const partes = texto.split(/\*([^*]+)\*/g)
  return partes.map((p, i) =>
    i % 2 === 1 ? <Destaque key={i}>{p}</Destaque> : <Fragment key={i}>{p}</Fragment>,
  )
}

/** Mesmo texto sem os marcadores — para `title`, aria-label e afins. */
export function semMarcador(texto: string): string {
  return texto.replace(/\*([^*]+)\*/g, '$1')
}
