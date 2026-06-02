interface ScoreBadgeProps {
  score:  number
  label:  string
  emoji:  string
  color:  string
  bg:     string
  border: string
  size?:  'sm' | 'md'
}

export function ScoreBadge({ score, label, emoji, color, bg, border, size = 'md' }: ScoreBadgeProps) {
  if (size === 'sm') {
    return (
      <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border ${bg} ${border}`}>
        <span className="text-[10px]">{emoji}</span>
        <span className={`text-[11px] font-bold tabular-nums ${color}`}>{score}</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${bg} ${border}`}>
      <span className="text-base leading-none">{emoji}</span>
      <div>
        <p className={`text-lg font-bold tabular-nums leading-none ${color}`}>{score}</p>
        <p className={`text-[10px] mt-0.5 ${color} opacity-80`}>{label}</p>
      </div>
    </div>
  )
}
