import { useState, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Building2, TrendingUp, BarChart3,
  CheckSquare, Megaphone, Wrench, Search, Home, ChevronDown,
  ExternalLink, Tv2, Sun, Moon, UserPlus, Calculator,
  Bell, ShieldCheck, LogOut, Target, Database, Package, Rocket,
  PanelLeftClose, PanelLeftOpen, Send, Phone,
} from 'lucide-react'
import { useThemeStore } from '../../store/useThemeStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useSidebarStore } from '../../store/useSidebarStore'
import { useUnreadCount } from '../../store/useNotificationsStore'
import { useSearchStore } from '../../store/useSearchStore'
import { NotificationsPopover } from './NotificationsPopover'

type NavIcon = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>

interface NavLeaf {
  key: string
  to: string
  icon: NavIcon
  label: string
  end: boolean
}

interface NavGroupDef {
  key: string
  icon: NavIcon
  label: string
  children: NavLeaf[]
}

type NavEntry = NavLeaf | NavGroupDef

function isGroup(e: NavEntry): e is NavGroupDef {
  return 'children' in e
}

/*
 * "Imóveis" virou "Produtos", com duas naturezas debaixo do mesmo guarda-chuva:
 * o que está PRONTO (a unidade avulsa, `properties.kind = 'ready'`) e o
 * LANÇAMENTO (o empreendimento na planta, com régua comercial). São coisas
 * diferentes o suficiente para não caberem na mesma tela, e próximas o
 * suficiente para não merecerem dois itens soltos no menu.
 *
 * Mesma lógica em "Prospecção Ativa": disparo e ligação atacam a MESMA base
 * fria por canais diferentes. Disparo é em lote e o corretor escolhe quem
 * abordar; ligação é um por vez e a fila escolhe por ele. Telas separadas,
 * guarda-chuva comum.
 */
