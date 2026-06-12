interface ScoreBadgeProps {
  score:  number
  label:  string
  emoji:  string
  color:  string
  bg:     string
  border: string
  size?:  'sm' | 'md' | 'lg'
}

export function ScoreBadge({ score, label, emoji, color, bg, border, size = 'md' }: ScoreBadgeProps) {
  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border ${bg} ${border}`}>
        <span className="text-xs leading-none">{emoji}</span>
        <span className={`text-xs font-bold tabular-nums ${color}`}>{score}</span>
        <span className={`text-[11px] ${color} opacity-70`}>{label}</span>
      </div>
    )
  }

  if (size === 'lg') {
    return (
      <div className={`flex flex-col items-center gap-1 px-4 py-3 rounded-2xl border-2 ${bg} ${border}`}>
        <span className="text-2xl leading-none">{emoji}</span>
        <p className={`text-3xl font-black tabular-nums leading-none ${color}`}>{score}</p>
        <p className={`text-xs font-semibold ${color} opacity-80`}>{label}</p>
      </div>
    )
  }

  // md (default)
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${bg} ${border}`}>
      <span className="text-xl leading-none">{emoji}</span>
      <div>
        <p className={`text-xl font-black tabular-nums leading-none ${color}`}>{score}</p>
        <p className={`text-xs font-semibold mt-0.5 ${color} opacity-75`}>{label}</p>
      </div>
    </div>
  )
}
