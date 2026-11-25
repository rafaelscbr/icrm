import { useCallback, useEffect, useMemo } from 'react'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { fmtTaxa, slugLegivel, taxa } from './conversao'

/**
 * Por que os leads saem: os motivos de descarte do recorte, mais frequente
 * primeiro. A mesma peça na aba Conversão e na dashboard.
 */

const n = (x: number) => x.toLocaleString('pt-BR')

/** O nome do motivo como está nas configurações; sem cadastro, o slug legível. */
export function useNomeDoMotivo() {
  const getByType = useLeadConfigStore(s => s.getByType)
  const load = useLeadConfigStore(s => s.load)
  const items = useLeadConfigStore(s => s.items)
  useEffect(() => { void load() }, [load])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `items` refaz a lista quando a config chega
  const motivos = useMemo(() => getByType('discard_reason'), [getByType, items])
  return useCallback(
    (slug: string) => motivos.find(m => m.slug === slug)?.label ?? slugLegivel(slug),
    [motivos],
  )
}

export function MotivosDeDescarte({ lista, descartados, recebidos, nomeMotivo }: {
  lista: { motivo: string; n: number }[]
  /** total de descartados no recorte (base do %) */
  descartados: number
  /** leads que chegaram no recorte — para dizer quanto dos leads saiu */
  recebidos?: number
  nomeMotivo: (slug: string) => string
}) {
  if (lista.length === 0) return <p className="text-[14px] text-t4 py-2">Nenhum descarte.</p>
  return (
    <div className="flex flex-col gap-4">
      {recebidos !== undefined && (
        <p className="text-[13px] text-t3 tabular-nums">
          <span className="font-semibold text-t1">{n(descartados)}</span> descartados
          <span className="text-t4"> · {fmtTaxa(taxa(descartados, recebidos))} dos {n(recebidos)} leads que chegaram</span>
        </p>
      )}
      <ul className="flex flex-col gap-3.5">
        {lista.map(m => (
          <li key={m.motivo}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-[13.5px] text-t2 truncate">{nomeMotivo(m.motivo)}</span>
              <span className="text-[13px] text-t3 tabular-nums shrink-0">
                <b className="font-semibold text-t1">{n(m.n)}</b> · {fmtTaxa(taxa(m.n, descartados))}
              </span>
            </div>
            <span className="block h-1.5 rounded-full bg-s2 overflow-hidden" aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (m.n / lista[0].n) * 100)}%`, background: '#9AA6BD' }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
