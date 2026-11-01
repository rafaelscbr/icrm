import { useState, useEffect, useId, useRef, FormEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, ArrowRight, ArrowUp,
  WifiOff, ShieldCheck, KeyRound, Info, Sun, Moon,
} from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'
import { useThemeStore } from '../store/useThemeStore'
import { Destaque } from '../components/shared/Destaque'

/**
 * Entrada do iCRM — v2 "Folha e marca" (01/11/2026).
 *
 * Até aqui a entrada era sempre escura, nos dois temas. O Rafael gostou do
 * claro e quis a entrada nele também: agora a tela segue o tema escolhido
 * (com o botão de sol/lua no canto, como no resto do sistema) e só o painel
 * de marca, à esquerda, é sempre Marinho — é ele que carrega a identidade,
 * com a planta em grade e a palavra "chave" em Instrument Serif dourada.
 * O formulário mora na folha do tema: Papel no claro, Marinho no escuro.
 *
 * No celular o painel de marca vira uma faixa curta no topo e o formulário
 * vem logo abaixo, sem rolar para achar o botão.
 *
 * O formulário segue o que se espera de uma entrada séria:
 *  - rótulo sempre visível, erro embaixo do campo e ligado por aria-describedby;
 *  - validação no envio e no blur, nunca a cada tecla;
 *  - foco vai para o primeiro campo com problema;
 *  - aviso de Caps Lock na senha — a causa nº 1 de "senha incorreta";
 *  - colar e gerenciador de senha liberados (WCAG 2.2 · 3.3.8);
 *  - erro do servidor traduzido e com o caminho de saída escrito.
 *
 * Nenhum número aparece aqui de propósito. Métrica na tela de login é
 * decoração, e decoração com número vira dado falso.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ETAPAS = ['Lead', 'Atendimento', 'Visita', 'Proposta'] as const

function saudacao(d = new Date()) {
  const h = d.getHours()
  if (h >= 5 && h < 12) return 'Bom dia'
  if (h >= 12 && h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Erro do Supabase → frase com causa e saída. */
function traduzErro(msg: string): string {
  if (msg === 'Invalid login credentials') return 'E-mail ou senha incorretos. Confira os dois e tente de novo.'
  if (/email not confirmed/i.test(msg))    return 'Este e-mail ainda não foi confirmado. Peça ao administrador para liberar o acesso.'
  if (/rate limit|too many/i.test(msg))    return 'Muitas tentativas seguidas. Aguarde um minuto antes de tentar de novo.'
  if (/fetch|network/i.test(msg))          return 'Não foi possível falar com o servidor. Verifique sua internet e tente de novo.'
  return msg
}

function validaEmail(v: string) {
  if (!v.trim()) return 'Informe seu e-mail.'
  if (!EMAIL_RE.test(v.trim())) return 'Digite um e-mail válido, como nome@empresa.com.'
  return ''
}
function validaSenha(v: string) {
  return v ? '' : 'Informe sua senha.'
}

