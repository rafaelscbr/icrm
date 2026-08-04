import { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

/*
 * O primário usa o degradê da marca (.grad-brand), não uma cor chapada: o par
 * fundo+texto viaja junto na classe e vale nos dois temas — no papel o ouro
 * escurece e o texto fica branco. Ver --grad-brand no index.css.
 */
const variants = {
  primary:   'grad-brand hover:brightness-110 shadow-brand active:opacity-95 font-bold font-heading',
  secondary: 'bg-surface border border-line hover:bg-s2 text-t2 hover:text-t1 hover:border-line-strong',
  ghost:     'hover:bg-s2 text-t3 hover:text-t1',
  danger:    'bg-error-bg hover:bg-error/20 text-error border border-error-line hover:border-error/50',
  success:   'bg-success-bg hover:bg-success/20 text-success border border-success-line hover:border-success/50',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-[36px]',
  md: 'px-4 py-2 text-sm gap-2 min-h-[40px]',
  lg: 'px-5 py-2.5 text-sm gap-2 min-h-[44px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  disabled,
  type,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      // Default seguro: nunca submete um form sem ser explicitamente type="submit"
      type={type ?? 'button'}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center font-semibold rounded-lg
        transition-all duration-150 active:scale-[0.98] cursor-pointer
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
        disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
        ${variants[variant]} ${sizes[size]} ${className}
      `}
    >
      {children}
    </button>
  )
}
