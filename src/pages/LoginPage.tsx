import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Mail, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'
import { useThemeStore } from '../store/useThemeStore'
import logoLight from '../assets/logo.png'
import logoDark  from '../assets/logo-dark.png'

export function LoginPage() {
  const { login, user } = useAuthStore()
  const { theme } = useThemeStore()
  const navigate  = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await login(email.trim(), password)
    setLoading(false)
    if (err) {
      setError(err === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--page-bg)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src={theme === 'dark' ? logoLight : logoDark}
            alt="Logo"
            className="h-10 w-auto object-contain"
          />
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 border"
          style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
        >
          <h1 className="text-lg font-bold text-t1 mb-1">Entrar</h1>
          <p className="text-sm text-t3 mb-6">Acesse sua conta para continuar.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* E-mail */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-t3 uppercase tracking-wider">E-mail</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t4" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
              </div>
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-t3 uppercase tracking-wider">Senha</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t4" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-10 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-t4 hover:text-t2 transition-colors"
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'var(--brand)' }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
