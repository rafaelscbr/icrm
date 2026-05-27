import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, TrendingUp, CheckSquare, MoreHorizontal,
  Building2, Megaphone, BarChart3, X,
  Search, Home, Tv2, ExternalLink, Plus, UserPlus, ArrowLeftRight,
  LogOut, ShieldCheck,
} from 'lucide-react'
import { TaskForm } from '../../modules/tasks/TaskForm'
import { useAuthStore } from '../../store/useAuthStore'

const mainNav = [
  { to: '/',         icon: LayoutDashboard, label: 'Início',   end: true  },
  { to: '/contatos', icon: Users,           label: 'Contatos', end: false },
  { to: '/vendas',   icon: TrendingUp,      label: 'Vendas',   end: false },
  { to: '/tarefas',  icon: CheckSquare,     label: 'Tarefas',  end: false },
]

const moreNav = [
  { to: '/imoveis',     icon: Building2,      label: 'Imóveis'     },
  { to: '/leads',       icon: UserPlus,       label: 'Leads'       },
  { to: '/campanhas',   icon: Megaphone,      label: 'Campanhas'   },
  { to: '/permuta',     icon: ArrowLeftRight, label: 'Permuta'     },
  { to: '/performance', icon: BarChart3,      label: 'Performance' },
]

const tools = [
  { label: 'IBuscador',   href: 'http://localhost:5177/', icon: Search   },
  { label: 'IAgenciador', href: 'http://localhost:5174/', icon: Home     },
  { label: 'Meta ADS',    href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=886179520398765&business_id=1889117311563062&global_scope_id=1889117311563062', icon: Tv2 },
  { label: 'Eemovel',     href: 'https://brokers.eemovel.com.br/login', icon: Building2 },
]

export function BottomNav() {
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const location  = useLocation()
  const navigate  = useNavigate()
  const { profile, isAdmin, logout } = useAuthStore()

  const initial = (profile?.name ?? 'U').charAt(0).toUpperCase()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const isMoreActive = moreNav.some(item => location.pathname === item.to)

  return (
    <>
      {/* ── FAB nova tarefa ──────────────────────────────────────── */}
      <button
        onClick={() => setTaskFormOpen(true)}
        className="lg:hidden fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full bg-brand hover:bg-brand-dark active:scale-95 flex items-center justify-center shadow-brand text-white transition-all duration-150"
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
        }}
      >
        <div className="flex items-center justify-around h-16 px-1">
          {mainNav.map(({ to, icon: Icon, label, end }) => (
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
                    className="text-[10px] font-medium leading-none"
                    style={{ color: isActive ? 'var(--brand-text)' : 'var(--nav-muted)' }}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

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
              className="text-[10px] font-medium leading-none"
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
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute bottom-16 inset-x-0 rounded-t-2xl pb-2 animate-in"
            style={{
              background: 'var(--surface)',
              borderTop: '1px solid var(--line)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--line-strong)' }} />
            </div>

            {/* Páginas */}
            <div className="px-4 pb-3">
              <p className="text-[10px] font-bold text-t4 uppercase tracking-widest mb-3 px-2">Páginas</p>
              <div className="grid grid-cols-4 gap-2">
                {moreNav.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setDrawerOpen(false)}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-95"
                    style={({ isActive }) => ({
                      background: isActive ? 'var(--brand-tint)' : 'var(--s2)',
                      color: isActive ? 'var(--brand)' : 'var(--t3)',
                    })}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={20} style={{ color: isActive ? 'var(--brand)' : 'var(--t3)' }} />
                        <span className="text-xs font-medium leading-tight text-center" style={{ color: isActive ? 'var(--brand-text)' : 'var(--t2)' }}>
                          {label}
                        </span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>

            {/* Ferramentas */}
            <div className="px-4 pt-3 pb-4" style={{ borderTop: '1px solid var(--line)' }}>
              <p className="text-[10px] font-bold text-t4 uppercase tracking-widest mb-3 px-2">Ferramentas</p>
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
