import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { HelpCircle, RotateCcw } from 'lucide-react'

/*
 * Peças do Simulador de financiamento — pequenas, sem regra de negócio.
 * A conta mora em calc.ts; aqui só se mostra.
 */

const semMovimento = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Número que conta até o valor novo (420 ms). Sem animação para quem pediu menos movimento. */
export function useContagem(alvo: number, duracao = 420): number {
  const [valor, setValor] = useState(alvo)
  const atual = useRef(alvo)
  useEffect(() => {
    if (semMovimento() || !Number.isFinite(alvo)) { atual.current = alvo; setValor(alvo); return }
    const de = atual.current
    const inicio = performance.now()
    let id = 0
    const passo = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracao)
      const e = 1 - Math.pow(1 - p, 3)
      const v = de + (alvo - de) * e
      atual.current = v
      setValor(v)
      if (p < 1) id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [alvo, duracao])
  return valor
}

export const brl = (v: number, casas = 2) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas })

export const pct = (v: number, casas = 2) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

export function Contagem({ valor, formatar = v => brl(v, 0), className = '' }: {
  valor: number; formatar?: (v: number) => string; className?: string
}) {
  const v = useContagem(valor)
  return <span className={`tabular-nums ${className}`}>{formatar(v)}</span>
}

/** "?" ao lado do termo: uma linha em linguagem de corretor. Abre no toque e no teclado. */
export function Ajuda({ termo, texto, children }: { termo: string; texto?: string; children?: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`O que é ${termo}?`}
                className="inline-flex items-center justify-center w-5 h-5 -my-1 rounded-full text-t4 hover:text-t2 cursor-pointer
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 align-middle">
          <HelpCircle size={13} strokeWidth={1.8} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={6} collisionPadding={12}
                         className="z-[90] max-w-[260px] rounded-[12px] bg-[#0F2759] text-white text-[12.5px] leading-snug px-3 py-2 shadow-lg">
          <strong className="font-semibold">{termo}:</strong> {children ?? texto}
          <Popover.Arrow className="fill-[#0F2759]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Rótulo de campo com "?" opcional e o "voltar ao simulador" quando o campo se soltou. */
export function RotuloCampo({ htmlFor, children, ajuda, solto, onVoltar }: {
  htmlFor?: string
  children: ReactNode
  ajuda?: { termo: string; texto: string }
  /** o campo foi editado aqui e não segue mais o Simulador de fluxo */
  solto?: boolean
  onVoltar?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 min-h-[20px]">
      <label htmlFor={htmlFor} className="rotulo-campo inline-flex items-center gap-1">
        {children}
        {ajuda && <Ajuda termo={ajuda.termo}>{ajuda.texto}</Ajuda>}
      </label>
      {solto && onVoltar && (
        <button type="button" onClick={onVoltar}
                className="inline-flex items-center gap-1 text-[11.5px] text-t4 hover:text-t1 cursor-pointer rounded
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          <RotateCcw size={11} strokeWidth={2} aria-hidden />
          usar o do fluxo
        </button>
      )}
    </div>
  )
}

/** Régua (slider) com o trecho preenchido em Champanhe. */
export function Regua({ id, min, max, step, value, onChange, rotulo }: {
  id?: string; min: number; max: number; step: number; value: number
  onChange: (v: number) => void; rotulo: string
}) {
  const p = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0
  return (
    <input
      id={id} type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))}
      onChange={e => onChange(Number(e.target.value))}
      aria-label={rotulo}
      className="regua w-full"
      style={{ ['--regua-p' as string]: `${p}%` }}
    />
  )
}

/** Campo em R$ com máscara pt-BR (inteiro) e régua embaixo. */
export function CampoDinheiro({ rotulo, valor, onChange, min = 0, max, step = 1000, ajuda, solto, onVoltar, nota }: {
  rotulo: string; valor: number; onChange: (v: number) => void
  min?: number; max: number; step?: number
  ajuda?: { termo: string; texto: string }
  solto?: boolean; onVoltar?: () => void
  nota?: ReactNode
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <RotuloCampo htmlFor={id} ajuda={ajuda} solto={solto} onVoltar={onVoltar}>{rotulo}</RotuloCampo>
      <div className="relative flex items-center">
        <span className="absolute left-3.5 text-[13px] text-t4 select-none pointer-events-none" aria-hidden>R$</span>
        <input
          id={id} inputMode="numeric" autoComplete="off"
          value={valor ? Math.round(valor).toLocaleString('pt-BR') : ''}
          onChange={e => { const d = e.target.value.replace(/\D/g, ''); onChange(d ? parseInt(d, 10) : 0) }}
          placeholder="0"
          className="campo w-full h-10 pl-10 pr-3 tabular-nums"
        />
      </div>
      <Regua min={min} max={Math.max(max, valor)} step={step} value={valor} onChange={onChange} rotulo={rotulo} />
      {nota && <p className="text-[12px] text-t4 tabular-nums">{nota}</p>}
    </div>
  )
}

