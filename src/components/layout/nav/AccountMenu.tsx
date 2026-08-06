import * as Popover from '@radix-ui/react-popover'
import { Link } from 'react-router-dom'
import {
  ChevronsUpDown, Search, Sun, Moon, ShieldCheck, LogOut, ExternalLink,
} from 'lucide-react'
import { externalTools } from './navConfig'

/**
 * Menu da conta — o depósito de tudo que NÃO é navegação.
 *
 * O rodapé do trilho tinha cinco linhas de largura total (notificações, tema,
 * recolher, cartão do usuário, sair) e a seção "Ferramentas" comia mais duas.
 * Sete alvos permanentes para ações que se usa uma vez por semana, disputando
 * atenção com os doze destinos que se usa o dia inteiro.
 *
 * Tudo isso mora aqui agora, atrás de um clique no próprio nome — que é onde
 * qualquer pessoa que já usou um SaaS vai procurar.
 */
export function AccountMenu({
  collapsed, nome, papel, inicial, isAdmin, theme, onToggleTheme, onBuscar, onSair,
}: {
  collapsed: boolean
  nome: string
  papel: string
  inicial: string
  isAdmin: boolean
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onBuscar: () => void
  onSair: () => void
}) {
  const linhaClasse =
    'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium ' +
    'transition-colors cursor-pointer hover:bg-nav-hover text-left'

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={`Conta de ${nome} — preferências, ferramentas e sair`}
          className={`flex w-full cursor-pointer items-center rounded-xl transition-colors hover:bg-nav-hover
            ${collapsed ? 'justify-center py-1.5' : 'gap-2.5 p-1.5'}`}
        >
          <span
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
            style={{ background: 'var(--brand)', color: 'var(--brand-btn-text)' }}
            aria-hidden
          >
            {inicial}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span
                  className="block truncate text-[13px] font-semibold leading-tight"
                  style={{ color: 'var(--nav-active-text)' }}
                >
                  {nome}
                </span>
                <span className="block truncate text-[11px] leading-tight" style={{ color: 'var(--nav-muted)' }}>
                  {papel}
                </span>
              </span>
              <ChevronsUpDown size={13} strokeWidth={2} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
            </>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="nav-elev z-[130] w-[248px] rounded-[14px] p-1.5
                     animate-in fade-in slide-in-from-left-1 duration-150
                     focus:outline-none"
        >
          <div className="px-2 pb-2 pt-1.5">
            <p className="truncate text-[13px] font-semibold leading-tight" style={{ color: 'var(--nav-active-text)' }}>
              {nome}
            </p>
            <p className="truncate text-[11px] leading-tight" style={{ color: 'var(--nav-muted)' }}>{papel}</p>
          </div>

          <div className="mx-1 mb-1.5 h-px" style={{ background: 'var(--nav-line)' }} />

          {/*
            A barra de busca saiu do trilho: ocupava uma faixa permanente para
            duplicar um atalho que já existe no app inteiro. Aqui ela vira o que
            sempre foi — um lembrete do ⌘K.
          */}
          <Popover.Close asChild>
            <button onClick={onBuscar} className={linhaClasse} style={{ color: 'var(--nav-text)' }}>
              <Search size={15} strokeWidth={1.8} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
              <span className="flex-1">Buscar</span>
              <kbd
                className="flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] leading-4"
                style={{ color: 'var(--nav-muted)', background: 'var(--nav-hover-bg)', border: '1px solid var(--nav-line)' }}
              >
                ⌘K
              </kbd>
            </button>
          </Popover.Close>

          {/*
            Interruptor virou par de opções. O interruptor dizia "modo escuro" e
            mostrava a chave desligada — metade das pessoas lê isso como estado
            atual, metade como o destino do clique. Duas opções com marca de
            seleção não têm essa ambiguidade.
          */}
          <div className="px-2 pb-1 pt-2">
            <p
              className="font-label mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: 'var(--nav-muted)' }}
            >
              Aparência
            </p>
            <div
              className="grid grid-cols-2 gap-1 rounded-lg p-1"
              style={{ background: 'var(--nav-hover-bg)' }}
              role="radiogroup"
              aria-label="Tema da interface"
            >
              {([
                { id: 'light', label: 'Claro',  Icon: Sun  },
                { id: 'dark',  label: 'Escuro', Icon: Moon },
              ] as const).map(({ id, label, Icon }) => {
                const ativo = theme === id
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => { if (!ativo) onToggleTheme() }}
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-[7px] py-1.5 text-[12.5px] font-medium transition-colors"
                    style={{
                      background: ativo ? 'var(--nav-elev)' : 'transparent',
                      color: ativo ? 'var(--nav-active-text)' : 'var(--nav-muted)',
                      boxShadow: ativo ? 'var(--shadow-card)' : undefined,
                    }}
                  >
                    <Icon size={13} strokeWidth={2} style={{ color: ativo ? 'var(--brand)' : 'var(--nav-muted)' }} />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="px-2 pb-1 pt-2.5">
            <p
              className="font-label mb-1 text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: 'var(--nav-muted)' }}
            >
              Ferramentas
            </p>
          </div>
          {externalTools.map(({ label, href, icon: Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={linhaClasse}
              style={{ color: 'var(--nav-text)' }}
            >
              <Icon size={15} strokeWidth={1.8} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              <ExternalLink size={11} strokeWidth={2} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
            </a>
          ))}

          <div className="mx-1 my-1.5 h-px" style={{ background: 'var(--nav-line)' }} />

          {isAdmin && (
            <Popover.Close asChild>
              <Link to="/admin" className={linhaClasse} style={{ color: 'var(--nav-text)' }}>
                <ShieldCheck size={15} strokeWidth={1.8} style={{ color: 'var(--nav-muted)' }} className="flex-shrink-0" />
                <span className="flex-1">Corretores</span>
              </Link>
            </Popover.Close>
          )}

          <button
            onClick={onSair}
            className={`${linhaClasse} hover:!bg-error-bg hover:!text-error`}
            style={{ color: 'var(--nav-text)' }}
          >
            <LogOut size={15} strokeWidth={1.8} className="flex-shrink-0" />
            <span className="flex-1">Sair da conta</span>
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
