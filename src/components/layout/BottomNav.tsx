import { useState, useEffect, useRef } from 'react'
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, UserPlus, Calculator, LayoutGrid, X, Bell, Search,
  ExternalLink, LogOut, ShieldCheck, Sun, Moon,
} from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useSearchStore } from '../../store/useSearchStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useUnreadCount } from '../../store/useNotificationsStore'
import { externalTools as tools, secoesDaGaveta, isGroup, navSections, acoesCriar } from './nav/navConfig'
import type { NavLeaf } from './nav/navConfig'
import { iniciais } from '../../lib/formatters'

/*
 * Navegação do celular — v2 (01/11/2026).
 *
 * A doca tinha seis vagas (Início, Leads, Simulador, Ligações, Tarefas,
 * Avisos e Mais): ícones de 18px espremidos, rótulos de 11px e nenhum
 * destaque — tudo pesava igual. O Rafael pediu três destinos fixos, os que se
 * abrem com o celular na mão o dia inteiro: Início, Leads e o Simulador (usado
 * na frente do cliente). O resto mora em "Mais".
 *
 * Com quatro vagas cada alvo tem ~85px de largura e 64px de altura, o ícone
 * sobe para 22px e o ativo ganha uma pílula atrás do ícone (padrão Material 3)
 * — dá para acertar com o polegar sem olhar.
 *
 * "Mais" abre uma FOLHA de baixo (bottom sheet), não uma gaveta flutuante:
 *  - topo: quem está logado, tema e fechar;
 *  - busca, a única porta do ⌘K no celular;
 *  - Criar: as quatro criações em um toque, sem antes navegar até a tela;
 *  - todas as outras telas em grade de três, por seção;
 *  - ferramentas externas e, separado, Sair.
 * A busca e os avisos também ficam no topo de cada tela (PageLayout), onde o
 * olho procura primeiro.
 */
const fixos = [
  { to: '/',          icon: LayoutDashboard, label: 'Início',    end: true,  chave: 'dashboard' },
  { to: '/leads',     icon: UserPlus,        label: 'Leads',     end: false, chave: 'leads' },
  { to: '/simulador', icon: Calculator,      label: 'Simulador', end: false, chave: 'simulador' },
]

const naBarra = new Set(fixos.map(i => i.to))

/** Rótulo curto para a grade de três colunas (~100px por célula). */
const CURTO: Record<string, string> = {
  disparos: 'Disparos', ligacoes: 'Ligações', imoveis: 'Prontos',
  escritorio: 'Escritório', 'base-leads': 'Base de Leads',
}

/** Folhas por seção, sem prefixo de grupo: a grade mostra o rótulo curto. */
function secoesDaGrade(podeVer: (k: string) => boolean) {
  const comPrefixo = secoesDaGaveta(podeVer, naBarra)
  // secoesDaGaveta prefixa os filhos ("Produtos · Prontos"); aqui o rótulo
  // curto já diz o que é, então voltamos ao rótulo da folha.
  const folhaPorRota = new Map<string, NavLeaf>()
  for (const s of navSections) for (const it of s.items) {
    if (isGroup(it)) it.children.forEach(c => folhaPorRota.set(c.to, c))
    else folhaPorRota.set(it.to, it)
  }
  return comPrefixo.map(s => ({
    label: s.label,
    items: s.items.map(f => {
      const original = folhaPorRota.get(f.to) ?? f
      return { ...original, label: CURTO[original.key] ?? original.label }
    }),
  }))
}

