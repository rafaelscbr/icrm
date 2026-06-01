import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  name: string
  role: 'admin' | 'broker'
  active: boolean
  avatarUrl?: string
  allowedMenus: string[] | null  // null = todos os menus liberados
}

interface AuthStore {
  user: { id: string; email: string } | null
  profile: Profile | null
  isAdmin: boolean
  loading: boolean
  allProfiles: Profile[]
  viewAsBrokerId: string | null
  setViewAsBroker: (id: string | null) => void
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<string | null>
  logout: () => void
  createBroker: (email: string, password: string, name: string) => Promise<string | null>
  fetchAllProfiles: () => Promise<Profile[]>
  updateProfile: (id: string, data: Partial<Pick<Profile, 'name' | 'role' | 'active'>>) => Promise<void>
  updateBrokerMenus: (brokerId: string, menus: string[] | null) => Promise<void>
}

function mapProfile(r: Record<string, unknown>): Profile {
  return {
    id: r.id as string,
    name: r.name as string,
    role: r.role as 'admin' | 'broker',
    active: r.active as boolean,
    avatarUrl: (r.avatar_url as string | null) ?? undefined,
    allowedMenus: (r.allowed_menus as string[] | null) ?? null,
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (!data) return null
  return mapProfile(data)
}

async function fetchProfiles(): Promise<Profile[]> {
  const { data } = await supabase.from('profiles').select('*').order('created_at')
  return (data ?? []).map(mapProfile)
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  allProfiles: [],
  viewAsBrokerId: null,
  setViewAsBroker: (id) => set({ viewAsBrokerId: id }),

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const profile = await loadProfile(session.user.id)
      const isAdmin = profile?.role === 'admin'
      const allProfiles = isAdmin ? await fetchProfiles() : []
      set({
        user: { id: session.user.id, email: session.user.email! },
        profile,
        isAdmin,
        allProfiles,
        loading: false,
      })
    } else {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await loadProfile(session.user.id)
        set({
          user: { id: session.user.id, email: session.user.email! },
          profile,
          isAdmin: profile?.role === 'admin',
        })
      } else {
        set({ user: null, profile: null, isAdmin: false })
      }
    })
  },

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  },

  logout: () => {
    // 1. Limpa estado local IMEDIATAMENTE (síncrono) — usuário sai na hora
    set({ user: null, profile: null, isAdmin: false, allProfiles: [], viewAsBrokerId: null })

    // 2. Remove canais realtime em background
    try { supabase.getChannels().forEach(c => supabase.removeChannel(c)) } catch (_) {}

    // 3. Dispara signOut no servidor em background — não bloqueia a UI
    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  },

  createBroker: async (email, password, name) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: 'broker' } },
    })
    return error ? error.message : null
  },

  fetchAllProfiles: async () => {
    const profiles = await fetchProfiles()
    set({ allProfiles: profiles })
    return profiles
  },

  updateProfile: async (id, data) => {
    const { error } = await supabase
      .from('profiles')
      .update({
        ...(data.name     !== undefined && { name:       data.name     }),
        ...(data.role     !== undefined && { role:       data.role     }),
        ...(data.active   !== undefined && { active:     data.active   }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
  },

  updateBrokerMenus: async (brokerId, menus) => {
    const { error } = await supabase
      .from('profiles')
      .update({ allowed_menus: menus, updated_at: new Date().toISOString() })
      .eq('id', brokerId)
    if (error) throw error
  },
}))
