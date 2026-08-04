import { Trophy, Package, Clock3, PhoneCall, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatCurrency } from '../../../lib/formatters'
import { STAGE_THEME } from '../../../lib/stageTheme'
import type { LeadFunnelStage } from '../../../types'
import type { PulseHoje, PulseBroker, PulseVgl, PulseDestaques } from '../types'

/**
 * Relatório de um dia FECHADO. Hoje serve só à página "Ontem".
 *
 * Não existe balanço do dia corrente de propósito: os mesmos números já estão
 * na página ao vivo, com mais contexto ao redor. O que esta página acrescenta
 * é o que só dá para saber com o dia inteiro na mão — para onde o funil andou,
 * qual produto puxou demanda, em que hora o dia aconteceu e quem produziu mais.
 *
 * O componente recebe o dia por parâmetro; se um dia entrar "anteontem" ou
 * "semana passada" no carrossel, nada aqui muda.
 */

function Numero({ valor, rotulo, destaque = false }: {
  valor: number; rotulo: string; destaque?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
      <span
        className={`font-heading font-extrabold tabular-nums leading-none tracking-tight text-[52px] ${
          destaque ? 'text-brand' : 'text-t1'
        }`}
      >
        {String(valor).padStart(2, '0')}
      </span>
      <span className="font-label text-[10px] uppercase tracking-[0.16em] text-t4 text-center">
        {rotulo}
      </span>
    </div>
  )
}

function Bloco({ icon: Icon, titulo, children, className = '' }: {
  icon: LucideIcon; titulo: string; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`rounded-[14px] border border-line surface-premium px-4 py-3 flex flex-col ${className}`}>
      <header className="flex items-center gap-2 mb-2.5 shrink-0">
        <Icon size={14} strokeWidth={1.6} className="text-t4" aria-hidden />
        <h3 className="font-label text-[10px] uppercase tracking-[0.14em] text-t4">{titulo}</h3>
      </header>
      {children}
    </section>
  )
}

/**
 * Linha "rótulo … valor" dos blocos de destaque.
 *
 * O valor vai em Areia por padrão. Aqui o dourado não é enfeite: são dezenas
 * de números pequenos lado a lado, e em branco eles se misturavam com os
 * rótulos — o olho tinha que procurar o dado em vez de encontrá-lo. Uma cor
 * só para todos os valores cria a coluna que a leitura precisa.
 */
function Linha({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="flex items-baseline gap-2 py-[3px]">
      <span className="text-[13px] text-t3 truncate">{rotulo}</span>
      <span className="flex-1 border-b border-dashed border-line/60 translate-y-[-3px]" aria-hidden />
      <span
        className="font-heading font-extrabold tabular-nums text-[17px] leading-none shrink-0"
        style={{ color: cor ?? 'var(--brand)' }}
      >
        {valor}
      </span>
    </div>
  )
}