export function BottomNav() {
  const [aberto, setAberto] = useState(false)
  const location  = useLocation()
  const navigate  = useNavigate()
  const { profile, isAdmin, logout } = useAuthStore()
  const setSearchOpen = useSearchStore(s => s.setOpen)
  const { theme, toggle } = useThemeStore()
  const naoLidas = useUnreadCount()
  const fecharRef = useRef<HTMLButtonElement>(null)

  const allowedMenus = profile?.allowedMenus ?? null
  const podeVer = (key: string) => isAdmin || allowedMenus === null || allowedMenus.includes(key)

  const secoes = secoesDaGrade(podeVer)
  const barra = fixos.filter(i => podeVer(i.chave))
  const maisAtivo = secoes.some(s => s.items.some(i => location.pathname === i.to || location.pathname.startsWith(i.to + '/')))
    || location.pathname.startsWith('/notificacoes') || location.pathname.startsWith('/admin')

  // Trocar de tela fecha a folha — inclusive pelo voltar do navegador.
  useEffect(() => { setAberto(false) }, [location.pathname])

  // Esc fecha, o fundo para de rolar e o foco entra na folha.
  useEffect(() => {
    if (!aberto) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setAberto(false) }
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    fecharRef.current?.focus()
    return () => {
      document.body.style.overflow = anterior
      window.removeEventListener('keydown', onKey)
    }
  }, [aberto])

  function sair() {
    setAberto(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      {/* ── Doca ─────────────────────────────────────────────────────── */}
      <nav
        aria-label="Navegação principal"
        className="lg:hidden fixed inset-x-3 z-50 rounded-[24px] doca"
        style={{ bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="grid grid-cols-4 h-16 px-1.5">
          {barra.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className="doca-item">
              {({ isActive }) => (
                <>
                  <span className="doca-icone" data-ativo={isActive}>
                    <Icon size={22} strokeWidth={isActive ? 2.3 : 1.9} aria-hidden />
                  </span>
                  <span className="doca-rotulo" data-ativo={isActive}>{label}</span>
                </>
              )}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setAberto(v => !v)}
            aria-expanded={aberto}
            aria-controls="folha-mais"
            aria-label={naoLidas > 0 ? `Mais — ${naoLidas} aviso${naoLidas !== 1 ? 's' : ''} não lido${naoLidas !== 1 ? 's' : ''}` : 'Mais'}
            className="doca-item"
          >
            <span className="doca-icone relative" data-ativo={aberto || maisAtivo}>
              {aberto ? <X size={22} strokeWidth={2.2} aria-hidden /> : <LayoutGrid size={22} strokeWidth={maisAtivo ? 2.3 : 1.9} aria-hidden />}
              {naoLidas > 0 && !aberto && (
                <span className="absolute top-0.5 right-2.5 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-[color:var(--dock-solid)]" aria-hidden />
              )}
            </span>
            <span className="doca-rotulo" data-ativo={aberto || maisAtivo}>Mais</span>
          </button>
        </div>
      </nav>

      {/* ── Folha "Mais" ─────────────────────────────────────────────── */}
      {aberto && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- fundo da folha: o equivalente por teclado é o Esc, tratado no efeito acima
        <div
          className="lg:hidden fixed inset-0 z-[45] bg-black/45 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={e => { if (e.target === e.currentTarget) setAberto(false) }}
        >
          <div
            id="folha-mais"
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            className="folha-mais absolute inset-x-0 bottom-0 flex flex-col animate-in slide-in-from-bottom-6 duration-200"
          >
            <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
              <span className="w-10 h-1 rounded-full bg-[color:var(--line-strong)]" />
            </div>

            <div className="overflow-y-auto overscroll-contain px-4 pb-[calc(96px+env(safe-area-inset-bottom,0px))]">
              {/* Quem está logado · avisos · tema · fechar */}
              <div className="flex items-center gap-3 py-2">
                <span className="w-10 h-10 rounded-full bg-brand-fill text-brand-fill-text flex items-center justify-center text-[14px] font-bold shrink-0" aria-hidden>
                  {iniciais(profile?.name) || 'U'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-t1 truncate">{profile?.name ?? 'Usuário'}</p>
                  <p className="text-[12.5px] text-t4">{isAdmin ? 'Administrador' : 'Corretor'}</p>
                </div>
                <Link to="/notificacoes" className="folha-icone relative"
                  aria-label={naoLidas > 0 ? `Avisos — ${naoLidas} não lido${naoLidas !== 1 ? 's' : ''}` : 'Avisos'}>
                  <Bell size={20} strokeWidth={1.9} aria-hidden />
                  {naoLidas > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-fill text-brand-fill-text text-[11px] font-bold flex items-center justify-center tabular-nums" aria-hidden>
                      {naoLidas > 9 ? '9+' : naoLidas}
                    </span>
                  )}
                </Link>
                <button type="button" onClick={toggle} className="folha-icone"
                  aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
                  {theme === 'dark' ? <Sun size={20} strokeWidth={1.9} aria-hidden /> : <Moon size={20} strokeWidth={1.9} aria-hidden />}
                </button>
                <button ref={fecharRef} type="button" onClick={() => setAberto(false)} className="folha-icone" aria-label="Fechar">
                  <X size={20} strokeWidth={2} aria-hidden />
                </button>
              </div>

              {/* Busca */}
              <button
                type="button"
                onClick={() => { setAberto(false); setSearchOpen(true) }}
                className="mt-2 w-full flex items-center gap-3 px-4 h-12 rounded-[14px] bg-s2 text-left active:scale-[0.99] transition-transform"
              >
                <Search size={18} strokeWidth={1.9} className="text-t4 shrink-0" aria-hidden />
                <span className="text-[15px] text-t4">Buscar contatos, imóveis, leads…</span>
              </button>

              {/* Criar */}
              <p className="folha-secao">Criar</p>
              <div className="grid grid-cols-4 gap-2">
                {acoesCriar.map(a => (
                  <Link key={a.to} to={a.to} className="folha-acao">
                    <span className="folha-acao-icone"><a.icon size={20} strokeWidth={1.9} aria-hidden /></span>
                    <span className="text-[12.5px] font-medium text-t2">{a.curto}</span>
                  </Link>
                ))}
              </div>

              {/* Telas */}
              {secoes.map(sec => (
                <div key={sec.label}>
                  <p className="folha-secao">{sec.label}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {sec.items.map(({ to, icon: Icon, label, end }) => (
                      <NavLink key={to} to={to} end={end} className="folha-tela">
                        {({ isActive }) => (
                          <>
                            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden
                                  style={{ color: isActive ? 'var(--brand-text)' : 'var(--t3)' }} />
                            <span className={`text-[13px] leading-tight text-center ${isActive ? 'font-semibold text-t1' : 'font-medium text-t2'}`}>
                              {label}
                            </span>
                          </>
                        )}
                      </NavLink>
                    ))}
                    {sec.label === 'Operação' && isAdmin && (
                      <NavLink to="/admin" className="folha-tela">
                        {({ isActive }) => (
                          <>
                            <ShieldCheck size={20} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden
                                         style={{ color: isActive ? 'var(--brand-text)' : 'var(--t3)' }} />
                            <span className={`text-[13px] leading-tight ${isActive ? 'font-semibold text-t1' : 'font-medium text-t2'}`}>Admin</span>
                          </>
                        )}
                      </NavLink>
                    )}
                  </div>
                </div>
              ))}

              {/* Ferramentas externas */}
              <p className="folha-secao">Ferramentas</p>
              <div className="rounded-[14px] bg-s2 overflow-hidden">
                {tools.map(({ label, href, icon: Icon }) => (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-3 px-4 min-h-[48px] border-b border-line last:border-0 active:bg-s3 transition-colors">
                    <Icon size={18} strokeWidth={1.8} className="text-t3 shrink-0" aria-hidden />
                    <span className="flex-1 text-[14.5px] text-t2">{label}</span>
                    <ExternalLink size={14} strokeWidth={1.8} className="text-t4" aria-hidden />
                  </a>
                ))}
              </div>

              {/* Sair — separado do resto */}
              <button
                type="button"
                onClick={sair}
                className="mt-6 w-full flex items-center justify-center gap-2 h-12 rounded-[14px] text-[15px] font-medium text-error active:bg-error-bg transition-colors"
              >
                <LogOut size={18} strokeWidth={1.9} aria-hidden /> Sair da conta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
