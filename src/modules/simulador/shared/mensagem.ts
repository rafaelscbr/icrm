import { ReforcoPeriodo } from './types'
import { fmtBRL } from './components'

/**
 * Peças do texto de WhatsApp — o mesmo fluxo da imagem, em mensagem.
 *
 * Cada modo monta o próprio texto (posChaves/, direto/, associativo/
 * mensagem.ts) com estas peças, para os três falarem com o cliente do mesmo
 * jeito: saudação pelo primeiro nome, o valor do imóvel, a condição em
 * tópicos com a parcela em destaque, e o fechamento com quem enviou.
 *
 * Formatação é a do próprio WhatsApp: *negrito* e _itálico_. Sem emoji — a
 * mensagem sai com a assinatura do corretor e segue a identidade Souza.
 */

export function primeiroNome(nome: string): string {
  const n = nome.trim().split(/\s+/)[0] ?? ''
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ''
}

export function saudacao(cliente: string): string {
  const nome = primeiroNome(cliente)
  return nome ? `Olá, ${nome}! Tudo bem?` : 'Olá! Tudo bem?'
}

export function fechamento(corretor: string): string {
  return [
    'Qualquer dúvida, é só me chamar.',
    ...(corretor.trim() ? [corretor.trim()] : []),
    '',
    '_Valores sujeitos a confirmação._',
  ].join('\n')
}

/** "do *Porto Velas 3D*", ou "do imóvel" quando o campo ficou vazio. */
export function doEmpreendimento(empreendimento: string): string {
  return empreendimento.trim() ? `do *${empreendimento.trim()}*` : 'do imóvel'
}

/** "Entrada: R$ 36.412,06" ou "Entrada em 2x de R$ 18.206,03 (total R$ 36.412,06)" */
export function linhaEntrada(qtd: number, valor: number): string {
  if (qtd <= 1) return `• Entrada: ${fmtBRL(valor)}`
  return `• Entrada em ${qtd}x de ${fmtBRL(valor)} (total ${fmtBRL(qtd * valor)})`
}

const PERIODO_SING: Record<ReforcoPeriodo, string> = { semestral: 'semestral', anual: 'anual' }
const PERIODO_PLUR: Record<ReforcoPeriodo, string> = { semestral: 'semestrais', anual: 'anuais' }

/** "9 reforços semestrais de R$ 8.000,00 (total R$ 72.000,00)" — nada quando não há. */
export function linhaReforco(qtd: number, valor: number, periodo: ReforcoPeriodo): string | null {
  if (qtd <= 0 || valor <= 0) return null
  if (qtd === 1) return `• 1 reforço ${PERIODO_SING[periodo]} de ${fmtBRL(valor)}`
  return `• ${qtd} reforços ${PERIODO_PLUR[periodo]} de ${fmtBRL(valor)} (total ${fmtBRL(qtd * valor)})`
}

/** A parcela é o número que decide a conversa — vai em negrito. */
export function linhaParcelas(qtd: number, valor: number, complemento = ''): string {
  const rotulo = qtd === 1 ? 'parcela mensal' : 'parcelas mensais'
  return `• *${qtd} ${rotulo} de ${fmtBRL(valor)}*${complemento}`
}

export function pct(v: number): string {
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** Junta blocos com uma linha em branco entre eles, pulando os vazios. */
export function montar(blocos: (string | null | false | undefined)[]): string {
  return blocos.filter((b): b is string => !!b && b.trim() !== '').join('\n\n')
}
