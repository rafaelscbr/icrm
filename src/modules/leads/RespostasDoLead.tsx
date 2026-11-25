import type { Lead, LeadProfileField } from '../../types'
import { formatDateShort } from '../../lib/formatters'
import type { PerfilDoLead } from './useLeadProfile'
import { resumoPrimeiroContato } from './primeiroContato'

/**
 * "O que ele respondeu" — a ficha enxuta (25/11/2026).
 *
 * Substitui o "Quem é o cliente": em 1.658 leads, o corretor editou o perfil em
 * 2 e preencheu "Procura em" em 1. Fica só o que o cliente respondeu no último
 * formulário do Meta, pergunta e resposta, sem editar, mais o resultado do
 * 1º contato. Os formulários anteriores e o texto original seguem no Histórico.
 */
export function RespostasDoLead({ lead, perfil }: { lead: Lead; perfil: PerfilDoLead }) {
  const { data, loading, erro } = perfil
  const ultimo = data?.forms[0]
  const respostas = (ultimo?.answers ?? []).filter(a => a.raw && a.question)
  const contato = resumoPrimeiroContato(lead)

  if (loading && !data) {
    return (
      <section aria-busy="true">
        <span className="block h-4 w-40 rounded bg-s3 mb-3" />
        <span className="block h-3 w-full rounded bg-s3 mb-2" />
        <span className="block h-3 w-2/3 rounded bg-s3" />
      </section>
    )
  }
  // Banco é a fonte da verdade: a falha aparece, não some.
  if (erro) return <p className="text-[13.5px] text-error">Não foi possível carregar as respostas do formulário.</p>
  if (respostas.length === 0 && !contato) return null

  return (
    <section aria-labelledby="respostas-titulo">
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h3 id="respostas-titulo" className="text-[15px] font-semibold text-t1">O que ele respondeu</h3>
        {ultimo && (
          <span className="min-w-0 text-[12px] text-t4 truncate">{ultimo.formName} · {formatDateShort(ultimo.at)}</span>
        )}
      </div>
      {/* Uma linha por resposta: rótulo curto à esquerda, resposta à direita.
          A pergunta inteira fica no passar do mouse. */}
      <dl className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13.5px] leading-snug">
        {respostas.map((a, i) => (
          <div key={i} className="contents">
            <dt className="text-t4 truncate" title={primeiraMaiuscula(a.question)}>{rotuloCurto(a.field, a.question)}</dt>
            <dd className="text-t1">{primeiraMaiuscula(a.raw)}</dd>
          </div>
        ))}
        {contato && (
          <div className="contents">
            <dt className="text-t4">1º contato</dt>
            <dd className="text-t1">{contato}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}

/** Rótulos curtos dos campos que o sistema reconhece nas perguntas do formulário. */
const ROTULO_CURTO: Record<LeadProfileField, string> = {
  objetivo: 'Objetivo', renda: 'Renda', entrada: 'Entrada', fgts: 'FGTS', prazo: 'Quando',
  tipologia: 'Tipologia', capacidade: 'Entrada e parcelas', interesse_visita: 'Visita',
  regioes: 'Regiões', tipologias: 'Tipologias', idade: 'Idade',
}

/** O rótulo do campo; pergunta sem campo reconhecido vira o começo dela. */
function rotuloCurto(campo: LeadProfileField | null, pergunta: string): string {
  if (campo) return ROTULO_CURTO[campo] ?? campo
  const p = primeiraMaiuscula(pergunta.split('?')[0])
  return p.length > 24 ? `${p.slice(0, 22).trimEnd()}…` : p
}

function primeiraMaiuscula(s: string) {
  const t = s.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}
