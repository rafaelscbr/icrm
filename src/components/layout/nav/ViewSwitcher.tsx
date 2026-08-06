import * as Popover from '@radix-ui/react-popover'
import { ChevronsUpDown, Globe, Check } from 'lucide-react'

/** Marca de seleção — reserva a largura mesmo quando ausente, para os rótulos não dançarem. */
function Marca({ visivel }: { visivel: boolean }) {
  return visivel
    ? <Check size={14} strokeWidth={2.5} style={{ color: 'var(--brand)' }} className="flex-shrink-0" />
    : <span className="w-[14px] flex-shrink-0" aria-hidden />
}

export interface Visao {
  id: string | null
  inicial: string
  label: string
}

/**
 * Seletor de visão do admin — Global / Meu Desempenho / cada corretor.
 *
 * Era uma lista aberta de botões no meio do menu: uma linha por corretor,
 * crescendo com a equipe. Com sete corretores o seletor sozinho ficava maior
 * que a seção Comercial inteira, e ele muda o significado de TODAS as telas —
 * é contexto, não navegação, então não podia estar solto entre destinos.
 *
 * Agora é uma linha só, no topo, com a visão vigente escrita. Ler "estou vendo
 * o Dionata" de relance passou a ser possível — antes exigia caçar qual dos
 * botões estava aceso.
 */
export function ViewSwitcher({
  collapsed, visoes, atual, onSelect,
}: {
  collapsed: boolean
  visoes: Visao[]
  atual: string | null
  onSelect: (id: string | null) => void
}) {
  const vigente = visoes.find(v => v.id === atual) ?? visoes[0]
  if (!vigente) return null

  const global = vigente.id === null

  const Avatar = ({ v, ativo }: { v: Visao; ativo: boolean }) => (
    <span
      className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      style={{
        background: ativo ? 'var(--brand-tint)' : 'var(--nav-hover-bg)',
        color: ativo ? 'var(--brand)' : 'var(--nav-muted)',
        border: `1px solid ${ativo ? 'var(--brand)' : 'transparent'}`,
      }}
      aria-hidden
    >
      {v.id === null ? <Globe size={12} strokeWidth={2} /> : v.inicial}
    </span>
  )

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={`Visão atual: ${vigente.label}. Trocar de visão`}
          title={collapsed ? `Visão: ${vigente.label}` : undefined}
          className={`flex w-full cursor-pointer items-center rounded-[10px] transition-colors hover:bg-nav-hover
            ${collapsed ? 'justify-center py-1.5' : 'gap-2 px-2 py-1.5'}`}
          style={{ border: '1px solid var(--nav-line)' }}
        >
          <Avatar v={vigente} ativo={!global} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span
                  className="font-label block text-[10px] font-bold uppercase leading-none tracking-[0.14em]"
                  style={{ color: 'var(--nav-muted)' }}
                >
                  Visão
                </span>
                <span
                  className="mt-[3px] block truncate text-[12.5px] font-semibold leading-none"
                  style={{ color: 'var(--nav-active-text)' }}
                >
                  {vigente.label}
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
          align="start"
          sideOffset={10}
          collisionPadding={12}
          className="nav-elev z-[130] max-h-[70vh] w-[236px] overflow-y-auto rounded-[14px] p-1.5
                     animate-in fade-in slide-in-from-left-1 duration-150 focus:outline-none"
        >
          <p
            className="font-label px-2 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: 'var(--nav-muted)' }}
          >
            Ver o sistema como
          </p>
          <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Visão do sistema">
            {visoes.map(v => {
              const ativo = v.id === atual
              return (
                <Popover.Close asChild key={v.id ?? 'global'}>
                  <button
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => onSelect(v.id)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5
                               text-left text-[13px] font-medium transition-colors hover:bg-nav-hover"
                    style={{ color: ativo ? 'var(--nav-active-text)' : 'var(--nav-text)' }}
                  >
                    <Avatar v={v} ativo={ativo} />
                    <span className="flex-1 truncate">{v.label}</span>
                    <Marca visivel={ativo} />
                  </button>
                </Popover.Close>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
