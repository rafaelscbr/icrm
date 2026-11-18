import { Calculator } from 'lucide-react'

/**
 * Sinal de que o lead tem fluxo de pagamento guardado — no cartão do Kanban e
 * no quadro de leitura do gestor (pedido do Rafael, 19/11/2026).
 *
 * É um ícone pequeno ao lado do nome, não uma etiqueta: o cartão foi limpo de
 * etiquetas repetidas e este sinal não pode trazê-las de volta. O ícone é o do
 * Simulador; a contagem só aparece a partir de dois. A frase completa fica no
 * `title` e no rótulo para leitor de tela.
 *
 * A contagem vem do próprio lead (`fluxosCount`), mantida pelo banco — o
 * cartão não faz nenhuma leitura para saber.
 */
export function SinalDeFluxo({ quantos }: { quantos?: number }) {
  if (!quantos || quantos < 1) return null
  const frase = quantos === 1 ? '1 fluxo de pagamento salvo' : `${quantos} fluxos de pagamento salvos`
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-t2" title={frase}>
      <Calculator size={13} strokeWidth={1.9} aria-label={frase} />
      {quantos > 1 && <span className="text-[11px] font-semibold tabular-nums leading-none" aria-hidden>{quantos}</span>}
    </span>
  )
}
