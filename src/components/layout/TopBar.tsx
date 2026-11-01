import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as Popover from '@radix-ui/react-popover'
import {
  Search, Plus, ChevronDown, ChevronRight, Bell, Sun, Moon,
  CheckSquare, UserPlus, Users,
} from 'lucide-react'
import { navSections, isGroup } from './nav/navConfig'
import type { NavIcon } from './nav/navConfig'
import { NotificationsPopover } from './NotificationsPopover'
import { useSearchStore } from '../../store/useSearchStore'
import { useThemeStore } from '../../store/useThemeStore'
import { useUnreadCount } from '../../store/useNotificationsStore'

/**
 * Barra global do topo (desktop) — v5, 01/11/2026.
 *
 * Junta num lugar fixo o que antes estava espalhado: o sino morava no trilho,
 * a busca era uma pílula repetida em cada cabeçalho, criar algo exigia ir até
 * a tela certa, e trocar o tema estava dentro do menu da conta. Regra de
 * arrumação:
 *
 *   trilho lateral  → ir a lugares
 *   barra do topo   → onde estou + ações que valem em qualquer tela
 *   cabeçalho       → o título e as ações DESTA tela
 *
 * No celular ela não existe: a doca de baixo e o cabeçalho cumprem o papel.
 */

interface Trilha { secao: string; grupo?: string; tela: string; icon: NavIcon }

/** "Onde estou" a partir da rota, lendo a mesma fonte do menu. */
function trilhaDa(pathname: string): Trilha | null {
  let melhor: Trilha | null = null
  let tamanho = -1
  for (const s of navSections) {
    for (const item of s.items) {
      const folhas = isGroup(item) ? item.children.map(c => ({ c, grupo: item.label })) : [{ c: item, grupo: undefined }]
      for (const { c, grupo } of folhas) {
        const casa = c.to === '/' ? pathname === '/' : pathname === c.to || pathname.startsWith(c.to + '/')
        if (casa && c.to.length > tamanho) {
          melhor = { secao: s.label, grupo, tela: c.label, icon: c.icon }
          tamanho = c.to.length
        }
      }
    }
  }
  if (pathname.startsWith('/metas/historico')) return { secao: 'Operação', grupo: 'Metas', tela: 'Histórico', icon: melhor?.icon ?? Users }
  if (pathname.startsWith('/notificacoes')) return { secao: 'Conta', tela: 'Notificações', icon: Bell }
  if (pathname.startsWith('/admin')) return { secao: 'Conta', tela: 'Administração', icon: Users }
  return melhor
}

const CRIAR = [
  { label: 'Nova tarefa',  desc: 'Visita, ligação, retorno',  icon: CheckSquare, to: '/tarefas?nova=1' },
  { label: 'Novo lead',    desc: 'Entra no funil comercial',  icon: UserPlus,    to: '/leads?novo=1' },
  { label: 'Novo contato', desc: 'Cliente ou parceiro',       icon: Users,       to: '/contatos?novo=1' },
]

const ICONE_BTN =
  'relative h-9 w-9 flex items-center justify-center rounded-[10px] text-t3 hover:text-t1 hover:bg-s2 ' +
  'transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'

export function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const abrirBusca = useSearchStore(s => s.setOpen)
  const { theme, toggle } = useThemeStore()
  const naoLidas = useUnreadCount()
  const sinoRef = useRef<HTMLButtonElement>(null)
  const [avisos, setAvisos] = useState(false)
  const [criar, setCriar] = useState(false)

  const t = trilhaDa(pathname)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <header className="hidden lg:flex sticky top-0 z-20 h-14 items-center gap-4 px-6 nav-bg-blur border-b border-line">
      {/* Onde estou */}
      <nav aria-label="Você está em" className="flex items-center gap-1.5 min-w-0 text-[13px]">
        {t ? (
          <>
            <span className="text-t4 hidden xl:inline">{t.secao}</span>
            <ChevronRight size={13} className="text-t5 hidden xl:inline" aria-hidden />
            {t.grupo && (
              <>
                <span className="text-t4">{t.grupo}</span>
                <ChevronRight size={13} className="text-t5" aria-hidden />
              </>
            )}
            <span className="flex items-center gap-1.5 font-semibold text-t1 truncate" aria-current="page">
              <t.icon size={14} strokeWidth={1.8} className="text-t3" aria-hidden />
              {t.tela}
            </span>
          </>
        ) : null}
      </nav>

      {/* Busca — o atalho aparece escrito, porque atalho escondido não se descobre */}
      <button
        type="button"
        onClick={() => abrirBusca(true)}
        className="ml-auto flex items-center gap-2.5 h-9 w-[min(380px,32vw)] rounded-[10px] border border-line bg-surface
                   px-3 text-[13px] text-t4 hover:text-t2 hover:border-line-strong transition-colors cursor-pointer
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Search size={15} strokeWidth={1.8} aria-hidden />
        <span className="flex-1 text-left truncate">Buscar leads, contatos ou telas…</span>
        <kbd className="font-label text-[11px] font-semibold text-t4 border border-line rounded-md px-1.5 py-0.5 bg-s2">
          {mac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      {/* Criar — qualquer cadastro a um clique, de qualquer tela */}
      <Popover.Root open={criar} onOpenChange={setCriar}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 h-9 rounded-[10px] border border-line-strong bg-surface px-3
                       text-[13px] font-semibold text-t1 hover:bg-s2 transition-colors cursor-pointer
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Plus size={15} strokeWidth={2.2} aria-hidden /> Criar
            <ChevronDown size={14} className="text-t4" aria-hidden />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end" sideOffset={8}
            className="z-[130] w-[260px] rounded-[14px] border border-line bg-surface p-1.5 shadow-dropdown animate-in fade-in"
          >
            {CRIAR.map(c => (
              <button
                key={c.to}
                type="button"
                onClick={() => { setCriar(false); navigate(c.to) }}
                className="w-full flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-s2
                           transition-colors cursor-pointer focus:outline-none focus-visible:bg-s2"
              >
                <span className="h-8 w-8 rounded-[9px] bg-s2 border border-line flex items-center justify-center shrink-0" aria-hidden>
                  <c.icon size={15} strokeWidth={1.8} className="text-t2" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-t1">{c.label}</span>
                  <span className="block text-[12px] text-t4">{c.desc}</span>
                </span>
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          className={ICONE_BTN}
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
          className={`${ICONE_BTN} ${avisos ? 'bg-s2 text-t1' : ''}`}
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
      </div>

      <NotificationsPopover isOpen={avisos} onClose={() => setAvisos(false)} anchorEl={sinoRef.current} lado="abaixo" />
    </header>
  )
}
