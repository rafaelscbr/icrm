import { TextareaHTMLAttributes, forwardRef, useId } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const autoId = useId()
    const areaId  = id ?? autoId
    const hintId  = hint  ? `${areaId}-hint`  : undefined
    const errorId = error ? `${areaId}-error` : undefined
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={areaId} className="text-xs font-medium text-t2">
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={areaId}
          {...props}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId ?? hintId}
          style={{ backgroundColor: 'var(--surface)', color: 'var(--t1)' }}
          className={`
            w-full border rounded-lg px-3 py-2.5 text-sm
            placeholder:text-t3
            focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand
            hover:border-line-strong
            transition-all duration-150 resize-none
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

Textarea.displayName = 'Textarea'
