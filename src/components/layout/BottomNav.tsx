import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, TrendingUp, CheckSquare, MoreHorizontal,
  X, Bell, Search, ExternalLink, Plus, LogOut, ShieldCheck,
} from 'lucide-react'
import { TaskForm } from '../../modules/tasks/TaskForm'
import { useAuthStore } from '../../store/useAuthStore'
import { useSearchStore } from '../../store/useSearchStore'
import { useUnreadCount } from '../../store/useNotificationsStore'
import { externalTools as tools, secoesDaGaveta, isGroup, navSections } from './nav/navConfig'

const mainNav = [
  { to: '/',         icon: LayoutDashboard, label: 'Início',   end: true  },
  { to: '/contatos', icon: Users,           label: 'Contatos', end: false },
  { to: '/vendas',   icon: TrendingUp,      label: 'Vendas',   end: false },
  { to: '/tarefas',  icon: CheckSquare,     label: 'Tarefas',  end: false },
]

const naBarra = new Set(mainNav.map(i => i.to))

/** Os quatro atalhos fixos também respeitam a permissão. */
function chaveDaRota(to: string): string {
  for (const s of navSections) {
    for (const item of s.items) {
      if (isGroup(item)) {
        const filho = item.children.find(c => c.to === to)
        if (filho) return filho.key
      } else if (item.to === to) {
        return item.key
      }
    }
  }
  return ''
}

