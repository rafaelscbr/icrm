import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import * as Popover from '@radix-ui/react-popover'
import {
  Search, Plus, ChevronDown, Bell, Sun, Moon, MoreHorizontal,
} from 'lucide-react'
import { filtrarPorPermissao, isGroup, acoesCriar } from './nav/navConfig'
import type { NavEntry, NavLeaf } from './nav/navConfig'
import { AccountMenu } from './nav/AccountMenu'
import { ViewSwitcher, type Visao } from './nav/ViewSwitcher'
import { NotificationsPopover } from './NotificationsPopover'
import { useSearchStore } from '../../store/useSearchStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useUnreadCount } from '../../store/useNotificationsStore'
import { iniciais } from '../../lib/formatters'

/**
 * Navegação do topo (desktop) — v6, 01/11/2026.
 *
 * Direção A escolhida pelo Rafael: o menu lateral saiu e a tela inteira ficou
 * para o conteúdo. A barra azul junta tudo que era do trilho e da antiga barra
 * do topo:
 *
 *   esquerda → marca + destinos em pílulas (o ativo em champanhe)
 *   direita  → busca ⌘K, Criar, visão do admin, tema, avisos e conta
 *
 * Doze destinos não cabem numa linha em 1024px. As pílulas seguem a
 * frequência de uso: as cinco do dia inteiro sempre aparecem, mais duas a
 * partir de 1280px, e o resto mora em "Mais" — que repete as duas do meio
 * enquanto elas estiverem escondidas, para nenhum destino sumir.
 *
 * 11/11/2026: Simulador subiu para o lado de Leads (o corretor simula no meio
 * do atendimento) e Contatos desceu para "Mais".
 *
 * No celular a barra não existe: a doca de baixo e o cabeçalho cumprem o papel.
 */

/** Sempre na barra. */
const FIXAS = ['dashboard', 'leads', 'simulador', 'tarefas', 'vendas']
/** Na barra a partir de xl (1280px); abaixo disso, dentro de "Mais". */
const LARGAS = ['produtos', 'prospeccao']

const ROTULO_CURTO: Record<string, string> = {
  prospeccao: 'Prospecção',
  escritorio: 'Escritório',
}

const CRIAR = acoesCriar

function folhaAtiva(f: NavLeaf, pathname: string) {
  if (f.end) return pathname === f.to
  return pathname === f.to || pathname.startsWith(f.to + '/')
}

function entradaAtiva(e: NavEntry, pathname: string) {
  return isGroup(e) ? e.children.some(c => folhaAtiva(c, pathname)) : folhaAtiva(e, pathname)
}

const MENU = 'nav-elev z-[130] rounded-[14px] p-1.5 shadow-dropdown animate-in fade-in duration-150 focus:outline-none'
const LINHA_MENU =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ' +
  'cursor-pointer hover:bg-nav-hover focus:outline-none focus-visible:bg-nav-hover'

function ItemMenu({ folha, ativo, rotulo, className = '' }: {
  folha: NavLeaf; ativo: boolean; rotulo?: string; className?: string
}) {
  return (
    <Popover.Close asChild>
      <Link
        to={folha.to}
        aria-current={ativo ? 'page' : undefined}
        className={`${LINHA_MENU} ${className}`}
        style={{ color: ativo ? 'var(--nav-active-text)' : 'var(--nav-text)', background: ativo ? 'var(--nav-hover-bg)' : undefined }}
      >
        <folha.icon size={15} strokeWidth={1.8} style={{ color: ativo ? 'var(--brand)' : 'var(--nav-muted)' }} />
        <span className="flex-1 truncate">{rotulo ?? folha.label}</span>
      </Link>
    </Popover.Close>
  )
}

