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
          <label htmlFor={areaId} className="rotulo-campo">
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
          className={`
            campo w-full px-3.5 py-2.5 placeholder:text-t4 resize-none
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