/** Campo numérico curto (taxa, idade) com sufixo. Aceita vírgula. */
export function CampoNumero({ rotulo, valor, onChange, sufixo, casas = 2, ajuda, solto, onVoltar, placeholder, acao }: {
  rotulo: string; valor: number | null | undefined; onChange: (v: number | null) => void
  sufixo?: string; casas?: number
  ajuda?: { termo: string; texto: string }
  solto?: boolean; onVoltar?: () => void
  placeholder?: string
  acao?: ReactNode
}) {
  const id = useId()
  const formatado = valor == null ? '' : valor.toLocaleString('pt-BR', { maximumFractionDigits: casas })
  const [texto, setTexto] = useState(formatado)
  const focado = useRef(false)
  useEffect(() => { if (!focado.current) setTexto(formatado) }, [formatado])
  return (
    <div className="space-y-1.5">
      <RotuloCampo htmlFor={id} ajuda={ajuda} solto={solto} onVoltar={onVoltar}>{rotulo}</RotuloCampo>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 flex items-center">
          <input
            id={id} inputMode="decimal" autoComplete="off" value={texto} placeholder={placeholder}
            onFocus={() => { focado.current = true }}
            onBlur={() => { focado.current = false; setTexto(formatado) }}
            onChange={e => {
              const t = e.target.value.replace(/[^\d,.]/g, '')
              setTexto(t)
              const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
              onChange(t === '' || Number.isNaN(n) ? null : n)
            }}
            className={`campo w-full h-10 pl-3.5 tabular-nums ${sufixo ? "pr-12" : "pr-3"}`}
          />
          {sufixo && <span className="absolute right-3.5 text-[12.5px] text-t4 pointer-events-none" aria-hidden>{sufixo}</span>}
        </div>
        {acao}
      </div>
    </div>
  )
}

/**
 * Medidor de comprometimento de renda. O ponteiro gira (só `transform`);
 * a cor diz a faixa e o selo diz em texto — cor nunca sozinha.
 */
export function Medidor({ fracao, limite }: { fracao: number; limite: number }) {
  // Escala até 2× o limite (60% com limite de 30%).
  const teto = limite * 2
  const f = Math.min(1, Math.max(0, fracao / teto))
  const angulo = -90 + f * 180
  const tom = fracao > limite ? 'var(--error)' : fracao > limite * 0.85 ? 'var(--warning)' : 'var(--success)'
  // Arcos das faixas: verde até 85% do limite, âmbar até o limite, vermelho depois.
  const arco = (a: number, b: number) => {
    const p = (x: number) => {
      const t = Math.PI * (1 - x)
      return `${60 + 48 * Math.cos(t)} ${58 - 48 * Math.sin(t)}`
    }
    return `M ${p(a)} A 48 48 0 0 1 ${p(b)}`
  }
  const l1 = (limite * 0.85) / teto, l2 = limite / teto
  return (
    <svg viewBox="0 0 120 66" className="w-[132px] h-auto" aria-hidden>
      <path d={arco(0, l1)} stroke="var(--success)" strokeWidth="9" fill="none" opacity=".85" />
      <path d={arco(l1, l2)} stroke="var(--warning)" strokeWidth="9" fill="none" opacity=".85" />
      <path d={arco(l2, 1)} stroke="var(--error)" strokeWidth="9" fill="none" opacity=".85" />
      <g style={{ transform: `rotate(${angulo}deg)`, transformOrigin: '60px 58px', transition: semMovimento() ? undefined : 'transform 420ms cubic-bezier(.2,.8,.2,1)' }}>
        <line x1="60" y1="58" x2="60" y2="18" stroke={tom} strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="60" cy="58" r="5" fill={tom} />
    </svg>
  )
}
