import { InputHTMLAttributes, CSSProperties, forwardRef, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', style, id, ...props }, ref) => {
    const autoId = useId()
    const inputId = id ?? autoId
    const hintId  = hint  ? `${inputId}-hint`  : undefined
    const errorId = error ? `${inputId}-error` : undefined

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
          <label htmlFor={inputId} className="text-xs font-medium text-t2">
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          {...props}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId ?? hintId}
          style={mergedStyle}
          className={`
            w-full bg-surface border rounded-lg px-3 py-2.5 text-sm text-t1 min-h-[42px]
            placeholder:text-t3
            focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand
            hover:border-line-strong
            transition-all duration-150
            ${error ? 'border-error-line ring-1 ring-error/20' : 'border-line-input'}
            ${className}
          `}
        />
        {hint && !error && <p id={hintId} className="text-xs text-t4">{hint}</p>}
        {error && <p id={errorId} className="text-xs text-error" role="alert">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
