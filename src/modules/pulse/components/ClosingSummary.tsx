import { formatCurrency } from '../../../lib/formatters'
import type { PulseHoje, PulseBroker, PulseVgl } from '../types'

/**
 * Balanço do dia — entra depois do expediente.
 *
 * À noite o feed ao vivo não tem o que mostrar e os painéis de ação não têm
 * o que cobrar. Em vez de uma tela parada, o Pulse vira o fechamento: o que
 * o dia produziu, quem produziu, e como isso moveu a meta do mês.
 *
 * De quebra troca a área branca da tela por poucos números grandes — menos
 * pixels acesos, menos desgaste nas 12h em que ninguém está olhando.
 */

/** A partir desta hora a tela troca para o balanço. */
export const HORA_FECHAMENTO = 20

export function estaEmFechamento(d: Date): boolean {
  const h = d.getHours()
  // Vai das 20h até a virada; depois da meia-noite o dia novo recomeça zerado.
  return h >= HORA_FECHAMENTO
}

function Numero({ valor, rotulo, destaque = false }: {
  valor: string; rotulo: string; destaque?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className={`font-heading font-extrabold tabular-nums leading-none tracking-tight ${
          destaque ? 'text-brand text-[64px]' : 'text-t1 text-[64px]'
        }`}
      >
        {valor}
      </span>
      <span className="font-label text-[11px] uppercase tracking-[0.16em] text-t4">
        {rotulo}
      </span>
    </div>
  )
}

// O título e a data ficam no PageBanner da página — aqui vão só os números.
export function ClosingSummary({ hoje, corretores, vgl }: {
  hoje:       PulseHoje
  corretores: PulseBroker[]
  vgl:        PulseVgl | null
}) {
  // Só quem fez algo aparece no balanço — lista de zeros não é balanço.
  const ranking = [...corretores]
    .filter(c => c.interacoesHoje + c.leadsHoje + c.visitasHoje + c.vendasHoje > 0)
    .sort((a, b) =>
      (b.vendasHoje - a.vendasHoje) ||
      (b.visitasHoje - a.visitasHoje) ||
      (b.interacoesHoje - a.interacoesHoje)
    )

  const n = (v: number) => String(v).padStart(2, '0')

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-10 px-10">
      <div className="flex items-start justify-center gap-16">
        <Numero valor={n(hoje.interacoes)}      rotulo="Atendimentos" />
        <Numero valor={n(hoje.leadsNovos)}      rotulo="Leads novos" />
        <Numero valor={n(hoje.visitasMarcadas)} rotulo="Visitas" />
        <Numero valor={n(hoje.vendasQtd)}       rotulo="Vendas" destaque={hoje.vendasQtd > 0} />
      </div>

      {ranking.length > 0 && (
        <div className="flex flex-col items-center gap-3">
          <span className="font-label text-[10px] uppercase tracking-[0.2em] text-t5">
            Quem produziu
          </span>
          <div className="flex items-center gap-8">
            {ranking.map(c => (
              <div key={c.brokerId} className="flex items-baseline gap-2">
                <span className="font-heading font-bold text-xl text-t1">{c.nome.split(' ')[0]}</span>
                <span className="font-label text-[11px] uppercase tracking-[0.1em] text-t4 tabular-nums">
                  {c.interacoesHoje} at · {c.leadsHoje} leads
                  {c.vendasHoje > 0 && <span className="text-brand"> · {c.vendasHoje} venda</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {vgl && (
        <div className="flex items-center gap-10 pt-2 border-t border-line/60 px-10">
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-heading font-extrabold text-[30px] text-brand tabular-nums leading-none">
              {formatCurrency(vgl.realizadoMes)}
            </span>
            <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4">
              VGL do mês · meta {formatCurrency(vgl.metaMes)}
            </span>
          </div>

          {vgl.diasSemVenda !== null && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-heading font-extrabold text-[30px] tabular-nums leading-none text-t2">
                {vgl.diasSemVenda}
              </span>
              <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4">
                dias sem venda
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
