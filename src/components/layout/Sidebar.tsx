import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useThemeStore } from '../../store/useThemeStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useSidebarStore } from '../../store/useSidebarStore'
import { useSearchStore } from '../../store/useSearchStore'
import { filtrarPorPermissao, isGroup } from './nav/navConfig'
import { NavItem, NavGroup, SectionLabel } from './nav/NavItems'
import { AccountMenu } from './nav/AccountMenu'
import { ViewSwitcher, type Visao } from './nav/ViewSwitcher'
import { iniciais } from '../../lib/formatters'

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
  const { theme, toggle } = useThemeStore()
  const { collapsed, toggle: toggleCollapsed } = useSidebarStore()
  const { profile, isAdmin, logout, allProfiles, viewAsBrokerId, setViewAsBroker } = useAuthStore()
  const setSearchOpen = useSearchStore(s => s.setOpen)
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  /*
   * `[` recolhe e expande — o mesmo atalho do VS Code e do Linear.
   * Sai do caminho quando o foco está num campo: sem essa checagem, digitar um
   * colchete numa busca sanfonava o menu.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      if (alvo?.isContentEditable) return
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return
      e.preventDefault()
      toggleCollapsed()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCollapsed])

  const nome = profile?.name ?? 'Usuário'
  const inicial = iniciais(nome) || 'U'
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
          .map(p => ({ id: p.id, inicial: iniciais(p.name) || '?', label: p.name })),
      ]
    : []

  return (
    <aside
      className={`nav-rail sticky top-0 hidden h-screen flex-shrink-0 flex-col
        transition-[width] duration-200 lg:flex ${collapsed ? 'w-[72px]' : 'w-[244px]'}`}
      aria-label="Navegação principal"
    >
      {/* ── Marca, avisos e recolher ─────────────────────────────── */}
      <div
        className={`flex px-3 ${collapsed ? 'flex-col items-center gap-1.5' : 'items-center gap-2'}`}
        style={{ paddingTop: 'calc(0.875rem + env(safe-area-inset-top, 0px))', paddingBottom: '0.75rem' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div
            className="flex flex-shrink-0 items-center justify-center rounded-[22%]"
            style={{ width: 32, height: 32, background: '#D6B26E' }}
          >
            <span
              style={{
                fontFamily: "'Fraunces', system-ui, sans-serif",
                // Grafite fixo: o quadrado é sempre dourado vivo, então o "S" não
                // pode seguir o token de tema (no claro ele viraria branco sobre
                // ouro — 1.9:1, ilegível).
                fontWeight: 900, fontSize: 18, color: '#18181B',
                lineHeight: 1, letterSpacing: '-0.04em', userSelect: 'none',
              }}
            >S</span>
          </div>
          {!collapsed && (
            <div className="flex min-w-0 select-none flex-col leading-none">
              <span style={{
                fontFamily: "'Fraunces', system-ui, sans-serif",
                fontWeight: 800, fontSize: 14.5, color: 'var(--nav-logo)', letterSpacing: '-0.01em',
              }}>SOUZA</span>
              <span style={{
                fontFamily: "'Fraunces', system-ui, sans-serif",
                fontWeight: 600, fontSize: 9, color: 'var(--nav-muted)', letterSpacing: '0.14em',
              }}>
                {/* Ponto final em Areia — exigência do lockup no Brand Guide. */}
                IMOBILIÁRIA<span style={{ color: 'var(--brand)' }}>.</span>
              </span>
            </div>
          )}
        </div>

        {/*
          v5: o sino foi para a barra do topo (TopBar), junto da busca e do
          criar. Aqui fica só o recolher.
          Recolher fica SEMPRE visível.
          O recolher chegou a ser uma alça na borda que aparecia no hover: some
          da leitura, mas um controle que não se vê não se descobre, e a alça
          ainda ficava metade por cima do conteúdo. Um controle permanente de
          30px no cabeçalho custa quase nada de espaço e não exige adivinhar.
        */}
        <div className={`flex flex-shrink-0 items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
            aria-pressed={collapsed}
            title={`${collapsed ? 'Expandir' : 'Recolher'} navegação  [`}
            className="sf-icon-btn"
          >
            {collapsed
              ? <PanelLeftOpen  size={15} strokeWidth={1.9} style={{ color: 'var(--nav-muted)' }} />
              : <PanelLeftClose size={15} strokeWidth={1.9} style={{ color: 'var(--nav-muted)' }} />}
          </button>
        </div>


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
      <div className="px-2.5 pb-3 pt-2">
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
