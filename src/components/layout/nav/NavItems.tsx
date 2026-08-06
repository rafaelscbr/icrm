import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { RailPopout } from './RailPopout'
import type { NavLeaf, NavGroupDef } from './navConfig'

/*
 * ESTADO ATIVO — uma decisão, não três.
 *
 * O item ativo tinha borda dourada + fundo dourado + ícone dourado ao mesmo
 * tempo. Três sinais para dizer uma coisa só, e o dourado do menu competindo
 * com o dourado que significa dinheiro no conteúdo (principios-visuais §2).
 *
 * Agora: a pastilha é NEUTRA (dá o corpo do item), e o dourado aparece em dois
 * traços finos — o filete de 3px na borda e o ícone. O olho acha a página
 * atual pela pastilha; o ouro só confirma.
 */
const PILL = 'group relative flex items-center rounded-[10px] font-medium transition-colors duration-150'

function Marcador() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full"
      style={{ background: 'var(--brand)' }}
    />
  )
}

/** Destino simples. Expandido é uma linha; recolhido é um alvo de 40×40 com rótulo flutuante. */
export function NavItem({ item, collapsed }: { item: NavLeaf; collapsed: boolean }) {
  const { icon: Icon, label, to, end } = item

  if (collapsed) {
    return (
      <RailPopout label={label}>
        <NavLink
          to={to}
          end={end}
          className={`${PILL} mx-auto h-10 w-10 justify-center`}
          style={({ isActive }) => ({
            background: isActive ? 'var(--nav-active-bg)' : undefined,
          })}
        >
          {({ isActive }) => (
            <>
              {isActive && <Marcador />}
              <Icon
                size={18}
                strokeWidth={isActive ? 2.2 : 1.8}
                style={{ color: isActive ? 'var(--brand)' : 'var(--nav-muted)' }}
                className="flex-shrink-0 transition-colors"
              />
              <span className="sr-only">{label}</span>
            </>
          )}
        </NavLink>
      </RailPopout>
    )
  }

  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `${PILL} h-9 gap-2.5 px-2.5 text-[13.5px] ${isActive ? '' : 'hover:bg-nav-hover'}`
      }
      style={({ isActive }) => ({
        background: isActive ? 'var(--nav-active-bg)' : undefined,
        color: isActive ? 'var(--nav-active-text)' : 'var(--nav-text)',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && <Marcador />}
          <Icon
            size={17}
            strokeWidth={isActive ? 2.2 : 1.8}
            style={{ color: isActive ? 'var(--brand)' : 'var(--nav-muted)' }}
            className="flex-shrink-0 transition-colors"
          />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

/** Filho de grupo — recuado, menor, sem ícone próprio quando expandido. */
function NavChild({ item }: { item: NavLeaf }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `relative flex h-8 items-center gap-2.5 rounded-lg pl-4 pr-2.5 text-[13px] font-medium
         transition-colors duration-150 ${isActive ? '' : 'hover:bg-nav-hover'}`
      }
      style={({ isActive }) => ({
        background: isActive ? 'var(--nav-active-bg)' : undefined,
        // Filho é destino, não legenda: usa o mesmo tom de texto do item de
        // primeiro nível. Em --nav-muted (40% de opacidade no escuro) os dois
        // ficavam com cara de item desabilitado.
        color: isActive ? 'var(--nav-active-text)' : 'var(--nav-text)',
      })}
    >
      {({ isActive }) => (
        <>
          {/*
            O ponto substitui o ícone: dois ícones de 14px empilhados sob um
            terceiro de 17px viravam sopa. O ponto diz "sou filho" e some do
            caminho da leitura, que aqui é o texto.
          */}
          <span
            aria-hidden
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors"
            style={{ background: isActive ? 'var(--brand)' : 'var(--nav-muted)' }}
          />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/**
 * Grupo com filhos — "Produtos" e "Prospecção Ativa".
 *
 * Expandido: acordeão que abre sozinho quando a rota atual é de um filho, então
 * quem está em Lançamentos nunca vê o próprio item escondido. A abertura anima
 * por `grid-template-rows` (0fr → 1fr): é a única forma de animar altura
 * automática sem medir o conteúdo em JS.
 *
 * Recolhido: vira um ícone só, e os filhos aparecem num painel ao passar o
 * mouse. Antes os filhos eram despejados soltos no trilho — dois ícones sem
 * pai, impossíveis de relacionar entre si.
 */
export function NavGroup({ group, collapsed }: { group: NavGroupDef; collapsed: boolean }) {
  const { pathname } = useLocation()
  const algumFilhoAtivo = group.children.some(c => pathname.startsWith(c.to))
  const [open, setOpen] = useState(algumFilhoAtivo)
  const aberto = open || algumFilhoAtivo

  if (collapsed) {
    /*
     * Recolhido os filhos aparecem soltos, sem o pai — e o rótulo flutuante de
     * cada um carrega o caminho inteiro ("Produtos · Prontos"), que é o que se
     * perde ao tirar o agrupamento.
     *
     * Um submenu flutuante seria mais organizado e foi o primeiro desenho, mas
     * custa caro no que importa: esconde rota primária atrás de "passar o mouse,
     * esperar, mirar num painel a 10px" e, no teclado, o painel vive num portal
     * no fim do <body> — a ordem de Tab deixa de acompanhar o trilho. Ícone
     * solto é um clique e um Tab por destino.
     */
    return (
      <>
        {group.children.map(c => (
          <NavItem key={c.to} item={{ ...c, label: `${group.label} · ${c.label}` }} collapsed />
        ))}
      </>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={aberto}
        className={`${PILL} h-9 w-full cursor-pointer gap-2.5 px-2.5 text-[13.5px] hover:bg-nav-hover`}
        style={{ color: algumFilhoAtivo ? 'var(--nav-active-text)' : 'var(--nav-text)' }}
      >
        <group.icon
          size={17}
          strokeWidth={algumFilhoAtivo ? 2.2 : 1.8}
          style={{ color: algumFilhoAtivo ? 'var(--brand)' : 'var(--nav-muted)' }}
          className="flex-shrink-0 transition-colors"
        />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronRight
          size={13}
          strokeWidth={2}
          style={{ color: 'var(--nav-muted)' }}
          className={`flex-shrink-0 transition-transform duration-200 ${aberto ? 'rotate-90' : ''}`}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: aberto ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div
            className="ml-[1.4rem] mt-0.5 flex flex-col gap-0.5 pl-1"
            style={{ borderLeft: '1px solid var(--nav-line)' }}
          >
            {group.children.map(c => (
              <NavChild key={c.to} item={c} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Rótulo de seção — some por completo quando o trilho está recolhido. */
export function SectionLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="mx-3 my-2 h-px" style={{ background: 'var(--nav-line)' }} aria-hidden />
  }
  return (
    <p
      className="font-label mb-1 select-none px-2.5 text-[11px] font-bold uppercase tracking-[0.14em]"
      style={{ color: 'var(--nav-muted)', opacity: 0.85 }}
    >
      {children}
    </p>
  )
}
