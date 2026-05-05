import { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const variants = {
  primary: 'bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/50',
  secondary: 'bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 hover:border-white/20',
  ghost: 'hover:bg-white/8 text-slate-400 hover:text-slate-200',
  danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40',
}

const sizes = {
  sm: 'px-3 py-2 text-xs gap-1.5 min-h-[34px]',
  md: 'px-4 py-2 text-sm gap-2 min-h-[38px]',
  lg: 'px-5 py-2.5 text-sm gap-2 min-h-[42px]',
}

export function Button({ variant = 'primary', size = 'md', children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center font-medium rounded-lg
        transition-all duration-200 active:scale-[0.97] cursor-pointer
        disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
        ${variants[variant]} ${sizes[size]} ${className}
      `}
    >
      {children}
    </button>
  )
}