export function LoginPage() {
  const { login, user } = useAuthStore()
  const navigate = useNavigate()
  const uid = useId()
  const ids = {
    email:     `${uid}-email`,
    emailErr:  `${uid}-email-err`,
    senha:     `${uid}-senha`,
    senhaErr:  `${uid}-senha-err`,
    caps:      `${uid}-caps`,
    ajuda:     `${uid}-ajuda`,
    titulo:    `${uid}-titulo`,
  }

  const emailRef = useRef<HTMLInputElement>(null)
  const senhaRef = useRef<HTMLInputElement>(null)

  const [email,     setEmail]     = useState('')
  const [senha,     setSenha]     = useState('')
  const [verSenha,  setVerSenha]  = useState(false)
  const [errEmail,  setErrEmail]  = useState('')
  const [errSenha,  setErrSenha]  = useState('')
  const [erro,      setErro]      = useState('')
  const [enviando,  setEnviando]  = useState(false)
  const [capsLock,  setCapsLock]  = useState(false)
  const [ajuda,     setAjuda]     = useState(false)
  const [online,    setOnline]    = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  const [ola] = useState(saudacao)
  const ano = new Date().getFullYear()

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  // Foco automático só com mouse/trackpad: no celular ele abriria o teclado
  // por cima da tela antes de a pessoa ver onde está.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) emailRef.current?.focus()
  }, [])

  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  function lerCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setErro('')

    const eEmail = validaEmail(email)
    const eSenha = validaSenha(senha)
    setErrEmail(eEmail)
    setErrSenha(eSenha)
    if (eEmail) { emailRef.current?.focus(); return }
    if (eSenha) { senhaRef.current?.focus(); return }

    setEnviando(true)
    const err = await login(email.trim(), senha)
    setEnviando(false)
    if (err) {
      setErro(traduzErro(err))
      // Credencial errada quase sempre é a senha: devolve o foco já selecionada.
      if (err === 'Invalid login credentials') {
        senhaRef.current?.focus()
        senhaRef.current?.select()
      }
    }
  }

  const { theme, toggle } = useThemeStore()
  const [olaInicio, olaFim] = ola.split(' ')

  const campo = 'campo w-full h-12 pl-11 text-[15px] placeholder:text-t4'

  return (
    <div className="login">
      {/* ── Painel de marca — sempre Marinho ─────────────────────────────── */}
      <aside className="login-marca" aria-label="Sobre o iCRM">
        <div className="login-marca-cena" aria-hidden>
          <div className="login-grade" />
          <div className="login-luz" />
        </div>

        <Lockup />

        <div className="login-manifesto">
          <p className="hidden lg:block font-label text-[12px] font-semibold uppercase tracking-[0.18em] text-[color:var(--m-t3)] mb-5">
            Sistema comercial da Souza
          </p>
          <p
            className="font-display font-bold tracking-[-0.025em] leading-[1.06] text-[1.65rem] sm:text-[2rem] lg:text-[3rem] xl:text-[3.5rem] text-[color:var(--m-t1)]"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            Do primeiro contato à <Destaque>chave</Destaque> na mão.
          </p>
          <p className="hidden lg:block mt-5 text-[16px] leading-relaxed max-w-[30rem] text-[color:var(--m-t3)]">
            Lead, atendimento, visita, proposta e venda no mesmo lugar — com
            o tempo de resposta sob controle e a próxima ação sempre à vista.
          </p>

          {/* Trilha do funil: diz o que o sistema faz, sem inventar número. */}
          <ol className="hidden lg:flex relative mt-12 justify-between max-w-[30rem]" aria-label="Etapas do funil">
            <span className="absolute left-3 right-3 top-[13px] h-px" style={{ background: 'linear-gradient(90deg, var(--m-line), rgba(52,200,138,0.5))' }} aria-hidden />
            {ETAPAS.map(et => (
              <li key={et} className="relative flex flex-col items-center gap-2.5">
                <span className="h-[27px] flex items-center" aria-hidden>
                  <span className="w-[11px] h-[11px] rounded-full border-2" style={{ borderColor: 'var(--m-t4)', background: '#0B1A3A' }} />
                </span>
                <span className="text-[13px] text-[color:var(--m-t3)]">{et}</span>
              </li>
            ))}
            <li className="relative flex flex-col items-center gap-2.5">
              <span className="w-[27px] h-[27px] rounded-full flex items-center justify-center border" style={{ background: '#0B1A3A', borderColor: 'rgba(52,200,138,0.6)', boxShadow: '0 0 0 4px rgba(52,200,138,0.10)' }} aria-hidden>
                <KeyRound size={13} strokeWidth={2} style={{ color: '#34C88A' }} />
              </span>
              <span className="text-[13px] font-semibold text-[color:var(--m-t1)]">Venda</span>
            </li>
          </ol>
        </div>

        <p className="hidden lg:block text-[12.5px] text-[color:var(--m-t4)]">Itajaí · Santa Catarina</p>
      </aside>

      {/* ── Folha do formulário — segue o tema ──────────────────────────── */}
      <main className="login-folha">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            className="w-11 h-11 flex items-center justify-center rounded-full text-t3 hover:text-t1 hover:bg-s2 transition-colors cursor-pointer
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
          </button>
        </div>

        <section className="login-cartao w-full max-w-[400px] mx-auto my-auto" aria-labelledby={ids.titulo}>
          <p className="text-[13px] font-medium text-t4 mb-2">Acesso da equipe</p>
          <h1 id={ids.titulo} className="font-display text-[2.2rem] sm:text-[2.5rem] font-bold text-t1 tracking-[-0.025em] leading-[1.05]">
            {olaInicio} <Destaque>{olaFim}</Destaque>.
          </h1>
          <p className="text-[15px] text-t3 mt-2 mb-8">
            Entre com sua conta para abrir o seu funil.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate aria-busy={enviando}>
            {/* E-mail */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.email} className="rotulo-campo">E-mail</label>
              <div className="relative">
                <Mail size={17} strokeWidth={1.6} className="absolute left-4 top-1/2 -translate-y-1/2 text-t4 pointer-events-none" aria-hidden />
                <input
                  ref={emailRef}
                  id={ids.email}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  required
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (errEmail) setErrEmail(validaEmail(e.target.value)) }}
                  onBlur={() => { if (email) setErrEmail(validaEmail(email)) }}
                  placeholder="nome@empresa.com"
                  aria-invalid={!!errEmail}
                  aria-describedby={errEmail ? ids.emailErr : undefined}
                  className={`${campo} pr-4`}
                />
              </div>
              {errEmail && <ErroCampo id={ids.emailErr}>{errEmail}</ErroCampo>}
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={ids.senha} className="rotulo-campo">Senha</label>
                <button
                  type="button"
                  onClick={() => setAjuda(v => !v)}
                  aria-expanded={ajuda}
                  aria-controls={ids.ajuda}
                  className="text-[13px] font-medium text-brand-text hover:underline underline-offset-4 rounded-md px-1 -mx-1 min-h-[24px] cursor-pointer"
                >
                  Esqueci a senha
                </button>
              </div>
              <div className="relative">
                <Lock size={17} strokeWidth={1.6} className="absolute left-4 top-1/2 -translate-y-1/2 text-t4 pointer-events-none" aria-hidden />
                <input
                  ref={senhaRef}
                  id={ids.senha}
                  name="password"
                  type={verSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  required
                  value={senha}
                  onChange={e => { setSenha(e.target.value); if (errSenha) setErrSenha(validaSenha(e.target.value)) }}
                  onKeyDown={lerCapsLock}
                  onKeyUp={lerCapsLock}
                  onBlur={() => setCapsLock(false)}
                  placeholder="Sua senha"
                  aria-invalid={!!errSenha}
                  aria-describedby={[errSenha && ids.senhaErr, capsLock && ids.caps].filter(Boolean).join(' ') || undefined}
                  className={`${campo} pr-14`}
                />
                <button
                  type="button"
                  onClick={() => setVerSenha(v => !v)}
                  aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={verSenha}
                  aria-controls={ids.senha}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-[10px] text-t4 hover:text-t1 transition-colors cursor-pointer"
                >
                  {verSenha ? <EyeOff size={18} strokeWidth={1.6} /> : <Eye size={18} strokeWidth={1.6} />}
                </button>
              </div>
              {errSenha && <ErroCampo id={ids.senhaErr}>{errSenha}</ErroCampo>}
              {capsLock && (
                <p id={ids.caps} className="flex items-center gap-2 text-[13px] text-warning">
                  <ArrowUp size={14} strokeWidth={2} className="flex-shrink-0" aria-hidden />
                  Caps Lock está ligado.
                </p>
              )}
              {ajuda && (
                <div id={ids.ajuda} className="flex items-start gap-2.5 rounded-[12px] bg-info-bg px-3.5 py-3 text-[13px] leading-relaxed text-t2">
                  <Info size={15} strokeWidth={1.8} className="text-info flex-shrink-0 mt-0.5" aria-hidden />
                  <span>
                    A senha é redefinida pelo administrador do iCRM. Peça a ele um
                    novo acesso e entre com a senha que ele enviar.
                  </span>
                </div>
              )}
            </div>

            {/* Erro do envio e estado da conexão — anunciados por leitor de tela */}
            <div aria-live="polite" aria-atomic="true" className="empty:hidden flex flex-col gap-2">
              {!online && (
                <p className="flex items-start gap-2.5 rounded-[12px] bg-warning-bg px-3.5 py-3 text-[13px] text-t2">
                  <WifiOff size={15} strokeWidth={1.8} className="text-warning flex-shrink-0 mt-0.5" aria-hidden />
                  <span>Você está sem internet. Assim que a conexão voltar, é só entrar.</span>
                </p>
              )}
              {erro && (
                <p role="alert" className="flex items-start gap-2.5 rounded-[12px] bg-error-bg px-3.5 py-3 text-[13px] text-t1">
                  <AlertCircle size={15} strokeWidth={1.8} className="text-error flex-shrink-0 mt-0.5" aria-hidden />
                  <span>{erro}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="group mt-1 w-full h-[52px] flex items-center justify-center gap-2 rounded-[12px] text-[15px] font-bold
                bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover
                shadow-[0_10px_30px_-12px_rgba(214,178,110,0.6)]
                transition-[background-color,transform] duration-150 active:scale-[0.985] cursor-pointer
                focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand/50
                disabled:opacity-70 disabled:cursor-wait"
            >
              {enviando ? (
                <>
                  <Loader2 size={17} className="animate-spin" aria-hidden />
                  Entrando…
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight size={17} strokeWidth={2} className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                </>
              )}
            </button>
          </form>
        </section>

        <footer className="flex flex-col sm:flex-row items-center justify-between gap-1.5 text-[12.5px] text-t4 pt-8">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={14} strokeWidth={1.6} aria-hidden />
            Acesso restrito à equipe Souza Imobiliária
          </span>
          <span>© {ano}</span>
        </footer>
      </main>
    </div>
  )
}

function ErroCampo({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-[13px] text-error">
      <AlertCircle size={14} strokeWidth={1.8} className="flex-shrink-0" aria-hidden />
      {children}
    </p>
  )
}

/** Lockup oficial: "S" em quadrado Areia (radius 24%) + SOUZA / IMOBILIÁRIA. */
function Lockup() {
  return (
    <div className="flex items-center gap-3 select-none" role="img" aria-label="Souza Imobiliária">
      <div
        className="flex-shrink-0 flex items-center justify-center bg-brand-fill"
        style={{ width: 38, height: 38, borderRadius: '24%' }}
        aria-hidden
      >
        <span className="font-heading text-brand-fill-text" style={{ fontWeight: 800, fontSize: 21, lineHeight: 1, letterSpacing: '-0.04em' }}>
          S
        </span>
      </div>
      <div className="flex flex-col leading-none" aria-hidden>
        <span className="font-heading" style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em', color: 'var(--m-t1)' }}>SOUZA</span>
        <span className="font-heading mt-1" style={{ fontWeight: 600, fontSize: 10, letterSpacing: '0.16em', color: 'var(--m-t3)' }}>
          IMOBILIÁRIA<span className="text-brand">.</span>
        </span>
      </div>
    </div>
  )
}
