import { useState } from 'react'
import { Calculator, Lock } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { SimuladorModo, SharedFields } from './shared/types'
import { PosChavesSimulator } from './posChaves/Simulator'
import { DiretoSimulator } from './direto/Simulator'
import { AssociativoSimulator } from './associativo/Simulator'

// Shell do simulador: header + seletor de modo + renderização do modo ativo.
// Cada modo vive em sua própria pasta (calc.ts + Simulator.tsx + Card.tsx) e
// compõe as peças compartilhadas de shared/. Para adicionar um modo novo
// (ex: associativo), crie a pasta e registre o botão aqui — nada mais.

const MODOS: { value: SimuladorModo; label: string; disabled?: boolean }[] = [
  { value: 'pos_chaves',  label: 'Pós-chaves' },
  { value: 'direto',      label: 'Direto com a Construtora' },
  { value: 'associativo', label: 'Associativo' },
]

export function SimuladorPage() {
  const { profile } = useAuthStore()
  const [modo, setModo] = useState<SimuladorModo>('pos_chaves')

  // Identificação e valor sobrevivem à troca de modo
  const [shared, setShared] = useState<SharedFields>({
    empreendimento: 'Porto Velas 3D',
    cliente: '',
    valorTotal: 758584.61,
  })
  const onShared = (patch: Partial<SharedFields>) => setShared(prev => ({ ...prev, ...patch }))

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-line flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-brand/15 flex items-center justify-center">
          <Calculator size={18} strokeWidth={1.6} className="text-brand" />
        </div>
        <div>
          <h1 className="text-t1 font-bold text-lg leading-tight">Simulador de Fluxo de Pagamento</h1>
          <p className="text-t3 text-sm">Preencha os campos e baixe a proposta pronta para enviar ao cliente</p>
        </div>
      </div>

      {/* Seletor de modo */}
      <div className="px-6 pt-5 flex-shrink-0">
        <div
          className="flex gap-2 flex-wrap max-w-6xl mx-auto"
          role="radiogroup"
          aria-label="Tipo de simulação"
        >
          {MODOS.map(m => (
            <button
              key={m.value}
              type="button"
              disabled={m.disabled}
              onClick={() => !m.disabled && setModo(m.value)}
              role="radio"
              aria-checked={modo === m.value}
              title={m.disabled ? 'Em breve' : undefined}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full font-label text-[11px] uppercase tracking-[0.08em] border transition-all duration-150
                ${m.disabled
                  ? 'bg-s2/40 border-line text-t5 cursor-not-allowed'
                  : modo === m.value
                    ? 'bg-brand-tint border-brand/40 text-brand-text cursor-pointer'
                    : 'bg-s2/60 border-line text-t3 hover:text-t2 hover:border-line-strong cursor-pointer'
                }`}
            >
              {m.disabled && <Lock size={10} strokeWidth={1.6} />}
              {m.label}
              {m.disabled && (
                <span className="font-label text-[9px] normal-case tracking-normal text-t5 bg-s3 px-1.5 py-px rounded-full">
                  Em breve
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Modo ativo */}
      <div className="flex-1 p-6 min-h-0">
        {modo === 'pos_chaves' && (
          <PosChavesSimulator shared={shared} onShared={onShared} corretor={profile?.name ?? ''} />
        )}
        {modo === 'direto' && (
          <DiretoSimulator shared={shared} onShared={onShared} corretor={profile?.name ?? ''} />
        )}
        {modo === 'associativo' && (
          <AssociativoSimulator shared={shared} onShared={onShared} corretor={profile?.name ?? ''} />
        )}
      </div>
    </div>
  )
}
