import { User } from 'lucide-react'
import { iniciais } from '../../lib/formatters'

interface AvatarProps {
  name: string
  photoUrl?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const sizes = {
  xs: 'w-6 h-6 text-[11px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
}

/*
 * Avatar sem foto é NEUTRO (v5). A paleta antiga sorteava pela inicial entre
 * tons de status — um contato qualquer saía âmbar de "atenção" ou petróleo de
 * "informação" sem significar nada, e competia com os status de verdade da
 * linha. Cor é significado; inicial não é.
 */
const NEUTRO = 'bg-s3 text-t2 border border-line'

export function Avatar({ name, photoUrl, size = 'md' }: AvatarProps) {
  // Só letras: nome decorativo não pode virar "�" (ver iniciais()).
  const initials = iniciais(name, 2)

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover flex-shrink-0`}
      />
    )
  }

  return (
    <div
      className={`${sizes[size]} ${NEUTRO} rounded-full flex items-center justify-center font-semibold flex-shrink-0 select-none`}
      aria-hidden
    >
      {initials || <User size={size === 'xs' ? 11 : size === 'sm' ? 13 : 16} strokeWidth={1.8} />}
    </div>
  )
}
