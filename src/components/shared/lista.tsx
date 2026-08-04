import type { ReactNode } from 'react'

/**
 * Gramática das listas do sistema.
 *
 * Existe por causa de um defeito que se repetia em toda tela de lista: o
 * cabeçalho era escrito com um layout (`grid`) e as linhas com outro (`flex`),
 * ou com larguras digitadas duas vezes. Elas nunca alinhavam de verdade — os
 * rótulos flutuavam sobre conteúdo alinhado à direita, e qualquer ajuste em uma
 * das partes desalinhava a outra em silêncio.
 *
 * Aqui a largura de cada coluna é declarada UMA vez. Cabeçalho e célula leem da
 * mesma definição, então não têm como divergir.
 *
 * As três regras de conteúdo que vêm junto, e que valem mais que o alinhamento:
 *
 * 1. **Nem tudo é pílula.** Só o que exige decisão ganha moldura (etapa,
 *    alerta, prazo estourado). Procedência, responsável e vínculo são contexto
 *    e leem como texto. Quando tudo tem borda e fundo, nada tem destaque e o
 *    olho não acha por onde entrar.
 * 2. **O número tem coluna própria.** Valor, comissão e prazo em `tabular-nums`
 *    e alinhados à direita, para que a coluna possa ser varrida de cima a baixo.
 *    Nunca dividindo célula com texto num encadeamento de `else`.
 * 3. **A ação aparece no hover e no foco**, em uma faixa de largura fixa — sem
 *    empurrar o conteúdo quando aparece, e sem sumir para quem usa teclado.
 */

export interface Coluna {
  chave: string
  rotulo: string
  /** classe de largura fixa; use `flex-1` para a coluna que estica */
  largura: string
  alinhar?: 'esq' | 'dir'
  /** a partir de qual largura de tela a coluna aparece */
  desde?: 'sm' | 'md' | 'lg' | 'xl'
}

const VISIVEL_DESDE: Record<string, string> = {
  sm: 'hidden sm:block',
  md: 'hidden md:block',
  lg: 'hidden lg:block',
  xl: 'hidden xl:block',
}

/** classes de uma célula — as MESMAS usadas pelo cabeçalho */
export function celula(c: Coluna, extra = ''): string {
  return [
    c.largura,
    c.largura === 'flex-1' ? 'min-w-0' : 'flex-shrink-0',
    c.alinhar === 'dir' ? 'text-right' : '',
    c.desde ? VISIVEL_DESDE[c.desde] : '',
    extra,
  ].filter(Boolean).join(' ')
}

/**
 * Faixa de rótulos. Recebe as mesmas `colunas` que as linhas usam, então
 * alinhamento é consequência da estrutura, não de coincidência.
 *
 * `antes` e `depois` reservam o espaço de avatar/marcador à esquerda e da faixa
 * de ações à direita — a linha precisa declarar as mesmas larguras.
 */
export function CabecalhoLista({
  colunas, antes, depois, className = '',
}: {
  colunas: Coluna[]
  /** largura do que vem antes da primeira coluna (avatar, checkbox) */
  antes?: string
  /** largura da faixa de ações à direita */
  depois?: string
  className?: string
}) {
  return (
    <div
      className={`flex items-center gap-4 px-6 py-2.5 border-b border-line bg-s3/20 select-none ${className}`}
      role="presentation"
    >
      {antes && <span className={`${antes} flex-shrink-0`} aria-hidden />}
      {colunas.map(c => (
        <span key={c.chave} className={celula(c, 'font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4')}>
          {c.rotulo}
        </span>
      ))}
      {depois && <span className={`${depois} flex-shrink-0`} aria-hidden />}
    </div>
  )
}

/**
 * Faixa de ações da linha: largura fixa (não empurra o conteúdo ao aparecer) e
 * visível também no foco, senão some para quem navega por teclado.
 */
export function AcoesLinha({ largura = 'w-[52px]', children }: { largura?: string; children: ReactNode }) {
  return (
    <div className={`${largura} flex-shrink-0 flex items-center justify-end gap-1
                     opacity-0 group-hover:opacity-100 focus-within:opacity-100
                     [@media(hover:none)]:opacity-100 transition-opacity`}>
      {children}
    </div>
  )
}

/**
 * Contexto de segunda linha — telefone, responsável, vínculo. Texto separado
 * por ponto médio, nunca uma fileira de pílulas.
 */
export function ContextoLinha({ itens }: { itens: (ReactNode | null | false | undefined)[] }) {
  const visiveis = itens.filter(Boolean)
  if (visiveis.length === 0) return null
  return (
    <div className="flex items-center gap-2 mt-0.5 text-xs text-t3 min-w-0">
      {visiveis.map((item, i) => (
        <span key={i} className="flex items-center gap-2 min-w-0">
          {i > 0 && <span className="text-t5" aria-hidden>·</span>}
          {item}
        </span>
      ))}
    </div>
  )
}

/**
 * Número de coluna: peso de dado, alinhado à direita, com travessão quando não
 * há valor — para a coluna nunca ficar com buraco.
 */
export function NumeroCelula({ children, tom = 'forte' }: { children: ReactNode; tom?: 'forte' | 'suave' }) {
  if (children === null || children === undefined || children === '') {
    return <p className="text-xs text-t5">—</p>
  }
  return (
    <p className={tom === 'forte'
      ? 'font-heading text-[13px] font-bold text-t2 tabular-nums'
      : 'text-xs text-t3 tabular-nums'}>
      {children}
    </p>
  )
}
