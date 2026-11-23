import type { ReactNode } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { FotoPerfil } from './FotoPerfil'

/**
 * Corretor com foto (22/11/2026) — o Rafael pediu a foto do Dionata e do Ryan
 * em todo lugar onde o nome deles aparece, "legível, um pouco maior, para
 * entender quem é quem". Esta peça busca a foto pelo id do perfil e põe ao
 * lado do nome; sem foto, as iniciais.
 *
 * `useFotoDoCorretor` serve onde só a foto cabe (ex.: dentro de um anel).
 */
export function useFotoDoCorretor(): (id: string | null | undefined) => string | undefined {
  const profile = useAuthStore(s => s.profile)
  const allProfiles = useAuthStore(s => s.allProfiles)
  return id => {
    if (!id) return undefined
    if (id === profile?.id) return profile.avatarUrl
    return allProfiles.find(p => p.id === id)?.avatarUrl
  }
}

export function CorretorComFoto({ id, nome, tamanho = 28, className = '', children }: {
  id: string | null | undefined
  nome: string
  tamanho?: number
  className?: string
  /** o texto ao lado da foto; padrão: o nome */
  children?: ReactNode
}) {
  const fotoDe = useFotoDoCorretor()
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 align-middle ${className}`}>
      <FotoPerfil nome={nome} url={fotoDe(id)} tamanho={tamanho} />
      <span className="min-w-0 truncate">{children ?? nome}</span>
    </span>
  )
}
