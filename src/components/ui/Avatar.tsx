interface AvatarProps {
  name: string
  photoUrl?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
}

const colors = [
  'bg-indigo-500/30 text-indigo-300',
  'bg-purple-500/30 text-purple-300',
  'bg-green-500/30 text-green-300',
  'bg-blue-500/30 text-blue-300',
  'bg-yellow-500/30 text-yellow-300',
  'bg-red-500/30 text-red-300',
]

function getColor(name: string) {
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}

export function Avatar({ name, photoUrl, size = 'md' }: AvatarProps) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
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
      className={`${sizes[size]} ${getColor(name)} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
    >
      {initials}
    </div>
  )
}
