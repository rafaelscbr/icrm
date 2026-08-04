import { useState, FormEvent, useEffect, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Mail, Eye, EyeOff, AlertCircle, Loader2, Target, Zap, LineChart } from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'
import { useThemeStore } from '../store/useThemeStore'
import logoLight from '../assets/logo.png'
import logoDark  from '../assets/logo-dark.png'

/**
 * Entrada do iCRM.
 *
 * Divide a tela em duas: à esquerda o painel de marca (só em desktop), à
 * direita a tarefa. O painel não é enfeite — é o que diferencia a entrada de um
 * sistema proprietário da de um template genérico. Em telas menores ele some
 * inteiro: em celular a única coisa que importa é entrar rápido.
 *
 * Nenhum número aparece aqui de propósito. Métrica na tela de login é
 * decoração, e decoração com número vira dado falso.
 */

const PILLARS = [
  { icon: Zap,       title: 'Resposta em minutos',   text: 'SLA de primeiro contato controlado lead a lead.' },
  { icon: Target,    title: 'Funil sem vazamento',   text: 'Cada etapa com dono, prazo e próxima ação.' },
  { icon: LineChart, title: 'Decisão com número',    text: 'Meta, pipeline e desempenho na mesma tela.' },
]

export function LoginPage() {
  const { login, user } = useAuthStore()
  const { theme } = useThemeStore()
  const navigate  = useNavigate()
  const uid = useId()

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

  const inputClass =
    'w-full rounded-[10px] pl-10 py-3 text-sm text-t1 bg-s2 border border-line-input ' +
    'placeholder:text-t4 transition-colors ' +
    'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25'

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]" style={{ background: 'var(--page-bg)' }}>

      {/* ── Painel de marca — só em desktop ──────────────────────────────── */}
      {/*
        O painel de marca é grafite nos DOIS temas, de propósito. Ele não segue
        --nav-bg: no tema claro a navegação virou branca, e um painel branco ao
        lado de um formulário branco apagaria a composição. O contraste entre
        painel escuro e formulário claro é o que dá a leitura editorial.
      */}
      <aside
        className="hidden lg:flex flex-col justify-between p-12 xl:p-16 relative overflow-hidden texture-grain gold-glow-tl"
        style={{ background: '#14171A' }}
      >
        {/* Filete da marca na borda direita */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px z-10" style={{ background: 'rgba(255,255,255,0.08)' }} aria-hidden />

        <div className="relative flex items-center gap-3">
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-[22%]"
            style={{ width: 38, height: 38, background: '#E4B23C' }}
            aria-hidden
          >
            <span style={{
              fontFamily: "'Sora', system-ui, sans-serif",
              fontWeight: 900, fontSize: 21, color: '#0F1730',
              lineHeight: 1, letterSpacing: '-0.04em',
            }}>S</span>
          </div>
          <div className="flex flex-col leading-none select-none">
            <span style={{
              fontFamily: "'Sora', system-ui, sans-serif",
              fontWeight: 800, fontSize: 16, color: '#F6F3EC', letterSpacing: '-0.01em',
            }}>SOUZA</span>
            <span style={{
              fontFamily: "'Sora', system-ui, sans-serif",
              fontWeight: 600, fontSize: 10, color: 'rgba(246,243,236,0.55)', letterSpacing: '0.14em',
            }}>
              IMOBILIÁRIA<span style={{ color: '#E4B23C' }}>.</span>
            </span>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.18em] mb-5" style={{ color: '#E4B23C' }}>
            iCRM
          </p>
          <h2
            className="text-[2.1rem] xl:text-[2.5rem] leading-[1.12] tracking-[-0.03em] mb-4"
            style={{ fontFamily: "'Sora', system-ui, sans-serif", fontWeight: 800, color: '#F6F3EC' }}
          >
            O sistema operacional comercial da imobiliária.
          </h2>
          <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(246,243,236,0.62)' }}>
            Lead, atendimento, visita, proposta e venda — em um só lugar, com o
            tempo de resposta sob controle.
          </p>

          <ul className="mt-10 flex flex-col gap-5">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(228,178,60,0.12)', border: '1px solid rgba(228,178,60,0.22)' }}
                  aria-hidden
                >
                  <Icon size={16} style={{ color: '#E4B23C' }} strokeWidth={1.7} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: '#F6F3EC' }}>{title}</span>
                  <span className="block text-[13px] mt-0.5" style={{ color: 'rgba(246,243,236,0.55)' }}>{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs" style={{ color: 'rgba(246,243,236,0.38)' }}>
          Itajaí · Santa Catarina — lançamentos e primeiro imóvel
        </p>
      </aside>

      {/* ── Formulário ───────────────────────────────────────────────────── */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[23rem]">
          {/* Logo — só em mobile, onde o painel de marca não existe */}
          <div className="flex justify-center mb-9 lg:hidden">
            <img
              src={theme === 'dark' ? logoLight : logoDark}
              alt="Souza Imobiliária"
              className="h-9 w-auto object-contain"
            />
          </div>

          <h1 className="text-[1.6rem] font-extrabold text-t1 tracking-[-0.025em] leading-tight">
            Bem-vindo de volta
          </h1>
          <p className="text-sm text-t3 mt-1.5 mb-8">
            Entre com sua conta para acessar o iCRM.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            {/* E-mail */}
            <div className="flex flex-col gap-2">
              <label htmlFor={`${uid}-email`} className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t3">
                E-mail
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-t4 pointer-events-none" aria-hidden />
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- página de propósito único: o formulário É a página, e o cursor no e-mail é o que se espera ao chegar */}
                <input autoFocus
                  id={`${uid}-email`}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  aria-invalid={!!error}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-2">
              <label htmlFor={`${uid}-senha`} className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t3">
                Senha
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-t4 pointer-events-none" aria-hidden />
                <input
                  id={`${uid}-senha`}
                  type={showPwd ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={!!error}
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPwd}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-t4 hover:text-t2 hover:bg-s3 transition-colors cursor-pointer"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Erro — anunciado por leitor de tela */}
            <div aria-live="polite" aria-atomic="true">
              {error && (
                <p className="flex items-start gap-2 text-xs text-error bg-error-bg border border-error-line rounded-[10px] px-3 py-2.5" role="alert">
                  <AlertCircle size={14} className="flex-shrink-0 mt-px" aria-hidden />
                  <span>{error}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] flex items-center justify-center gap-2 rounded-[10px] text-sm font-bold
                bg-brand hover:bg-brand-dark transition-colors cursor-pointer
                disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
              style={{ color: 'var(--brand-btn-text)' }}
            >
              {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <p className="text-[11px] text-t4 text-center mt-8">
            Acesso restrito à equipe Souza Imobiliária.
          </p>
        </div>
      </main>
    </div>
  )
}
