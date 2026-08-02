import { formatCurrencyFull } from '../../lib/formatters'

interface QualificationScaleProps {
  label: string
  min?: number
  ideal?: number
  /** Sufixo do valor — "/mês" em renda, vazio em entrada. */
  suffix?: string
  compact?: boolean
}

/**
 * A régua desenhada.
 *
 * Dois números soltos ("mínimo 5.000, ideal 10.000") obrigam quem lê a montar a
 * escala de cabeça. Aqui a escala já está montada: três zonas, cada uma com o
 * nome que o sistema usa para classificar. Quem cadastra vê na hora o efeito do
 * que digitou; quem atende entende sem manual.
 *
 * Acessível sem cor: cada zona tem rótulo em texto, e a barra inteira é um
 * `img` com descrição completa para leitor de tela.
 */
export function QualificationScale({
  label, min, ideal, suffix = '', compact = false,
}: QualificationScaleProps) {
  const semRegua = min === undefined && ideal === undefined

  const descricao = semRegua
    ? `${label}: sem régua definida`
    : `${label}: difícil abaixo de ${min !== undefined ? formatCurrencyFull(min) : '—'}, ` +
      `possível entre ${min !== undefined ? formatCurrencyFull(min) : '—'} e ` +
      `${ideal !== undefined ? formatCurrencyFull(ideal) : '—'}, ` +
      `ideal acima de ${ideal !== undefined ? formatCurrencyFull(ideal) : '—'}`

  if (semRegua) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t3">{label}</p>
        <div className="h-2 rounded-full bg-s2 border border-line" aria-hidden />
        <p className="text-xs text-t4">Não definida</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t3">{label}</p>

      {/* Barra: difícil | possível | ideal — proporção fixa, é escala qualitativa */}
      <div
        className="flex h-2 rounded-full overflow-hidden"
        role="img"
        aria-label={descricao}
      >
        <div className="w-[28%] bg-warning/45" />
        <div className="w-[36%] bg-brand/55" />
        <div className="flex-1 bg-success/55" />
      </div>

      {/* Marcadores numéricos alinhados às fronteiras */}
      <div className="flex items-start text-[11px] tabular-nums">
        <div className="w-[28%]">
          <span className="text-warning font-medium">Difícil</span>
        </div>
        <div className="w-[36%] -ml-px">
          <span className="text-brand-text font-medium">Possível</span>
          {min !== undefined && (
            <span className="block text-t3 leading-tight">
              a partir de {formatCurrencyFull(min)}{suffix}
            </span>
          )}
        </div>
        <div className="flex-1 -ml-px">
          <span className="text-success font-medium">Ideal</span>
          {ideal !== undefined && (
            <span className="block text-t3 leading-tight">
              {formatCurrencyFull(ideal)}{suffix} ou mais
            </span>
          )}
        </div>
      </div>

      {!compact && min !== undefined && ideal === undefined && (
        <p className="text-xs text-t4">
          Sem valor ideal — tudo acima do mínimo conta como Possível.
        </p>
      )}
    </div>
  )
}