export function BottomNav() {
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const location  = useLocation()
  const navigate  = useNavigate()
  const { profile, isAdmin, logout } = useAuthStore()
  const setSearchOpen = useSearchStore(s => s.setOpen)
  const unreadCount = useUnreadCount()

  const initial = (profile?.name ?? 'U').charAt(0).toUpperCase()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const allowedMenus = profile?.allowedMenus ?? null
  const podeVer = (key: string) =>
    isAdmin || allowedMenus === null || allowedMenus.includes(key)

  /*
   * A gaveta é o complemento da barra: tudo que existe na Sidebar e não coube
   * nos quatro atalhos de baixo.
   *
   * Vinha de uma lista escrita à mão, e ela já tinha derivado da Sidebar em dois
   * pontos: o Simulador nunca chegou a aparecer no mobile (tela sem nenhuma porta
   * de entrada no celular), e as telas restritas por `allowedMenus` apareciam
   * para todo mundo — o filtro de permissão só existia no desktop, e não há
   * guarda nas rotas. Agora ambos saem da mesma fonte, com o mesmo filtro.
   */
  const moreSections = secoesDaGaveta(podeVer, naBarra)
  const barraVisivel = mainNav.filter(i => podeVer(chaveDaRota(i.to)))
  const isMoreActive = moreSections.some(s => s.items.some(i => location.pathname === i.to))

  // Escape fecha a gaveta, e o fundo da página para de rolar enquanto ela está
  // aberta — sem isso o dedo arrastava a lista de trás por baixo do painel.
  useEffect(() => {
    if (!drawerOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = anterior
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  return (
    <>
      {/* ── FAB nova tarefa ──────────────────────────────────────── */}
      <button
        onClick={() => setTaskFormOpen(true)}
        className="lg:hidden fixed right-4 z-50 w-12 h-12 rounded-full bg-brand hover:bg-brand-dark active:scale-95 flex items-center justify-center shadow-brand text-[var(--brand-btn-text)] transition-all duration-150"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        title="Nova tarefa"
      >
        <Plus size={20} strokeWidth={2.5} />
      </button>

      {/* ── Bottom bar ───────────────────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40"
        style={{
          background: 'var(--nav-bg)',
          borderTop: '1px solid var(--nav-line)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex items-center justify-around h-16 px-1">
          {barraVisivel.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setDrawerOpen(false)}
              className="flex flex-col items-center justify-center gap-1 flex-1 h-full px-1 rounded-xl transition-all duration-150 active:scale-95"
            >
              {({ isActive }) => (
                <>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                    style={{ background: isActive ? 'var(--brand-tint)' : 'transparent' }}
                  >
                    <Icon
                      size={18}
                      strokeWidth={isActive ? 2.5 : 2}
                      style={{ color: isActive ? 'var(--brand)' : 'var(--nav-muted)' }}
                    />
                  </div>
                  <span
                    className="text-[11px] font-medium leading-none"
                    style={{ color: isActive ? 'var(--brand-text)' : 'var(--nav-muted)' }}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* Notificações — sino sempre visível com contagem de não lidas */}
          <NavLink
            to="/notificacoes"
            onClick={() => setDrawerOpen(false)}
            aria-label={unreadCount > 0
              ? `Notificações — ${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}`
              : 'Notificações'}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full px-1 rounded-xl transition-all duration-150 active:scale-95"
          >
            {({ isActive }) => (
              <>
                <div
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{ background: isActive ? 'var(--brand-tint)' : 'transparent' }}
                >
                  <Bell
                    size={18}
                    strokeWidth={isActive ? 2.5 : 2}
                    style={{ color: isActive || unreadCount > 0 ? 'var(--brand)' : 'var(--nav-muted)' }}
                  />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-brand text-[var(--brand-btn-text)] text-[11px] font-bold flex items-center justify-center tabular-nums leading-none"
                      aria-hidden="true"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <span
                  className="text-[11px] font-medium leading-none max-w-full truncate"
                  style={{ color: isActive ? 'var(--brand-text)' : 'var(--nav-muted)' }}
                >
                  Avisos
                </span>
              </>
            )}
          </NavLink>

          {/* Mais */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full px-1 rounded-xl transition-all duration-150 active:scale-95"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
              style={{ background: drawerOpen || isMoreActive ? 'var(--brand-tint)' : 'transparent' }}
            >
              {drawerOpen
                ? <X size={18} style={{ color: 'var(--brand)' }} strokeWidth={2.5} />
                : <MoreHorizontal size={18} style={{ color: isMoreActive ? 'var(--brand)' : 'var(--nav-muted)' }} strokeWidth={2} />
              }
            </div>
            <span
              className="text-[11px] font-medium leading-none"
              style={{ color: drawerOpen || isMoreActive ? 'var(--brand-text)' : 'var(--nav-muted)' }}
            >
              Mais
            </span>
          </button>
        </div>
      </nav>

      {/* ── Task Form ────────────────────────────────────────────── */}
      <TaskForm isOpen={taskFormOpen} onClose={() => setTaskFormOpen(false)} />

      {/* ── Drawer ───────────────────────────────────────────────── */}
      {drawerOpen && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- fundo do gaveteiro: o equivalente por teclado é o Escape, tratado no useEffect acima
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          // Só o fundo fecha. Antes o painel precisava de um `stopPropagation`
          // próprio para não fechar a si mesmo — um onClick num elemento sem
          // papel interativo, que existia só para desfazer o de cima.
          onClick={e => { if (e.target === e.currentTarget) setDrawerOpen(false) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-x-0 rounded-t-[22px] pb-2 animate-in slide-in-from-bottom-4 duration-200
                       flex flex-col overflow-y-auto overscroll-contain"
            style={{
              bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
              // Teto de 78% da altura: a gaveta cresceu (todas as telas, por
              // seção) e sem limite ela passava do topo em telas pequenas.
              maxHeight: '78vh',
              background: 'var(--surface)',
              backgroundImage: 'var(--grain), var(--surface-sheen)',
              borderTop: '1px solid var(--line)',
            }}
          >
            {/* Handle — fica colado no topo enquanto a gaveta rola */}
            <div
              className="sticky top-0 z-10 flex justify-center pt-3 pb-3"
              style={{ background: 'var(--surface)' }}
            >
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--line-strong)' }} />
            </div>

            {/* Busca global — única porta de entrada no mobile (sem ⌘K) */}
            <div className="px-4 pb-4">
              <button
                onClick={() => { setDrawerOpen(false); setSearchOpen(true) }}
                className="w-full flex items-center gap-3 px-4 min-h-[48px] rounded-2xl active:scale-[0.98] transition-transform"
                style={{ background: 'var(--s2)', border: '1px solid var(--line)' }}
              >
                <Search size={16} style={{ color: 'var(--t3)' }} className="flex-shrink-0" />
                <span className="text-sm text-t3">Buscar contatos, imóveis, leads…</span>
              </button>
            </div>

            {/*
              Páginas por seção, em lista.
              Era uma grade de quatro colunas: "Prospecção · Disparos" em ~80px
              de largura virava três linhas cortadas. Linha inteira com ícone à
              esquerda lê de relance e dá alvo de 48px, que é o mínimo confortável
              para o polegar.
            */}
            {moreSections.map(section => (
              <div key={section.label} className="px-4 pb-3">
                <p className="font-label text-[11px] font-bold text-t4 uppercase tracking-[0.14em] mb-1.5 px-1">
                  {section.label}
                </p>
                <div className="flex flex-col gap-1">
                  {section.items.map(({ to, icon: Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center gap-3 px-3 min-h-[48px] rounded-2xl transition-transform active:scale-[0.98]"
                      style={({ isActive }) => ({
                        background: isActive ? 'var(--brand-tint)' : 'var(--s2)',
                      })}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            size={18}
                            strokeWidth={isActive ? 2.2 : 1.8}
                            style={{ color: isActive ? 'var(--brand)' : 'var(--t3)' }}
                            className="flex-shrink-0"
                          />
                          <span
                            className="text-sm font-medium truncate"
                            style={{ color: isActive ? 'var(--brand-text)' : 'var(--t2)' }}
                          >
                            {label}
                          </span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}

            {/* Ferramentas */}
            <div className="px-4 pt-3 pb-4" style={{ borderTop: '1px solid var(--line)' }}>
              <p className="text-[11px] font-bold text-t4 uppercase tracking-widest mb-3 px-2">Ferramentas</p>
              <div className="grid grid-cols-2 gap-2">
                {tools.map(({ label, href, icon: Icon }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl text-t3 active:scale-95 transition-all"
                    style={{ background: 'var(--s2)' }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--brand-tint)' }}>
                      <Icon size={15} style={{ color: 'var(--brand)' }} />
                    </div>
                    <span className="text-sm font-medium text-t2 truncate">{label}</span>
                    <ExternalLink size={11} className="text-t4 flex-shrink-0 ml-auto" />
                  </a>
                ))}
              </div>
            </div>

            {/* Admin link */}
            {isAdmin && (
              <div className="px-4 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                <NavLink
                  to="/admin"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-t3 active:scale-95 transition-all"
                  style={{ background: 'var(--s2)' }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--brand-tint)' }}>
                    <ShieldCheck size={15} style={{ color: 'var(--brand)' }} />
                  </div>
                  <span className="text-sm font-medium text-t2 flex-1">Administração</span>
                </NavLink>
              </div>
            )}

            {/* User */}
            <div className="px-4 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
                style={{ background: 'var(--s2)', border: '1px solid var(--line)' }}
              >
                <div className="w-9 h-9 bg-brand rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-t1">{profile?.name ?? 'Usuário'}</p>
                  <p className="text-xs text-t3">{isAdmin ? 'Administrador' : 'Corretor'}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-t4 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Sair"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
