import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useThemeStore } from '../../store/useThemeStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useSidebarStore } from '../../store/useSidebarStore'
import { useUnreadCount } from '../../store/useNotificationsStore'
import { useSearchStore } from '../../store/useSearchStore'
import { NotificationsPopover } from './NotificationsPopover'
import { filtrarPorPermissao, isGroup } from './nav/navConfig'
import { NavItem, NavGroup, SectionLabel } from './nav/NavItems'
import { AccountMenu } from './nav/AccountMenu'
import { ViewSwitcher, type Visao } from './nav/ViewSwitcher'

/**
 * Trilho de navegação.
 *
 * O menu antigo carregava quatro coisas diferentes empilhadas no mesmo tubo:
 * navegação (12 destinos), preferências (tema, recolher), contexto de admin
 * (uma linha por corretor) e utilidades (busca, ferramentas externas, sair).
 * Vinte e cinco alvos permanentes para doze destinos — a conta não fechava, e
 * era isso que fazia a barra parecer poluída, não a quantidade de telas.
 *
 * A regra do desenho novo é uma só: **o trilho é para ir a lugares**. Tudo que
 * não leva a uma tela saiu para dois pontos de ancoragem que não competem com
 * a leitura:
 *
 *   topo    → seletor de visão (contexto que muda o significado de tudo)
 *   rodapé  → menu da conta (tema, ferramentas, admin, busca, sair)
 *
 * Sobrou o que interessa: as seções, os destinos, e o item onde você está.
 */
