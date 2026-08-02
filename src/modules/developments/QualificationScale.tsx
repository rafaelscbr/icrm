/**
 * Régua não tem centavos. "R$ 5.000,00/mês" é ruído — ninguém define renda
 * mínima com dois decimais, e a vírgula rouba a leitura da escala.
 */
function money(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  })
}

interface QualificationScaleProps {
  label: string
  min?: number
  ideal?: number
  /** Sufixo do valor — "/mês" em renda, vazio em entrada. */
  suffix?: string
  compact?: boolean
}

interface Zona {
  key: 'dificil' | 'possivel' | 'ideal'
  nome: string
  /** Largura relativa — escala é qualitativa, não proporcional a reais. */
  peso: number
  cor: string
  texto: string
  valor?: string
}

/*
 * As cores vão por `style`, não por classe utilitária: os tokens de cor do
 * sistema são `var(--x)` puro, e o Tailwind 3 NÃO gera a regra quando se pede
 * opacidade em cima disso (`bg-warning/45` simplesmente não existe no CSS
 * final — a barra some). `color-mix` resolve sem tocar nos tokens.
 *
 * "Difícil" usa o cinza, não o âmbar: --warning (#E0A030) e --brand (#E4B23C)
 * são quase a mesma cor, e lado a lado numa barra as duas primeiras zonas
 * viravam uma mancha só.
 */
const COR = {
  dificil:  'color-mix(in srgb, var(--t4) 45%, transparent)',
  possivel: 'color-mix(in srgb, var(--brand) 70%, transparent)',
  ideal:    'color-mix(in srgb, var(--success) 70%, transparent)',
}

/**
 * A régua desenhada.
 *
 * Dois números soltos ("mínimo 5.000, ideal 10.000") obrigam quem lê a montar a
 * escala de cabeça. Aqui a escala já está montada: cada zona com o nome que o
 * sistema usa para classificar. Quem cadastra vê na hora o efeito do que
 * digitou; quem atende entende sem manual.
 *
 * O número de zonas depende do que foi preenchido — desenhar "Possível" quando
 * mínimo e ideal são iguais mostraria uma faixa que não existe, e repetiria o
 * mesmo valor dos dois lados.
 */
export function QualificationScale({
  label, min, ideal, suffix = '', compact = false,
}: QualificationScaleProps) {

  const zonas: Zona[] = []

  if (min !== undefined && ideal !== undefined && ideal > min) {
    zonas.push(
      { key: 'dificil',  nome: 'Difícil',  peso: 28, cor: COR.dificil,  texto: 'text-t3' },
      { key: 'possivel', nome: 'Possível', peso: 36, cor: COR.possivel, texto: 'text-brand-text', valor: `de ${money(min)}${suffix}` },
      { key: 'ideal',    nome: 'Ideal',    peso: 36, cor: COR.ideal,    texto: 'text-success',    valor: `${money(ideal)}${suffix}+` },
    )
  } else if (min !== undefined && ideal !== undefined) {
    // Mínimo e ideal iguais: não existe meio-termo. Ou não alcança, ou é ideal.
    zonas.push(
      { key: 'dificil', nome: 'Difícil', peso: 40, cor: COR.dificil, texto: 'text-t3' },
      { key: 'ideal',   nome: 'Ideal',   peso: 60, cor: COR.ideal,   texto: 'text-success', valor: `${money(ideal)}${suffix}+` },
    )
  } else if (min !== undefined) {
    zonas.push(
      { key: 'dificil',  nome: 'Difícil',  peso: 35, cor: COR.dificil,  texto: 'text-t3' },
      { key: 'possivel', nome: 'Possível', peso: 65, cor: COR.possivel, texto: 'text-brand-text', valor: `de ${money(min)}${suffix}` },
    )
  } else if (ideal !== undefined) {
    zonas.push(
      { key: 'possivel', nome: 'Possível', peso: 45, cor: COR.possivel, texto: 'text-brand-text' },
      { key: 'ideal',    nome: 'Ideal',    peso: 55, cor: COR.ideal,    texto: 'text-success', valor: `${money(ideal)}${suffix}+` },
    )
  }

  if (zonas.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t3">{label}</p>
        <div className="h-2 rounded-full bg-s2 border border-line" aria-hidden />
        <p className="text-xs text-t4">Não definida</p>
      </div>
    )
  }

  const descricao =
    `${label}: ` +
    zonas.map(z => z.valor ? `${z.nome} ${z.valor}` : z.nome).join(', ')

  const total = zonas.reduce((s, z) => s + z.peso, 0)

  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t3">{label}</p>

      <div className="flex h-2 rounded-full overflow-hidden" role="img" aria-label={descricao}>
        {zonas.map(z => (
          <div key={z.key} style={{ width: `${(z.peso / total) * 100}%`, background: z.cor }} />
        ))}
      </div>

      <div className="flex items-start text-[11px] tabular-nums gap-1">
        {zonas.map(z => (
          <div key={z.key} style={{ width: `${(z.peso / total) * 100}%` }} className="min-w-0">
            <span className={`${z.texto} font-medium`}>{z.nome}</span>
            {z.valor && <span className="block text-t3 leading-tight">{z.valor}</span>}
          </div>
        ))}
      </div>

      {!compact && min !== undefined && ideal === undefined && (
        <p className="text-xs text-t4">
          Sem valor ideal — tudo acima do mínimo conta como Possível.
        </p>
      )}
      {!compact && min !== undefined && ideal !== undefined && ideal === min && (
        <p className="text-xs text-t4">
          Mínimo e ideal iguais — não há zona intermediária: ou alcança, ou não.
        </p>
      )}
    </div>
  )
}
