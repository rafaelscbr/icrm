import { InputHTMLAttributes, CSSProperties, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', style, ...props }, ref) => {
    const isDateOrTime =
      props.type === 'date' ||
      props.type === 'time' ||
      props.type === 'datetime-local'
    const mergedStyle: CSSProperties = isDateOrTime
      ? { colorScheme: 'dark', ...style }
      : (style ?? {})

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-semibold text-t3 uppercase tracking-wider">
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          {...props}
          style={mergedStyle}
          className={`
            w-full bg-surface border rounded-lg px-3 py-2.5 text-sm text-t1 min-h-[40px]
            placeholder:text-t4
            focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand
            hover:border-line-strong
            transition-all duration-150
            ${error ? 'border-error-line ring-1 ring-error/20' : 'border-line-input'}
            ${className}
          `}
        />
        {hint && !error && <p className="text-xs text-t4">{hint}</p>}
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
