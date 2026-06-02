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
          <label className="text-xs font-medium text-t2">
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            {...props}
            style={{
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              appearance: 'none',
              backgroundColor: 'var(--surface)',
              color: 'var(--t1)',
              colorScheme: 'auto',
            }}
            className={`
              w-full border rounded-lg px-3 py-2.5 pr-9 min-h-[42px]
              text-sm
              focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand
              hover:border-line-strong
              transition-all duration-150 cursor-pointer
              ${error ? 'border-error-line ring-1 ring-error/20' : 'border-line-input'}
              ${className}
            `}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="text-t4">
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