export function Sidebar() {
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

  const nome = profile?.name ?? 'Usuário'
  const inicial = nome.charAt(0).toUpperCase()
  const papel = isAdmin ? 'Admin · Corretor' : 'Corretor'

  const allowedMenus = profile?.allowedMenus ?? null
  const visibleSections = filtrarPorPermissao(
    key => isAdmin || allowedMenus === null || allowedMenus.includes(key),
  )

  const visoes: Visao[] = isAdmin
    ? [
        { id: null, inicial: 'G', label: 'Visão Global' },
        ...(profile ? [{ id: profile.id, inicial, label: 'Meu Desempenho' }] : []),
        ...allProfiles
          .filter(p => p.role === 'broker' && p.id !== profile?.id)
          .map(p => ({ id: p.id, inicial: p.name.charAt(0).toUpperCase(), label: p.name })),
      ]
    : []

  return (
    <aside
      className={`nav-rail group/rail sticky top-0 hidden h-screen flex-shrink-0 flex-col
        transition-[width] duration-200 lg:flex ${collapsed ? 'w-[68px]' : 'w-[248px]'}`}
      style={{ borderRight: '1px solid var(--nav-line)' }}
      aria-label="Navegação principal"
    >
      {/*
        Botão de recolher na borda, aparecendo no hover do trilho.
        Ele era uma linha permanente de largura total no rodapé — peso de
        destino para um controle que se usa uma vez e esquece. Na borda ele fica
        exatamente onde a mão vai (o limite entre menu e conteúdo) e some da
        leitura enquanto não é preciso. `focus-visible` o traz de volta para
        quem navega por teclado.
      */}
      <button
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
        aria-pressed={collapsed}
        className="nav-elev absolute -right-3 top-[74px] z-20 flex h-6 w-6 cursor-pointer items-center
                   justify-center rounded-full opacity-0 transition-opacity duration-150
                   group-hover/rail:opacity-100 focus-visible:opacity-100"
        style={{ color: 'var(--nav-muted)' }}
      >
        {collapsed
          ? <PanelLeftOpen  size={13} strokeWidth={2} />
          : <PanelLeftClose size={13} strokeWidth={2} />}
      </button>

      {/* ── Marca + notificações ─────────────────────────────────── */}
      <div
        className={`flex items-center ${collapsed ? 'flex-col gap-2 px-3' : 'gap-2.5 px-4'}`}
        style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', paddingBottom: '0.875rem' }}
      >
        <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div
            className="flex flex-shrink-0 items-center justify-center rounded-[22%]"
            style={{ width: 32, height: 32, background: '#E4B23C' }}
          >
            <span
              style={{
                fontFamily: "'Sora', system-ui, sans-serif",
                // Grafite fixo: o quadrado é sempre dourado vivo, então o "S" não
                // pode seguir o token de tema (no claro ele viraria branco sobre
                // ouro — 1.9:1, ilegível).
                fontWeight: 900, fontSize: 18, color: '#0F1730',
                lineHeight: 1, letterSpacing: '-0.04em', userSelect: 'none',
              }}
            >S</span>
          </div>
          {!collapsed && (
            <div className="flex min-w-0 select-none flex-col leading-none">
              <span style={{
                fontFamily: "'Sora', system-ui, sans-serif",
                fontWeight: 800, fontSize: 14.5, color: 'var(--nav-logo)', letterSpacing: '-0.01em',
              }}>SOUZA</span>
              <span style={{
                fontFamily: "'Sora', system-ui, sans-serif",
                fontWeight: 600, fontSize: 9, color: 'var(--nav-muted)', letterSpacing: '0.14em',
              }}>
                {/* Ponto final em Areia — exigência do lockup no Brand Guide. */}
                IMOBILIÁRIA<span style={{ color: 'var(--brand)' }}>.</span>
              </span>
            </div>
          )}
        </div>

        {/*
          O sino era uma linha inteira do rodapé escrito "Notificações". Vira um
          alvo de 32px ao lado da marca — o lugar onde todo SaaS o coloca, e onde
          o ponto de não lida é visto sem competir com nenhum destino.
        */}
        <button
          ref={bellRef}
          onClick={() => setNotifOpen(v => !v)}
          aria-haspopup="dialog"
          aria-expanded={notifOpen}
          aria-label={unreadCount > 0
            ? `Notificações — ${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}`
            : 'Notificações'}
          className="relative flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center
                     rounded-lg transition-colors hover:bg-nav-hover"
          style={{ background: notifOpen ? 'var(--nav-active-bg)' : undefined }}
        >
          <Bell
            size={16}
            strokeWidth={1.9}
            style={{ color: notifOpen || unreadCount > 0 ? 'var(--brand)' : 'var(--nav-muted)' }}
            className="transition-colors"
          />
          {unreadCount > 0 && (
            <span
              className="absolute right-1 top-1 h-[7px] w-[7px] rounded-full"
              style={{ background: 'var(--brand)', boxShadow: '0 0 0 2px var(--nav-bg)' }}
              aria-hidden
            />
          )}
        </button>

        <NotificationsPopover
          isOpen={notifOpen}
          onClose={() => setNotifOpen(false)}
          anchorEl={bellRef.current}
        />
      </div>

      {/* ── Visão do admin ───────────────────────────────────────── */}
      {isAdmin && visoes.length > 1 && (
        <div className={`pb-3 ${collapsed ? 'px-3' : 'px-3'}`}>
          <ViewSwitcher
            collapsed={collapsed}
            visoes={visoes}
            atual={viewAsBrokerId}
            onSelect={setViewAsBroker}
          />
        </div>
      )}

      {/* ── Destinos ─────────────────────────────────────────────── */}
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-3 pb-2">
        {visibleSections.map(section => (
          <div key={section.label}>
            <SectionLabel collapsed={collapsed}>{section.label}</SectionLabel>
            <div className="flex flex-col gap-0.5">
              {section.items.map(item =>
                isGroup(item)
                  ? <NavGroup key={item.key} group={item} collapsed={collapsed} />
                  : <NavItem key={item.to} item={item} collapsed={collapsed} />,
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Conta ────────────────────────────────────────────────── */}
      <div className="px-2.5 pb-3 pt-2" style={{ borderTop: '1px solid var(--nav-line)' }}>
        <AccountMenu
          collapsed={collapsed}
          nome={nome}
          papel={papel}
          inicial={inicial}
          isAdmin={isAdmin}
          theme={theme}
          onToggleTheme={toggle}
          onBuscar={() => setSearchOpen(true)}
          onSair={handleLogout}
        />
      </div>
    </aside>
  )
}