export function ClosingSummary({ hoje, destaques, corretores, vgl }: {
  hoje:       PulseHoje
  destaques?: PulseDestaques
  corretores: PulseBroker[]
  vgl:        PulseVgl | null
}) {
  const atividade = (c: PulseBroker) =>
    c.interacoesHoje + c.leadsHoje + c.visitasHoje + c.vendasHoje + c.ligacoesHoje

  // Só quem fez algo entra no ranking — lista de zeros não é ranking.
  const ranking = [...corretores]
    .filter(c => atividade(c) > 0)
    .sort((a, b) => (b.vendasHoje - a.vendasHoje) || (atividade(b) - atividade(a)))

  const campeao = destaques?.campeaoId
    ? ranking.find(c => c.brokerId === destaques.campeaoId) ?? ranking[0]
    : ranking[0]

  // Barras do ranking são proporcionais ao líder, não ao total: com dois
  // corretores, proporção sobre o total daria sempre metade da barra.
  const teto = Math.max(...ranking.map(atividade), 1)

  const lig = destaques?.ligacoesDesfecho

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* ── Os números do dia ─────────────────────────────────────────────── */}
      <div className="shrink-0 rounded-[14px] border border-line surface-premium py-4 flex items-start">
        <Numero valor={hoje.interacoes}      rotulo="Atendimentos" />
        <Numero valor={hoje.leadsNovos}      rotulo="Leads novos" />
        <Numero valor={hoje.mudancasEtapa}   rotulo="Avanços no funil" />
        <Numero valor={hoje.ligacoes}        rotulo="Ligações" />
        <Numero valor={hoje.visitasMarcadas} rotulo="Visitas" />
        <Numero valor={hoje.vendasQtd}       rotulo="Vendas" destaque={hoje.vendasQtd > 0} />
      </div>

      {/* ── Quem produziu × o que aconteceu ───────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">

        <Bloco icon={Trophy} titulo="Campeão do dia" className="min-h-0">
          {campeao ? (
            <>
              <div className="flex items-baseline gap-2.5 mb-1">
                <Trophy size={22} strokeWidth={1.6} className="text-brand shrink-0" aria-hidden />
                <span className="font-heading font-extrabold text-[26px] leading-none gradient-text truncate">
                  {campeao.nome.split(' ')[0]}
                </span>
                <span className="font-label text-[10px] uppercase tracking-[0.12em] text-t4 tabular-nums ml-auto shrink-0">
                  {atividade(campeao)} ações
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pulse-scroll mt-2">
                {ranking.map(c => {
                  const total = atividade(c)
                  const lider = c.brokerId === campeao.brokerId
                  return (
                    <div key={c.brokerId} className="py-1.5">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className={`text-[13px] truncate ${lider ? 'text-t1 font-medium' : 'text-t3'}`}>
                          {c.nome}
                        </span>
                        <span className="ml-auto font-label text-[10px] uppercase tracking-[0.08em] text-t4 tabular-nums shrink-0">
                          {c.leadsHoje} leads · {c.interacoesHoje} at
                          {c.ligacoesHoje > 0 && ` · ${c.ligacoesHoje} lig`}
                          {c.vendasHoje > 0 && <span className="text-brand"> · {c.vendasHoje} venda</span>}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-s3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-[width] duration-[420ms]"
                          style={{
                            width: `${Math.round((total / teto) * 100)}%`,
                            background: lider ? 'var(--brand)' : 'var(--t5)',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-t4 text-sm">Nenhuma atividade registrada.</p>
          )}
        </Bloco>

        <div className="flex flex-col gap-3 min-h-0">
          <Bloco icon={TrendingUp} titulo="Destaques do dia" className="flex-1 min-h-0">
            {destaques?.produtoTop && (
              <Linha
                rotulo="Produto mais procurado"
                valor={`${destaques.produtoTop.nome} · ${destaques.produtoTop.qtd}`}
              />
            )}
            {destaques?.horaPico !== null && destaques?.horaPico !== undefined && (
              <Linha
                rotulo="Hora de pico"
                valor={`${String(destaques.horaPico).padStart(2, '0')}h · ${destaques.horaPicoQtd} ações`}
              />
            )}
            <Linha rotulo="WhatsApp enviados" valor={String(destaques?.whatsapp ?? 0)} />

            {/* Para ONDE o funil andou diz mais que quantos avanços houve */}
            {(destaques?.avancosPorEtapa ?? []).slice(0, 3).map(a => (
              <Linha
                key={a.etapa}
                rotulo={`Avanços para ${STAGE_THEME[a.etapa as LeadFunnelStage]?.label ?? a.etapa}`}
                valor={String(a.qtd)}
              />
            ))}
          </Bloco>

          {/*
            Prospecção aparece SEMPRE, inclusive zerada: num dia sem ligação o
            zero é a informação — a base fria não foi tocada.

            Não existe bloco de "faturamento do dia": em imobiliária o
            faturamento é mensal, e o VGL do mês já está no rodapé. Um valor
            diário aqui sugeriria uma meta diária que não existe.
          */}
          <Bloco icon={PhoneCall} titulo="Prospecção ativa" className="shrink-0">
            <Linha rotulo="Ligações feitas"   valor={String(lig?.total ?? 0)} />
            <Linha rotulo="Falou com alguém"  valor={String(lig?.falou ?? 0)} />
            <Linha rotulo="Interessados"      valor={String(lig?.interessados ?? 0)} />
            <Linha rotulo="Retorno agendado"  valor={String(lig?.retornos ?? 0)} />
          </Bloco>
        </div>
      </div>

      {/* ── O mês, para dar escala ao dia ─────────────────────────────────── */}
      {vgl && (
        <div className="shrink-0 rounded-[14px] border border-line surface-premium px-5 py-2.5 flex items-center gap-8">
          <div className="flex items-baseline gap-2">
            <Package size={14} strokeWidth={1.6} className="text-t4" aria-hidden />
            <span className="font-heading font-extrabold text-[22px] text-brand tabular-nums leading-none">
              {formatCurrency(vgl.realizadoMes)}
            </span>
            <span className="font-label text-[10px] uppercase tracking-[0.12em] text-t4">
              VGL do mês · meta {formatCurrency(vgl.metaMes)}
            </span>
          </div>

          {vgl.diasSemVenda !== null && (
            <div className="flex items-baseline gap-2 ml-auto">
              <Clock3 size={14} strokeWidth={1.6} className="text-t4" aria-hidden />
              <span className="font-heading font-extrabold text-[22px] tabular-nums leading-none text-t2">
                {vgl.diasSemVenda}
              </span>
              <span className="font-label text-[10px] uppercase tracking-[0.12em] text-t4">
                dias sem venda
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
