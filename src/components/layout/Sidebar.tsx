import { useState, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Building2, TrendingUp, BarChart3,
  CheckSquare, Megaphone, Wrench, Search, Home, ChevronDown,
  ExternalLink, Tv2, Sun, Moon, UserPlus, ChevronRight, ArrowLeftRight,
  Bell, ShieldCheck, LogOut, ScrollText, Target, Database,
} from 'lucide-react'
import { useThemeStore } from '../../store/useThemeStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useUnreadCount } from '../../store/useNotificationsStore'
import { NotificationsPopover } from './NotificationsPopover'

const navSections = [
  {
    label: 'Principal',
    items: [
      { key: 'dashboard',   to: '/',           icon: LayoutDashboard, label: 'Dashboard',          end: true  },
      { key: 'tarefas',     to: '/tarefas',    icon: CheckSquare,     label: 'Tarefas',             end: false },
      { key: 'metas',       to: '/metas',      icon: Target,          label: 'Metas',               end: false },
      { key: 'escritorio',  to: '/escritorio', icon: Tv2,             label: 'Escritório Virtual',  end: false },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { key: 'leads',       to: '/leads',        icon: UserPlus,       label: 'Leads',         end: false },
      { key: 'contatos',    to: '/contatos',     icon: Users,          label: 'Contatos',      end: false },
      { key: 'base-leads',  to: '/base-leads',   icon: Database,       label: 'Base de Leads', end: false },
      { key: 'imoveis',     to: '/imoveis',      icon: Building2,      label: 'Imóveis',       end: false },
      { key: 'vendas',      to: '/vendas',       icon: TrendingUp,     label: 'Vendas',        end: false },
      { key: 'campanhas',   to: '/campanhas',    icon: Megaphone,      label: 'Campanhas',     end: false },
      { key: 'permuta',     to: '/permuta',      icon: ArrowLeftRight, label: 'Permuta',       end: false },
    ],
  },
  {
    label: 'Análise',
    items: [
      { key: 'performance', to: '/performance', icon: BarChart3, label: 'Análise', end: false },
    ],
  },
]

