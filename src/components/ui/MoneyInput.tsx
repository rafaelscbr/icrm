import { useId } from 'react'

interface MoneyInputProps {
  label?: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  hint?: string
  error?: string
  required?: boolean
  disabled?: boolean
  id?: string
}

/**
 * Campo de dinheiro em Real.
 *
 * `type="number"` cru é proibido no sistema: perde a máscara de milhar, aceita
 * expoente ("1e9"), muda de comportamento por locale do navegador e ainda ganha
 * setinhas que ninguém quer num campo de R$ 530.000. Aqui o valor trafega como
 * número e a máscara é pt-BR pura.
 *
 * Campo vazio devolve `undefined`, não zero — a diferença importa: uma régua
 * sem renda mínima não é uma régua que exige R$ 0.
 */
export function MoneyInput({
  label, value, onChange, placeholder = '0',
  hint, error, required, disabled, id,
}: MoneyInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined

  const texto = value === undefined || Number.isNaN(value)
    ? ''
    : value.toLocaleString('pt-BR')

  function handleChange(raw: string) {
    const digitos = raw.replace(/\D/g, '')
    onChange(digitos ? parseInt(digitos, 10) : undefined)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-t2">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        <span
          className="absolute left-3 text-xs font-medium text-t3 select-none pointer-events-none"
          aria-hidden
        >
          R$
        </span>
        <input
          id={inputId}
          value={texto}
          onChange={e => handleChange(e.target.value)}
          inputMode="numeric"
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId ?? hintId}
          className={`
            w-full bg-surface border rounded-lg pl-9 pr-3 py-2.5 text-sm text-t1 min-h-[42px]
            tabular-nums placeholder:text-t3
            focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand
            hover:border-line-strong
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-150
            ${error ? 'border-error-line ring-1 ring-error/20' : 'border-line-input'}
          `}
        />
      </div>
      {hint && !error && <p id={hintId} className="text-xs text-t4">{hint}</p>}
      {error && <p id={errorId} className="text-xs text-error" role="alert">{error}</p>}
    </div>
  )
}
