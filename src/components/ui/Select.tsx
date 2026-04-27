import { SelectHTMLAttributes, forwardRef, ReactNode } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, children, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {label}
            {props.required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            {...props}
            style={{ colorScheme: 'dark', WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }}
            className={`
              w-full bg-[#1e2130] border rounded-xl px-3 py-3 pr-9 min-h-[44px]
              text-sm text-slate-100
              focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50
              transition-all duration-150 cursor-pointer
              ${error ? 'border-red-500/50' : 'border-white/10 hover:border-white/20'}
              ${className}
            `}
          >
            {children}
          </select>
          {/* Chevron customizado — substitui a seta nativa do browser */}
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-500">
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
