/**
 * useAdminView — modelo consistente de visão do administrador.
 *
 * Três modos:
 *   global  → viewAsBrokerId = null   → admin vê TODOS os dados da empresa
 *   own     → viewAsBrokerId = profile.id → admin vê seus próprios dados como corretor
 *   broker  → viewAsBrokerId = <id>   → admin vê dados de um corretor específico
 *
 * Para corretores comuns (não-admin), sempre retorna effectiveBrokerId = profile.id.
 *
 * Uso:
 *   const { isGlobalView, effectiveBrokerId } = useAdminView()
 *   const myLeads = isGlobalView ? allLeads : allLeads.filter(l => l.brokerId === effectiveBrokerId)
 */

import { useAuthStore } from '../store/useAuthStore'

export interface AdminViewResult {
  /** true quando admin está na visão global (todos os dados da empresa) */
  isGlobalView: boolean
  /** ID do broker ativo para filtragem; null = visão global */
  effectiveBrokerId: string | null
  /** true quando admin está vendo seus próprios dados como corretor */
  isOwnView: boolean
  /** true quando admin está vendo os dados de um corretor específico (≠ si mesmo) */
  isBrokerView: boolean
}

export function useAdminView(): AdminViewResult {
  const { isAdmin, profile, viewAsBrokerId } = useAuthStore()

  if (!isAdmin) {
    return {
      isGlobalView: false,
      effectiveBrokerId: profile?.id ?? null,
      isOwnView: true,
      isBrokerView: false,
    }
  }

  // Admin sem seleção → visão global
  if (viewAsBrokerId === null) {
    return {
      isGlobalView: true,
      effectiveBrokerId: null,
      isOwnView: false,
      isBrokerView: false,
    }
  }

  const isOwnView = viewAsBrokerId === profile?.id

  return {
    isGlobalView: false,
    effectiveBrokerId: viewAsBrokerId,
    isOwnView,
    isBrokerView: !isOwnView,
  }
}

/**
 * Filtra um array por brokerId usando o modelo de visão do admin.
 * Se isGlobalView, retorna o array completo.
 * Caso contrário, filtra por effectiveBrokerId.
 */
export function filterByView<T extends { brokerId?: string | null }>(
  items: T[],
  view: AdminViewResult
): T[] {
  if (view.isGlobalView || view.effectiveBrokerId === null) return items
  return items.filter(i => i.brokerId === view.effectiveBrokerId)
}
