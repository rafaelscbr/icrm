interface AvatarProps {
  name: string
  photoUrl?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const sizes = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
}

const palettes = [
  'bg-blue-500/25 text-blue-600',
  'bg-violet-500/25 text-violet-600',
  'bg-emerald-500/25 text-emerald-700',
  'bg-amber-500/25 text-amber-700',
  'bg-rose-500/25 text-rose-600',
  'bg-cyan-500/25 text-cyan-700',
  'bg-indigo-500/25 text-indigo-600',
  'bg-orange-500/25 text-orange-600',
]

function pickColor(name: string) {
  return palettes[name.charCodeAt(0) % palettes.length]
}

export function Avatar({ name, photoUrl, size = 'md' }: AvatarProps) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

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
      className={`${sizes[size]} ${pickColor(name)} rounded-full flex items-center justify-center font-semibold flex-shrink-0 select-none`}
    >
      {initials}
    </div>
  )
}
