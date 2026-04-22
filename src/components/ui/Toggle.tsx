interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full py-1 cursor-pointer"
    >
      <span className="text-sm text-slate-300">{label}</span>
      <div
        className={`
          relative w-10 h-6 rounded-full transition-colors duration-200
          ${checked ? 'bg-indigo-500' : 'bg-white/10'}
        `}
      >
        <div
          className={`
            absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-1'}
          `}
        />
      </div>
    </button>
  )
}
