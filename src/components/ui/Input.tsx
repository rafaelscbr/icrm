import { InputHTMLAttributes, CSSProperties, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', style, ...props }, ref) => {
    // Garante tema escuro em inputs de data/hora no Safari (evita fundo branco)
    const isDateOrTime = props.type === 'date' || props.type === 'time' || props.type === 'datetime-local'
    const mergedStyle: CSSProperties = isDateOrTime
      ? { colorScheme: 'dark', ...style }
      : (style ?? {})

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {label}
            {props.required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          {...props}
          style={mergedStyle}
          className={`
            w-full bg-white/5 border rounded-xl px-3 py-3 text-sm text-slate-100 min-h-[44px]
            placeholder:text-slate-600
            focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50
            transition-all duration-150
            ${error ? 'border-red-500/50' : 'border-white/10 hover:border-white/20'}
            ${className}
          `}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