/** Pílula de grupo (Produtos, Prospecção): abre os filhos num menu. */
function PilulaGrupo({ entrada, pathname, className }: {
  entrada: Extract<NavEntry, { children: NavLeaf[] }>; pathname: string; className: string
}) {
  const ativo = entradaAtiva(entrada, pathname)
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className={`top-pill ${className}`} data-ativo={ativo}>
          {ROTULO_CURTO[entrada.key] ?? entrada.label}
          <ChevronDown size={13} strokeWidth={2.2} className="opacity-70" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={10} className={`${MENU} w-[230px]`}>
          {entrada.children.map(c => (
            <ItemMenu key={c.to} folha={c} ativo={folhaAtiva(c, pathname)} />
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const abrirBusca = useSearchStore(s => s.setOpen)
  const { theme, toggle } = useThemeStore()
  const { profile, isAdmin, logout, allProfiles, viewAsBrokerId, setViewAsBroker } = useAuthStore()
  const naoLidas = useUnreadCount()
  const sinoRef = useRef<HTMLButtonElement>(null)
  const [avisos, setAvisos] = useState(false)
  const [criar, setCriar] = useState(false)

  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  const allowedMenus = profile?.allowedMenus ?? null
  const secoes = filtrarPorPermissao(key => isAdmin || allowedMenus === null || allowedMenus.includes(key))
  const entradas = secoes.flatMap(s => s.items)
  const porChave = (k: string) => entradas.find(e => e.key === k)

  const fixas  = FIXAS.map(porChave).filter((e): e is NavEntry => Boolean(e))
  const largas = LARGAS.map(porChave).filter((e): e is NavEntry => Boolean(e))
  const naBarra = new Set([...FIXAS, ...LARGAS])
  // "Mais": o resto, por seção, com os grupos achatados ("Produtos · Prontos").
  const secoesMais = secoes
    .map(s => ({
      label: s.label,
      itens: s.items
        .filter(e => !naBarra.has(e.key))
        .flatMap<NavLeaf>(e => isGroup(e) ? e.children.map(c => ({ ...c, label: `${e.label} · ${c.label}` })) : [e]),
    }))
    .filter(s => s.itens.length > 0)
  const largasAchatadas = largas.flatMap<NavLeaf>(e =>
    isGroup(e) ? e.children.map(c => ({ ...c, label: `${e.label} · ${c.label}` })) : [e])
  const maisAtivo =
    secoesMais.some(s => s.itens.some(f => folhaAtiva(f, pathname))) ||
    pathname.startsWith('/notificacoes') || pathname.startsWith('/admin')

  const nome = profile?.name ?? 'Usuário'
  const inicial = iniciais(nome) || 'U'
  const papel = isAdmin ? 'Admin · Corretor' : 'Corretor'
  const visoes: Visao[] = isAdmin
    ? [
        { id: null, inicial: 'G', label: 'Visão Global' },
        ...(profile ? [{ id: profile.id, inicial, label: 'Meu Desempenho' }] : []),
        ...allProfiles
          .filter(p => p.role === 'broker' && p.id !== profile?.id)
          .map(p => ({ id: p.id, inicial: iniciais(p.name) || '?', label: p.name })),
      ]
    : []

  function sair() {
    logout()
    navigate('/login', { replace: true })
  }

  function pilula(e: NavEntry, className = '') {
    if (isGroup(e)) return <PilulaGrupo key={e.key} entrada={e} pathname={pathname} className={className} />
    const ativo = folhaAtiva(e, pathname)
    return (
      <Link key={e.key} to={e.to} className={`top-pill ${className}`} data-ativo={ativo} aria-current={ativo ? 'page' : undefined}>
        {ROTULO_CURTO[e.key] ?? e.label}
      </Link>
    )
  }

  return (
    <header className="top-bar hidden lg:flex flex-shrink-0 relative z-30 h-[60px] items-center gap-3 px-5" aria-label="Navegação principal">
      {/* Marca */}
      <Link to="/" className="flex items-center gap-2.5 pr-3 mr-1 flex-shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-fill" aria-label="Souza Imobiliária — início">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ background: 'var(--brand-fill)' }} aria-hidden>
          <span className="font-display text-[18px] font-extrabold leading-none" style={{ color: 'var(--brand-fill-text)', letterSpacing: '-0.04em' }}>S</span>
        </span>
        <span className="hidden 2xl:flex flex-col leading-none select-none">
          <span className="font-display text-[14px] font-extrabold tracking-[-0.01em] text-white">SOUZA</span>
          <span className="font-display text-[9px] font-semibold tracking-[0.14em]" style={{ color: 'var(--bar-muted)' }}>
            IMOBILIÁRIA<span style={{ color: 'var(--brand-fill)' }}>.</span>
          </span>
        </span>
      </Link>

      {/* Destinos */}
      <nav aria-label="Telas" className="flex items-center gap-1 min-w-0">
        {fixas.map(e => pilula(e))}
        {largas.map(e => pilula(e, 'top-pill-larga'))}

        {(secoesMais.length > 0 || largas.length > 0) && (
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="top-pill" data-ativo={maisAtivo}>
                <MoreHorizontal size={15} strokeWidth={2} aria-hidden /> Mais
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="start" sideOffset={10} className={`${MENU} w-[250px] max-h-[75vh] overflow-y-auto`}>
                {largasAchatadas.length > 0 && (
                  <div className="xl:hidden pb-1">
                    {largasAchatadas.map(f => (
                      <ItemMenu key={f.to} folha={f} ativo={folhaAtiva(f, pathname)} />
                    ))}
                  </div>
                )}
                {secoesMais.map(s => (
                  <div key={s.label} className="pt-1">
                    <p className="font-label px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--nav-muted)' }}>
                      {s.label}
                    </p>
                    {s.itens.map(f => (
                      <ItemMenu key={f.to} folha={f} ativo={folhaAtiva(f, pathname)} />
                    ))}
                  </div>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        {/* Busca — o atalho aparece escrito, porque atalho escondido não se descobre */}
        <button
          type="button"
          onClick={() => abrirBusca(true)}
          aria-label="Buscar leads, contatos ou telas"
          className="flex items-center gap-2 h-9 rounded-[10px] px-2.5 2xl:w-[240px] text-[13px] transition-colors cursor-pointer
                     hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-fill"
          style={{ background: 'var(--bar-field)', border: '1px solid var(--bar-line)', color: 'var(--bar-muted)' }}
        >
          <Search size={15} strokeWidth={1.9} aria-hidden />
          <span className="hidden 2xl:block flex-1 text-left truncate">Buscar…</span>
          <kbd className="font-label text-[11px] font-semibold rounded-md px-1.5 py-0.5" style={{ border: '1px solid var(--bar-line)', color: 'var(--bar-text)' }}>
            {mac ? '⌘' : 'Ctrl'} K
          </kbd>
        </button>

        {/* Criar — a ação principal da barra, em champanhe */}
        <Popover.Root open={criar} onOpenChange={setCriar}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 h-9 rounded-[10px] px-3 text-[13px] font-semibold transition-colors cursor-pointer
                         bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Plus size={15} strokeWidth={2.4} aria-hidden /> Criar
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={10} className={`${MENU} w-[260px]`}>
              {CRIAR.map(c => (
                <button
                  key={c.to}
                  type="button"
                  onClick={() => { setCriar(false); navigate(c.to) }}
                  className="w-full flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-nav-hover
                             transition-colors cursor-pointer focus:outline-none focus-visible:bg-nav-hover"
                >
                  <span className="h-8 w-8 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: 'var(--nav-hover-bg)', border: '1px solid var(--nav-line)' }} aria-hidden>
                    <c.icon size={15} strokeWidth={1.8} style={{ color: 'var(--nav-text)' }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold" style={{ color: 'var(--nav-active-text)' }}>{c.label}</span>
                    <span className="block text-[12px]" style={{ color: 'var(--nav-muted)' }}>{c.desc}</span>
                  </span>
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {isAdmin && visoes.length > 1 && (
          <div className="w-[170px] hidden xl:block">
            <ViewSwitcher collapsed={false} visoes={visoes} atual={viewAsBrokerId} onSelect={setViewAsBroker} naBarra />
          </div>
        )}
        {isAdmin && visoes.length > 1 && (
          <div className="xl:hidden">
            <ViewSwitcher collapsed visoes={visoes} atual={viewAsBrokerId} onSelect={setViewAsBroker} naBarra />
          </div>
        )}

        <span className="mx-0.5 h-6 w-px" style={{ background: 'var(--bar-line)' }} aria-hidden />

        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          className="top-icone"
        >
          {theme === 'dark' ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
        </button>

        <button
          ref={sinoRef}
          type="button"
          onClick={() => setAvisos(v => !v)}
          aria-haspopup="dialog"
          aria-expanded={avisos}
          aria-label={naoLidas > 0 ? `Notificações — ${naoLidas} não lida${naoLidas !== 1 ? 's' : ''}` : 'Notificações'}
          className="top-icone"
        >
          <Bell size={17} strokeWidth={1.8} />
          {naoLidas > 0 && (
            <span
              key={naoLidas}
              className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-brand-fill text-brand-fill-text
                         text-[11px] font-bold flex items-center justify-center tabular-nums leading-none badge-bounce"
              aria-hidden
            >
              {naoLidas > 9 ? '9+' : naoLidas}
            </span>
          )}
        </button>

        <AccountMenu
          collapsed
          lado="abaixo"
          nome={nome}
          papel={papel}
          inicial={inicial}
          isAdmin={isAdmin}
          theme={theme}
          onToggleTheme={toggle}
          onBuscar={() => abrirBusca(true)}
          onSair={sair}
        />
      </div>

      <NotificationsPopover isOpen={avisos} onClose={() => setAvisos(false)} anchorEl={sinoRef.current} lado="abaixo" />
    </header>
  )
}
