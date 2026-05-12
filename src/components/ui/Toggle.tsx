interface ToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full py-1 cursor-pointer group"
    >
      <div className="min-w-0 pr-4 text-left">
        <span className="text-sm text-t1 group-hover:text-t1 transition-colors">{label}</span>
        {description && <p className="text-xs text-t3 mt-0.5">{description}</p>}
      </div>
      <div
        className={`
          relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0
          ${checked ? 'bg-brand' : 'bg-s3'}
        `}
      >
        <div
          className={`
            absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-0.5'}
          `}
        />
      </div>
    </button>
  )
}
