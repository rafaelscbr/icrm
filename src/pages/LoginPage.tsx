import { useState, useEffect, useId, useRef, FormEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, ArrowRight, ArrowUp,
  WifiOff, ShieldCheck, KeyRound, Info,
} from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'

/**
 * Entrada do iCRM — "Horizonte".
 *
 * A tela é sempre escura, nos dois temas: é o único momento de marca pura do
 * sistema, desenhado com os grafismos do Brand Guide (grade de dados, horizonte
 * e sol em Areia). Os tokens escuros são re-declarados em `.login` no
 * index.css, então as classes de token funcionam mesmo com `html.light`.
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

  const campo =
    'w-full h-12 rounded-[12px] pl-11 text-[15px] text-t1 bg-s2 border ' +
    'placeholder:text-t4 transition-[border-color,box-shadow] duration-150 ' +
    'focus:outline-none focus:ring-[3px] '
  const campoOk  = 'border-line-input hover:border-line-strong focus:border-brand focus:ring-brand/25'
  const campoErr = 'border-error focus:border-error focus:ring-error/25'

  const rotulo = 'font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-t3'

  return (
    <div className="login flex flex-col">
      {/* ── Cena: céu, sol, horizonte, chão em grade, vinheta ─────────────── */}
      <div className="login-cena" aria-hidden>
        <div className="login-ceu" />
        <div className="login-sol-caixa"><div className="login-sol" /></div>
        <div className="login-chao" />
        <div className="login-horizonte" />
        <div className="login-vinheta" />
      </div>

      {/* ── Topo ──────────────────────────────────────────────────────────── */}
      <header className="w-full max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-12 pt-6 sm:pt-8 flex items-center justify-center lg:justify-between">
        <Lockup />
        <span className="hidden lg:inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-t3">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" aria-hidden />
          iCRM · Souza OS
        </span>
      </header>

      {/* ── Conteúdo ──────────────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-10 grid lg:grid-cols-[1fr_minmax(0,440px)] lg:gap-16 xl:gap-24 items-center">

        {/* Manifesto — só em desktop */}
        <section className="hidden lg:block self-start pt-[6vh] max-w-[34rem]" aria-label="Sobre o iCRM">
          <p className="font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-text mb-5">
            Sistema comercial da Souza
          </p>
          <p
            className="font-heading font-extrabold text-t1 tracking-[-0.035em] leading-[1.04] text-[2.75rem] xl:text-[3.4rem]"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            Do primeiro contato à <span className="text-brand-text">chave na mão</span>.
          </p>
          <p className="mt-5 text-[16px] leading-relaxed text-t3 max-w-[30rem]">
            Lead, atendimento, visita, proposta e venda no mesmo lugar — com
            o tempo de resposta sob controle e a próxima ação sempre à vista.
          </p>

          {/* Trilha do funil: diz o que o sistema faz, sem inventar número. */}
          <ol className="relative mt-12 flex justify-between max-w-[30rem]" aria-label="Etapas do funil">
            <span className="absolute left-3 right-3 top-[13px] h-px bg-gradient-to-r from-line-strong to-success/50" aria-hidden />
            {ETAPAS.map(et => (
              <li key={et} className="relative flex flex-col items-center gap-2.5">
                <span className="h-[27px] flex items-center" aria-hidden>
                  <span className="w-[11px] h-[11px] rounded-full border-2 border-t4 bg-page" />
                </span>
                <span className="text-[13px] text-t3">{et}</span>
              </li>
            ))}
            <li className="relative flex flex-col items-center gap-2.5">
              <span className="w-[27px] h-[27px] rounded-full flex items-center justify-center bg-page border border-success/60 shadow-[0_0_0_4px_rgba(52,200,138,0.10)]" aria-hidden>
                <KeyRound size={13} strokeWidth={2} className="text-success" />
              </span>
              <span className="text-[13px] font-semibold text-t1">Venda</span>
            </li>
          </ol>
        </section>

        {/* Cartão de entrada */}
        <section
          className="login-cartao gold-edge w-full max-w-[440px] mx-auto px-6 py-8 sm:px-9 sm:py-10"
          aria-labelledby={ids.titulo}
        >
          <p className={`${rotulo} mb-3`}>Acesso da equipe</p>
          <h1 id={ids.titulo} className="font-heading text-[1.9rem] sm:text-[2.1rem] font-extrabold text-t1 tracking-[-0.03em] leading-[1.1]">
            {ola}.
          </h1>
          <p className="text-[15px] text-t3 mt-2 mb-8">
            Entre com sua conta para abrir o seu funil.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate aria-busy={enviando}>
            {/* E-mail */}
            <div className="flex flex-col gap-2">
              <label htmlFor={ids.email} className={rotulo}>E-mail</label>
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
                  className={`${campo} pr-4 ${errEmail ? campoErr : campoOk}`}
                />
              </div>
              {errEmail && <ErroCampo id={ids.emailErr}>{errEmail}</ErroCampo>}
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={ids.senha} className={rotulo}>Senha</label>
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
                  className={`${campo} pr-14 ${errSenha ? campoErr : campoOk}`}
                />
                <button
                  type="button"
                  onClick={() => setVerSenha(v => !v)}
                  aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={verSenha}
                  aria-controls={ids.senha}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-[10px] text-t4 hover:text-t1 hover:bg-s3 transition-colors cursor-pointer"
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
                <div id={ids.ajuda} className="flex items-start gap-2.5 rounded-[12px] border border-info-line bg-info-bg px-3.5 py-3 text-[13px] leading-relaxed text-t2">
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
                <p className="flex items-start gap-2.5 rounded-[12px] border border-warning-line bg-warning-bg px-3.5 py-3 text-[13px] text-t2">
                  <WifiOff size={15} strokeWidth={1.8} className="text-warning flex-shrink-0 mt-0.5" aria-hidden />
                  <span>Você está sem internet. Assim que a conexão voltar, é só entrar.</span>
                </p>
              )}
              {erro && (
                <p role="alert" className="flex items-start gap-2.5 rounded-[12px] border border-error-line bg-error-bg px-3.5 py-3 text-[13px] text-t1">
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
                shadow-[0_10px_30px_-10px_rgba(228,178,60,0.55)]
                transition-[background-color,transform] duration-150 active:scale-[0.985] cursor-pointer
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

          <p className="mt-8 pt-6 border-t border-line flex items-center justify-center gap-2 text-[13px] text-t4">
            <ShieldCheck size={15} strokeWidth={1.6} aria-hidden />
            Acesso restrito à equipe Souza Imobiliária.
          </p>
        </section>
      </main>

      {/* ── Rodapé ────────────────────────────────────────────────────────── */}
      <footer className="w-full max-w-[1240px] mx-auto px-5 sm:px-8 lg:px-12 pb-6 flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-t4">
        <span>Itajaí · Santa Catarina</span>
        <span>© {ano} Souza Imobiliária</span>
      </footer>
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
        <span className="font-heading text-t1" style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>SOUZA</span>
        <span className="font-heading text-t3 mt-1" style={{ fontWeight: 600, fontSize: 10, letterSpacing: '0.16em' }}>
          IMOBILIÁRIA<span className="text-brand">.</span>
        </span>
      </div>
    </div>
  )
}
