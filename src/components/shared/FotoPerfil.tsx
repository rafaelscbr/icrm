import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { iniciais } from '../../lib/formatters'

/**
 * Foto de perfil redonda (22/11/2026) — a mesma peça no cartão do Kanban, na
 * ficha do lead, no menu da conta, no seletor de visão e na tela de entrada.
 * Sem foto, ou se a imagem falhar, as iniciais no lugar.
 *
 * `anel` contorna a foto com a cor da superfície — separa a foto do fundo
 * quando ela encosta em outra coisa (cartão, barra).
 */
export function FotoPerfil({ nome, url, tamanho = 32, anel = false, className = '', estiloIniciais }: {
  nome: string | null | undefined
  url?: string | null
  tamanho?: number
  anel?: boolean
  className?: string
  /** cores das iniciais quando não há foto (padrão: dourado da marca, suave) */
  estiloIniciais?: CSSProperties
}) {
  const [falhou, setFalhou] = useState(false)
  useEffect(() => { setFalhou(false) }, [url])
  const base = `rounded-full flex-shrink-0 ${anel ? 'ring-2 ring-surface' : ''} ${className}`
  if (url && !falhou) {
    return (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError não é interação: só troca a foto quebrada pelas iniciais
      <img src={url} alt="" draggable={false} onError={() => setFalhou(true)}
           className={`${base} object-cover`} style={{ width: tamanho, height: tamanho }} />
    )
  }
  return (
    <span className={`${base} flex items-center justify-center font-bold bg-brand-tint text-brand-text`}
          style={{ width: tamanho, height: tamanho, fontSize: Math.max(10, Math.round(tamanho * 0.36)), ...estiloIniciais }}
          aria-hidden>
      {iniciais(nome, 2) || '?'}
    </span>
  )
}
