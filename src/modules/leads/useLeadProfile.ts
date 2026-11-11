import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/db'
import type { LeadProfile } from '../../types'

/**
 * Perfil declarado do lead (RPC lead_profile) — uma leitura por ficha aberta.
 *
 * Mora na ficha, e não em cada painel: o perfil agora aparece no Resumo, as
 * listas em Produtos e os formulários no Histórico. Cada painel buscando por
 * conta própria seria a mesma consulta três vezes.
 */
export function useLeadProfile(leadId: string) {
  const [data, setData]       = useState<LeadProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState(false)

  const recarregar = useCallback(() => {
    setLoading(true); setErro(false)
    return db.leads.profile(leadId)
      .then(r => setData(r))
      .catch(() => setErro(true))
      .finally(() => setLoading(false))
  }, [leadId])

  useEffect(() => {
    let vivo = true
    setLoading(true); setErro(false)
    db.leads.profile(leadId)
      .then(r => { if (vivo) setData(r) })
      .catch(() => { if (vivo) setErro(true) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [leadId])

  return { data, loading, erro, recarregar }
}

export type PerfilDoLead = ReturnType<typeof useLeadProfile>
