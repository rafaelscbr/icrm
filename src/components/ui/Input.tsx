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
          <label htmlFor={inputId} className="rotulo-campo">
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
            campo w-full px-3.5 py-2.5 min-h-[44px] placeholder:text-t4
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
