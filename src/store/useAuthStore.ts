import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  name: string
  role: 'admin' | 'broker'
  active: boolean
  avatarUrl?: string
}

interface AuthStore {
  user: { id: string; email: string } | null
  profile: Profile | null
  isAdmin: boolean
  loading: boolean
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  createBroker: (email: string, password: string, name: string) => Promise<string | null>
  fetchAllProfiles: () => Promise<Profile[]>
  updateProfile: (id: string, data: Partial<Pick<Profile, 'name' | 'role' | 'active'>>) => Promise<void>
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (!data) return null
  return {
    id: data.id,
    name: data.name,
    role: data.role as 'admin' | 'broker',
    active: data.active,
    avatarUrl: data.avatar_url ?? undefined,
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const profile = await loadProfile(session.user.id)
      set({
        user: { id: session.user.id, email: session.user.email! },
        profile,
        isAdmin: profile?.role === 'admin',
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

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, isAdmin: false })
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
    const { data, error } = await supabase.from('profiles').select('*').order('created_at')
    if (error) throw error
    return (data ?? []).map(r => ({
      id: r.id,
      name: r.name,
      role: r.role as 'admin' | 'broker',
      active: r.active,
      avatarUrl: r.avatar_url ?? undefined,
    }))
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
}))