const navSections: Array<{ label: string; items: NavEntry[] }> = [
  {
    label: 'Operação',
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
      {
        key: 'produtos', icon: Package, label: 'Produtos',
        children: [
          { key: 'imoveis',     to: '/imoveis',     icon: Building2, label: 'Prontos',     end: false },
          { key: 'lancamentos', to: '/lancamentos', icon: Rocket,    label: 'Lançamentos', end: false },
        ],
      },
      { key: 'vendas',      to: '/vendas',       icon: TrendingUp,     label: 'Vendas',        end: false },
      {
        key: 'prospeccao', icon: Megaphone, label: 'Prospecção Ativa',
        children: [
          { key: 'disparos', to: '/prospeccao/disparos', icon: Send,  label: 'Disparos WhatsApp', end: false },
          { key: 'ligacoes', to: '/prospeccao/ligacoes', icon: Phone, label: 'Ligações WhatsApp', end: false },
        ],
      },
      { key: 'simulador',   to: '/simulador',    icon: Calculator,     label: 'Simulador',     end: false },
    ],
  },
  {
    label: 'Inteligência',
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

// ── Item de navegação ────────────────────────────────────────────────────────
// Um só componente para rota interna. Antes, cada NavLink repetia ~18 linhas de
// style inline — três cópias idênticas só na área de administração.
function NavItem({ to, end, icon: Icon, label, collapsed }: {
  to: string
  end: boolean
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  label: string
  collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `group relative flex items-center rounded-lg text-sm font-medium transition-colors duration-150
         ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'}
         ${isActive ? 'sf-nav-active' : 'sf-nav-item hover:bg-nav-hover'}`
      }
      style={({ isActive }) => ({
        background: isActive ? 'var(--nav-active-bg)' : undefined,
        color: isActive ? 'var(--nav-active-text)' : 'var(--nav-text)',
        // A barra dourada some quando recolhido: com 72px de largura ela vira
        // ruído e o fundo ativo já resolve a leitura.
        borderLeft: collapsed ? undefined : `3px solid ${isActive ? 'var(--brand)' : 'transparent'}`,
        paddingLeft: collapsed ? undefined : 'calc(0.75rem - 3px)',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={17}
            style={{ color: isActive ? 'var(--brand)' : 'var(--nav-muted)' }}
            className="flex-shrink-0 transition-colors"
          />
          {!collapsed && <span className="flex-1 truncate">{label}</span>}
          {collapsed && <span className="sr-only">{label}</span>}
        </>
      )}
    </NavLink>
  )
}

/**
 * Grupo com filhos — "Produtos" hoje.
 *
 * Expandido: pai clicável que abre/fecha, filhos indentados com o filete de
 * hierarquia. Abre sozinho quando a rota atual é de um filho, então quem está
 * em Lançamentos nunca vê o próprio item escondido.
 *
 * Recolhido: os filhos aparecem como ícones soltos, sem o pai. Esconder rota
 * primária atrás de "expandir a barra e depois clicar" custaria dois cliques
 * para chegar onde antes bastava um.
 */
function NavGroup({ group, collapsed }: { group: NavGroupDef; collapsed: boolean }) {
  const { pathname } = useLocation()
  const algumFilhoAtivo = group.children.some(c => pathname.startsWith(c.to))
  const [open, setOpen] = useState(algumFilhoAtivo)

  if (collapsed) {
    return (
      <>
        {group.children.map(c => (
          <NavItem key={c.to} to={c.to} end={c.end} icon={c.icon} label={c.label} collapsed />
        ))}
      </>
    )
  }

  const aberto = open || algumFilhoAtivo

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={aberto}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                   transition-colors duration-150 cursor-pointer hover:bg-nav-hover"
        style={{
          color: algumFilhoAtivo ? 'var(--nav-active-text)' : 'var(--nav-text)',
          borderLeft: '3px solid transparent',
          paddingLeft: 'calc(0.75rem - 3px)',
        }}
      >
        <group.icon
          size={17}
          style={{ color: algumFilhoAtivo ? 'var(--brand)' : 'var(--nav-muted)' }}
          className="flex-shrink-0 transition-colors"
        />
        <span className="flex-1 text-left truncate">{group.label}</span>
        <ChevronDown
          size={12}
          style={{ color: 'var(--nav-muted)' }}
          className={`transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div className="mt-0.5 ml-5 flex flex-col gap-0.5 pl-2" style={{ borderLeft: '1px solid var(--nav-line)' }}>
          {group.children.map(c => (
            <NavLink
              key={c.to}
              to={c.to}
              end={c.end}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] font-medium
                 transition-colors duration-150 ${isActive ? 'sf-nav-active' : 'hover:bg-nav-hover'}`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--nav-active-bg)' : undefined,
                color: isActive ? 'var(--nav-active-text)' : 'var(--nav-muted)',
              })}
            >
              {({ isActive }) => (
                <>
                  <c.icon
                    size={14}
                    style={{ color: isActive ? 'var(--brand)' : 'var(--nav-muted)' }}
                    className="flex-shrink-0 transition-colors"
                  />
                  <span className="flex-1 truncate">{c.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

/** Rótulo de grupo — vira um filete quando a barra está recolhida. */
function SectionLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="mx-3 mb-2 h-px" style={{ background: 'var(--nav-line)' }} aria-hidden />
  }
  return (
    <p
      className="px-3 mb-1.5 font-label text-[11px] font-bold uppercase tracking-[0.14em] select-none"
      style={{ color: 'var(--nav-muted)' }}
    >
      {children}
    </p>
  )
}

export function Sidebar() {
  const [toolsOpen, setToolsOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const { theme, toggle } = useThemeStore()
  const { collapsed, toggle: toggleCollapsed } = useSidebarStore()
  const { profile, isAdmin, logout, allProfiles, viewAsBrokerId, setViewAsBroker } = useAuthStore()
  const setSearchOpen = useSearchStore(s => s.setOpen)
  const unreadCount = useUnreadCount()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const initial = (profile?.name ?? 'U').charAt(0).toUpperCase()

  const allowedMenus = profile?.allowedMenus ?? null
  const podeVer = (key: string) =>
    isAdmin || allowedMenus === null || allowedMenus.includes(key)

  // Num grupo, a permissão é por filho: quem só tem 'imoveis' liberado vê
  // Produtos com um item só, em vez de perder o menu inteiro.
  const visibleSections = navSections
    .map(section => ({
      ...section,
      items: section.items.flatMap<NavEntry>(item => {
        if (!isGroup(item)) return podeVer(item.key) ? [item] : []
        const filhos = item.children.filter(c => podeVer(c.key))
        return filhos.length > 0 ? [{ ...item, children: filhos }] : []
      }),
    }))
    .filter(section => section.items.length > 0)

  // Visões do admin — Global, o próprio perfil e cada corretor.
  const views = isAdmin
    ? [
        { id: null as string | null, initial: 'G', label: 'Visão Global' },
        ...(profile ? [{ id: profile.id, initial: profile.name.charAt(0).toUpperCase(), label: 'Meu Desempenho' }] : []),
        ...allProfiles
          .filter(p => p.role === 'broker' && p.id !== profile?.id)
          .map(p => ({ id: p.id, initial: p.name.charAt(0).toUpperCase(), label: p.name })),
      ]
    : []

  return (
    <aside
      className={`hidden lg:flex flex-shrink-0 flex-col h-screen sticky top-0 transition-[width] duration-200 texture-grain
        ${collapsed ? 'w-[4.5rem]' : 'w-60'}`}
      style={{
        backgroundColor: 'var(--nav-bg)',
        borderRight: '1px solid var(--nav-line)',
      }}
      aria-label="Navegação principal"
    >
      {/* ── Logo ─────────────────────────────────────────────────── */}
      <div
        className={`flex items-center border-b ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}
        style={{ borderColor: 'var(--nav-line)', paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', paddingBottom: '1rem' }}
      >
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-[22%]"
          style={{ width: 34, height: 34, background: '#E4B23C' }}
        >
          <span
            style={{
              fontFamily: "'Sora', system-ui, sans-serif",
              // Grafite fixo: o quadrado é sempre dourado vivo, então o "S" não
              // pode seguir o token de tema (no claro ele viraria branco sobre
              // ouro — 1.9:1, ilegível).
              fontWeight: 900, fontSize: 19, color: '#0F1730',
              lineHeight: 1, letterSpacing: '-0.04em', userSelect: 'none',
            }}
          >S</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-none select-none min-w-0">
            <span style={{
              fontFamily: "'Sora', system-ui, sans-serif",
              fontWeight: 800, fontSize: 15, color: 'var(--nav-logo)', letterSpacing: '-0.01em',
            }}>SOUZA</span>
            <span style={{
              fontFamily: "'Sora', system-ui, sans-serif",
              fontWeight: 600, fontSize: 9.5, color: 'var(--nav-muted)', letterSpacing: '0.14em',
            }}>
              {/* Ponto final em Areia — exigência do lockup no Brand Guide. */}
              IMOBILIÁRIA<span style={{ color: 'var(--brand)' }}>.</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Busca global ─────────────────────────────────────────── */}
      <div className={`py-3 ${collapsed ? 'px-3' : 'px-3'}`}>
        <button
          onClick={() => setSearchOpen(true)}
          aria-label="Abrir busca global"
          title={collapsed ? 'Buscar (⌘K)' : undefined}
          className={`w-full flex items-center rounded-lg cursor-pointer select-none transition-colors text-left
            ${collapsed ? 'justify-center py-2.5' : 'gap-2.5 px-3 py-2'}`}
          style={{ background: 'var(--nav-hover-bg)', border: '1px solid var(--nav-line)' }}
        >
          <Search size={15} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-xs" style={{ color: 'var(--nav-muted)' }}>Buscar…</span>
              <kbd
                className="text-[11px] font-mono px-1.5 py-0.5 rounded leading-4 flex-shrink-0"
                style={{ color: 'var(--nav-muted)', background: 'var(--nav-hover-bg)', border: '1px solid var(--nav-line)' }}
              >⌘K</kbd>
            </>
          )}
        </button>
      </div>

      {/* ── Navegação ────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 overflow-y-auto overflow-x-hidden flex flex-col gap-4 py-1">
        {visibleSections.map(section => (
          <div key={section.label}>
            <SectionLabel collapsed={collapsed}>{section.label}</SectionLabel>
            <div className="flex flex-col gap-0.5">
              {section.items.map(item =>
                isGroup(item)
                  ? <NavGroup key={item.key} group={item} collapsed={collapsed} />
                  : <NavItem key={item.to} to={item.to} end={item.end} icon={item.icon} label={item.label} collapsed={collapsed} />
              )}
            </div>
          </div>
        ))}

        {/* ── Administração ──────────────────────────────────────── */}
        {isAdmin && (
          <div>
            <SectionLabel collapsed={collapsed}>Administração</SectionLabel>
            <div className="flex flex-col gap-0.5">
              <NavItem to="/admin"      end icon={ShieldCheck} label="Corretores" collapsed={collapsed} />
            </div>

            {/* Seletor de visão — Global / Meu Desempenho / Corretor X */}
            <div className={`mt-3 ${collapsed ? '' : 'px-3'}`}>
              {!collapsed && (
                <p className="font-label text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5 select-none" style={{ color: 'var(--nav-muted)' }}>
                  Visão
                </p>
              )}
              <div className={`flex flex-col gap-0.5 ${collapsed ? 'items-center' : ''}`}>
                {views.map(v => {
                  const active = viewAsBrokerId === v.id
                  return (
                    <button
                      key={v.id ?? 'global'}
                      onClick={() => setViewAsBroker(v.id)}
                      title={collapsed ? v.label : undefined}
                      aria-pressed={active}
                      className={`flex items-center rounded-lg text-xs font-medium transition-colors cursor-pointer text-left
                        ${collapsed ? 'justify-center w-9 h-9' : 'gap-2 px-2 py-1.5 w-full'}`}
                      style={{
                        background: active ? 'var(--nav-active-bg)' : 'transparent',
                        color: active ? 'var(--brand-text)' : 'var(--nav-muted)',
                      }}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{
                          background: active ? 'rgba(228,178,60,0.25)' : 'var(--nav-hover-bg)',
                          color: active ? 'var(--brand-text)' : 'var(--nav-muted)',
                        }}
                        aria-hidden
                      >
                        {v.initial}
                      </span>
                      {!collapsed && <span className="truncate">{v.label}</span>}
                      {collapsed && <span className="sr-only">{v.label}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Ferramentas externas ───────────────────────────────── */}
        <div>
          <SectionLabel collapsed={collapsed}>Ferramentas</SectionLabel>
          <button
            onClick={() => {
              // Recolhido, o submenu não caberia: expande a barra e já abre.
              if (collapsed) { toggleCollapsed(); setToolsOpen(true); return }
              setToolsOpen(v => !v)
            }}
            aria-expanded={collapsed ? false : toolsOpen}
            title={collapsed ? 'Ferramentas externas' : undefined}
            className={`w-full flex items-center rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer hover:bg-nav-hover
              ${collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'}`}
            style={{ color: 'var(--nav-text)' }}
          >
            <Wrench size={17} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Externas</span>
                <ChevronDown
                  size={12}
                  style={{ color: 'var(--nav-muted)' }}
                  className={`transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
                />
              </>
            )}
            {collapsed && <span className="sr-only">Ferramentas externas</span>}
          </button>

          {toolsOpen && !collapsed && (
            <div className="mt-1 ml-5 flex flex-col gap-0.5 pl-3" style={{ borderLeft: '1px solid var(--nav-line)' }}>
              {tools.map(({ label, href, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors duration-150 hover:bg-nav-hover"
                  style={{ color: 'var(--nav-muted)' }}
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

      {/* ── Rodapé ───────────────────────────────────────────────── */}
      <div className="px-3 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--nav-line)' }}>
        {/* Notificações */}
        <button
          ref={bellRef}
          onClick={() => setNotifOpen(v => !v)}
          aria-haspopup="dialog"
          aria-expanded={notifOpen}
          aria-label={unreadCount > 0
            ? `Notificações — ${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}`
            : 'Notificações'}
          title={collapsed ? 'Notificações' : undefined}
          className={`w-full flex items-center rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer hover:bg-nav-hover
            ${collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'}`}
          style={{
            color: notifOpen ? 'var(--nav-active-text)' : 'var(--nav-text)',
            background: notifOpen ? 'var(--nav-active-bg)' : undefined,
          }}
        >
          <span className="relative flex-shrink-0" aria-hidden="true">
            <Bell
              size={17}
              style={{ color: notifOpen || unreadCount > 0 ? 'var(--brand)' : 'var(--nav-muted)' }}
              className="transition-colors"
            />
            {unreadCount > 0 && collapsed && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand ring-2"
                style={{ ['--tw-ring-color' as string]: 'var(--nav-bg)' }} />
            )}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate">Notificações</span>
              {unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] rounded-full bg-brand text-[var(--brand-btn-text)] text-[11px] font-bold flex items-center justify-center px-1 tabular-nums flex-shrink-0">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </>
          )}
        </button>

        <NotificationsPopover
          isOpen={notifOpen}
          onClose={() => setNotifOpen(false)}
          anchorEl={bellRef.current}
        />

        {/* Tema */}
        <button
          onClick={toggle}
          role="switch"
          aria-checked={theme === 'light'}
          aria-label="Alternar tema claro e escuro"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          className={`w-full flex items-center rounded-lg transition-colors cursor-pointer hover:bg-nav-hover
            ${collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'}`}
          style={{ color: 'var(--nav-text)' }}
        >
          {theme === 'dark'
            ? <Sun size={16} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
            : <Moon size={16} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
          }
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-xs">
                {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              </span>
              <span
                className="relative w-8 h-4 rounded-full transition-colors flex-shrink-0"
                style={{ background: theme === 'light' ? 'var(--brand)' : 'var(--nav-line)' }}
                aria-hidden
              >
                <span
                  className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all"
                  style={{ left: theme === 'light' ? '1rem' : '2px' }}
                />
              </span>
            </>
          )}
        </button>

        {/* Recolher / expandir */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
          aria-pressed={collapsed}
          title={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
          className={`w-full flex items-center rounded-lg transition-colors cursor-pointer hover:bg-nav-hover
            ${collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'}`}
          style={{ color: 'var(--nav-text)' }}
        >
          {collapsed
            ? <PanelLeftOpen  size={16} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
            : <PanelLeftClose size={16} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
          }
          {!collapsed && <span className="flex-1 text-left text-xs">Recolher menu</span>}
        </button>

        {/* Usuário */}
        <div
          className={`flex items-center rounded-lg mt-0.5 ${collapsed ? 'justify-center py-2' : 'gap-3 px-3 py-2.5'}`}
          style={{ background: 'var(--nav-hover-bg)', border: '1px solid var(--nav-line)' }}
        >
          <div
            className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ color: 'var(--brand-btn-text)' }}
            title={collapsed ? `${profile?.name ?? 'Usuário'} — ${isAdmin ? 'Admin · Corretor' : 'Corretor'}` : undefined}
          >
            {initial}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate leading-none" style={{ color: 'var(--nav-active-text)' }}>
                  {profile?.name ?? 'Usuário'}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--nav-muted)' }}>
                  {isAdmin ? 'Admin · Corretor' : 'Corretor'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                title="Sair"
                aria-label="Sair da conta"
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer flex-shrink-0 hover:bg-error-bg hover:text-error"
                style={{ color: 'var(--nav-muted)' }}
              >
                <LogOut size={14} />
              </button>
            </>
          )}
        </div>

        {/* Recolhido: sair vira botão próprio para não sumir da interface */}
        {collapsed && (
          <button
            onClick={handleLogout}
            title="Sair da conta"
            aria-label="Sair da conta"
            className="w-full flex items-center justify-center py-2.5 rounded-lg transition-colors cursor-pointer hover:bg-error-bg hover:text-error"
            style={{ color: 'var(--nav-muted)' }}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  )
}