const tools = [
  { label: 'IBuscador',   href: 'http://localhost:5177/', icon: Search   },
  { label: 'IAgenciador', href: 'http://localhost:5174/', icon: Home     },
  { label: 'Meta ADS',    href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=886179520398765&business_id=1889117311563062&global_scope_id=1889117311563062', icon: Tv2 },
  { label: 'Eemovel',     href: 'https://brokers.eemovel.com.br/login', icon: Building2 },
]

export function Sidebar() {
  const [toolsOpen,    setToolsOpen]    = useState(false)
  const [notifOpen,    setNotifOpen]    = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const { theme, toggle } = useThemeStore()
  const { profile, isAdmin, logout, allProfiles, viewAsBrokerId, setViewAsBroker } = useAuthStore()
  const unreadCount = useUnreadCount()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const initial = (profile?.name ?? 'U').charAt(0).toUpperCase()

  const allowedMenus = profile?.allowedMenus ?? null
  const visibleSections = navSections
    .map(section => ({
      ...section,
      items: section.items.filter(item =>
        isAdmin || allowedMenus === null || allowedMenus.includes(item.key)
      ),
    }))
    .filter(section => section.items.length > 0)

  return (
    <aside
      className="hidden lg:flex w-64 flex-shrink-0 flex-col h-screen sticky top-0"
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderRight: '1px solid var(--nav-line)',
      }}
    >
      {/* ── Logo Souza Imobiliária ───────────────────────────────── */}
      <div className="px-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--nav-line)', paddingTop: 'calc(1.1rem + env(safe-area-inset-top, 0px))', paddingBottom: '1.1rem' }}>
        {/* Símbolo: S dentro de quadrado arredondado Areia */}
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-[22%] shadow-sm"
          style={{ width: 36, height: 36, background: '#E4B23C' }}
        >
          <span
            style={{
              fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 20,
              color: '#0F1730',
              lineHeight: 1,
              letterSpacing: '-0.04em',
              userSelect: 'none',
            }}
          >S</span>
        </div>
        {/* Nome */}
        <div className="flex flex-col leading-none select-none">
          <span style={{
            fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 15,
            color: '#F6F3EC',
            letterSpacing: '-0.01em',
          }}>SOUZA</span>
          <span style={{
            fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
            fontWeight: 600,
            fontSize: 9.5,
            color: 'rgba(246,243,236,0.55)',
            letterSpacing: '0.14em',
          }}>
            IMOBILIÁRIA
            <span style={{ color: '#E4B23C' }}>.</span>
          </span>
        </div>
      </div>

      {/* ── Search pill ──────────────────────────────────────────── */}
      <div className="px-3 py-3">
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-default select-none transition-all"
          style={{
            background: 'var(--nav-hover-bg)',
            border: '1px solid var(--nav-line)',
          }}
        >
          <Search size={13} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
          <span className="flex-1 text-xs" style={{ color: 'var(--nav-muted)' }}>Buscar…</span>
          <kbd
            className="text-[10px] font-mono px-1.5 py-0.5 rounded leading-4 flex-shrink-0"
            style={{
              color: 'var(--nav-muted)',
              background: 'var(--nav-hover-bg)',
              border: '1px solid var(--nav-line)',
            }}
          >⌘K</kbd>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 overflow-y-auto flex flex-col gap-5 py-2">
        {visibleSections.map(section => (
          <div key={section.label}>
            {/* Section label */}
            <p
              className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-widest select-none"
              style={{ color: 'var(--nav-muted)' }}
            >
              {section.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive ? 'sf-nav-active' : 'sf-nav-item'
                    }`
                  }
                  style={({ isActive }) =>
                    isActive
                      ? {
                          background: 'var(--nav-active-bg)',
                          color: 'var(--nav-active-text)',
                          borderLeft: '3px solid var(--brand)',
                          paddingLeft: 'calc(0.75rem - 3px)',
                        }
                      : {
                          color: 'var(--nav-text)',
                          borderLeft: '3px solid transparent',
                          paddingLeft: 'calc(0.75rem - 3px)',
                        }
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        size={16}
                        style={{ color: isActive ? 'var(--brand)' : 'var(--nav-muted)' }}
                        className="flex-shrink-0 transition-colors"
                      />
                      <span className="flex-1 truncate">{label}</span>
                      {isActive && (
                        <ChevronRight size={12} style={{ color: 'var(--brand-text)' }} className="flex-shrink-0" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {/* ── Admin ───────────────────────────────────────────────── */}
        {isAdmin && (
          <div>
            <p
              className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-widest select-none"
              style={{ color: 'var(--nav-muted)' }}
            >
              Administração
            </p>
            <NavLink
              to="/admin"
              end
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${isActive ? 'sf-nav-active' : 'sf-nav-item'}`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: 'var(--nav-active-bg)', color: 'var(--nav-active-text)', borderLeft: '3px solid var(--brand)', paddingLeft: 'calc(0.75rem - 3px)' }
                  : { color: 'var(--nav-text)', borderLeft: '3px solid transparent', paddingLeft: 'calc(0.75rem - 3px)' }
              }
            >
              {({ isActive }) => (
                <>
                  <ShieldCheck size={16} style={{ color: isActive ? 'var(--brand)' : 'var(--nav-muted)' }} className="flex-shrink-0" />
                  <span className="flex-1 truncate">Corretores</span>
                  {isActive && <ChevronRight size={12} style={{ color: 'var(--brand-text)' }} className="flex-shrink-0" />}
                </>
              )}
            </NavLink>
            <NavLink
              to="/admin/logs"
              end
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${isActive ? 'sf-nav-active' : 'sf-nav-item'}`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: 'var(--nav-active-bg)', color: 'var(--nav-active-text)', borderLeft: '3px solid var(--brand)', paddingLeft: 'calc(0.75rem - 3px)' }
                  : { color: 'var(--nav-text)', borderLeft: '3px solid transparent', paddingLeft: 'calc(0.75rem - 3px)' }
              }
            >
              {({ isActive }) => (
                <>
                  <ScrollText size={16} style={{ color: isActive ? 'var(--brand)' : 'var(--nav-muted)' }} className="flex-shrink-0" />
                  <span className="flex-1 truncate">Logs</span>
                  {isActive && <ChevronRight size={12} style={{ color: 'var(--brand-text)' }} className="flex-shrink-0" />}
                </>
              )}
            </NavLink>

            {/* Seletor de corretor */}
            {allProfiles.filter(p => p.role === 'broker').length > 0 && (
              <div className="mt-2 px-3">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5 select-none" style={{ color: 'var(--nav-muted)' }}>
                  Ver como
                </p>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => setViewAsBroker(null)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer w-full text-left"
                    style={{
                      background: viewAsBrokerId === null ? 'var(--nav-active-bg)' : 'transparent',
                      color: viewAsBrokerId === null ? 'var(--brand-text)' : 'var(--nav-muted)',
                    }}
                  >
                    <div className="w-4 h-4 rounded-full bg-slate-500/30 flex items-center justify-center text-[8px] font-bold flex-shrink-0" style={{ color: 'var(--nav-muted)' }}>T</div>
                    Todos
                  </button>
                  {allProfiles.filter(p => p.role === 'broker').map(p => (
                    <button
                      key={p.id}
                      onClick={() => setViewAsBroker(p.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer w-full text-left"
                      style={{
                        background: viewAsBrokerId === p.id ? 'var(--nav-active-bg)' : 'transparent',
                        color: viewAsBrokerId === p.id ? 'var(--brand-text)' : 'var(--nav-muted)',
                      }}
                    >
                      <div className="w-4 h-4 rounded-full bg-brand/30 flex items-center justify-center text-[8px] font-bold text-brand flex-shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Ferramentas ─────────────────────────────────────────── */}
        <div>
          <p
            className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-widest select-none"
            style={{ color: 'var(--nav-muted)' }}
          >
            Ferramentas
          </p>
          <button
            onClick={() => setToolsOpen(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer hover:bg-nav-hover"
            style={{
              color: 'var(--nav-text)',
              borderLeft: '3px solid transparent',
              paddingLeft: 'calc(0.75rem - 3px)',
            }}
          >
            <Wrench size={16} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
            <span className="flex-1 text-left">Externas</span>
            <ChevronDown
              size={12}
              style={{ color: 'var(--nav-muted)' }}
              className={`transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {toolsOpen && (
            <div
              className="mt-1 ml-5 flex flex-col gap-0.5 pl-3"
              style={{ borderLeft: '1px solid var(--nav-line)' }}
            >
              {tools.map(({ label, href, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium transition-all duration-150"
                  style={{ color: 'var(--nav-muted)' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--nav-hover-bg)'
                    e.currentTarget.style.color = 'var(--nav-text)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = ''
                    e.currentTarget.style.color = 'var(--nav-muted)'
                  }}
                >
                  <Icon size={13} className="flex-shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  <ExternalLink size={10} className="flex-shrink-0 opacity-50" />
                </a>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="px-3 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--nav-line)' }}>
        {/* Notificações — popover real */}
        <button
          ref={bellRef}
          onClick={() => setNotifOpen(v => !v)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer"
          style={{
            color: 'var(--nav-text)',
            background: notifOpen ? 'var(--nav-hover-bg)' : '',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover-bg)' }}
          onMouseLeave={e => { if (!notifOpen) e.currentTarget.style.background = '' }}
        >
          <Bell size={14} style={{ color: unreadCount > 0 ? 'var(--brand)' : 'var(--nav-muted)' }} />
          <span className="flex-1 text-left text-xs">Notificações</span>
          {unreadCount > 0 && (
            <span className="min-w-[16px] h-4 rounded-full bg-brand text-white text-[9px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        <NotificationsPopover
          isOpen={notifOpen}
          onClose={() => setNotifOpen(false)}
          anchorEl={bellRef.current}
        />

        {/* Tema toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer"
          style={{ color: 'var(--nav-text)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover-bg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '' }}
        >
          {theme === 'dark'
            ? <Sun size={14} style={{ color: 'var(--nav-muted)' }} />
            : <Moon size={14} style={{ color: 'var(--nav-muted)' }} />
          }
          <span className="flex-1 text-left text-xs">
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </span>
          <div
            className="relative w-8 h-4 rounded-full transition-all flex-shrink-0"
            style={{ background: theme === 'light' ? 'var(--brand)' : 'var(--nav-line)' }}
          >
            <span
              className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all"
              style={{ left: theme === 'light' ? '1rem' : '2px' }}
            />
          </div>
        </button>

        {/* User */}
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg mt-0.5"
          style={{ background: 'var(--nav-hover-bg)', border: '1px solid var(--nav-line)' }}
        >
          <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate leading-none" style={{ color: 'var(--nav-active-text)' }}>
              {profile?.name ?? 'Usuário'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--nav-muted)' }}>
              {isAdmin ? 'Administrador' : 'Corretor'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Sair"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer flex-shrink-0"
            style={{ color: 'var(--nav-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--nav-muted)'; e.currentTarget.style.background = '' }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}
