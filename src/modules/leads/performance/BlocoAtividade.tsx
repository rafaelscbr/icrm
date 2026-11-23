import { useMemo, useState } from 'react'
import { Grafico, eixoCategoria, eixoValor } from '../../../components/charts/Grafico'
import type { CoresGrafico } from '../../../components/charts/Grafico'
import { Segmentado } from '../../../components/shared/visual'
import { Bloco, BotaoCsv } from './pecas'
import { CorretorComFoto } from '../../../components/shared/CorretorComFoto'
import { useBloco, usePerf } from './contexto'
import { horaSP, minutoDoDiaSP, nomeDeArquivo, rotuloDia } from './formatos'
import type { Atividade, AtividadeDia, Presenca } from './tipos'

/**
 * Bloco 2 — Atividade por dia (tabela, gráfico e mapa de calor) e a linha do
 * tempo de presença (acesso, primeira e última ação, perdas no pingue-pongue).
 */
export function BlocoAtividade() {
  const estado = useBloco<Atividade>('atividade')
  const { nomeDoCorretor, filtros } = usePerf()

  return (
    <Bloco
      titulo="Atividade por *dia*"
      descricao="Contatos e mudanças de etapa pela data registrada; primeira e última ação pelo horário em que ele mexeu no sistema."
      estado={estado}
      altura={320}
      acao={estado.dados && (
        <BotaoCsv
          nome={nomeDeArquivo('atividade', filtros.de, filtros.ate)}
          cabecalho={['Corretor', 'Dia', 'Contatos', 'WhatsApp', 'Ligações', 'Leads contatados', 'Mudanças de etapa', 'Descartes', 'Primeira ação', 'Última ação']}
          linhas={() => estado.dados!.dias.map(d => [nomeDoCorretor(d.corretor), d.dia, d.contatos, d.whatsapp, d.ligacoes, d.leads, d.etapas, d.descartes, horaSP(d.primeira), horaSP(d.ultima)])}
        />
      )}
    >
      {d => <ConteudoAtividade dados={d} />}
    </Bloco>
  )
}

function ConteudoAtividade({ dados }: { dados: Atividade }) {
  const { nomeDoCorretor } = usePerf()
  const corretores = useMemo(() => [...new Set(dados.dias.map(d => d.corretor))], [dados])
  const [doCalor, setDoCalor] = useState<string>(corretores[0] ?? '')
  const dias = useMemo(() => [...new Set(dados.dias.map(d => d.dia))].sort(), [dados])
  const varios = corretores.length > 1

  const opcao = useMemo(() => (t: CoresGrafico) => {
    if (!varios) {
      const linhas = dados.dias
      return {
        grid: { left: 4, right: 8, top: 34, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0 },
        xAxis: eixoCategoria(t, dias.map(rotuloDia)),
        yAxis: eixoValor(t, undefined, { minInterval: 1 }),
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        series: [
          { name: 'WhatsApp', type: 'bar', stack: 'c', barMaxWidth: 30, itemStyle: { color: t.sucesso }, data: linhas.map(l => l.whatsapp) },
          { name: 'Ligações', type: 'bar', stack: 'c', barMaxWidth: 30, itemStyle: { color: t.info, borderRadius: [6, 6, 0, 0] }, data: linhas.map(l => l.ligacoes) },
        ],
      }
    }
    const paleta = [t.marca, t.info, t.sucesso, t.atencao, t.neutro]
    return {
      grid: { left: 4, right: 8, top: 34, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0 },
      xAxis: eixoCategoria(t, dias.map(rotuloDia)),
      yAxis: eixoValor(t, undefined, { minInterval: 1 }),
      tooltip: { trigger: 'axis' },
      series: corretores.map((c, i) => ({
        name: nomeDoCorretor(c).split(' ')[0], type: 'line', smooth: true, symbolSize: 6,
        lineStyle: { width: 2, color: paleta[i % paleta.length] }, itemStyle: { color: paleta[i % paleta.length] },
        data: dias.map(dia => dados.dias.find(x => x.corretor === c && x.dia === dia)?.contatos ?? 0),
      })),
    }
  }, [dados, dias, corretores, varios, nomeDoCorretor])

  return (
    <div className="flex flex-col gap-6">
      <Grafico opcao={opcao} altura={220}
               rotulo={varios ? 'Contatos por dia de cada corretor' : 'Contatos por dia, WhatsApp e ligações'} />

      <TabelaDias linhas={dados.dias} varios={varios} />

      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h4 className="text-[13px] font-semibold text-t2">Quando ele trabalha — ações por dia da semana e hora</h4>
          {varios && (
            <Segmentado rotulo="Corretor do mapa de calor" valor={doCalor} onChange={setDoCalor}
                        opcoes={corretores.map(c => ({ value: c, label: nomeDoCorretor(c).split(' ')[0] }))} />
          )}
        </div>
        <MapaDeCalor celulas={dados.calor.filter(c => c.corretor === (varios ? doCalor : corretores[0]))} />
      </div>
    </div>
  )
}

function TabelaDias({ linhas, varios }: { linhas: AtividadeDia[]; varios: boolean }) {
  const { nomeDoCorretor } = usePerf()
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13px] tabular-nums" aria-label="Atividade por dia">
        <thead>
          <tr className="text-[12px] text-t4">
            {varios && <th scope="col" className="text-left font-medium px-1 pb-2">Corretor</th>}
            <th scope="col" className="text-left font-medium px-1 pb-2">Dia</th>
            <th scope="col" className="text-right font-medium px-1 pb-2">Contatos</th>
            <th scope="col" className="text-right font-medium px-1 pb-2">WhatsApp</th>
            <th scope="col" className="text-right font-medium px-1 pb-2">Ligações</th>
            <th scope="col" className="text-right font-medium px-1 pb-2">Leads</th>
            <th scope="col" className="text-right font-medium px-1 pb-2">Etapas</th>
            <th scope="col" className="text-right font-medium px-1 pb-2">Descartes</th>
            <th scope="col" className="text-right font-medium px-1 pb-2">1ª ação</th>
            <th scope="col" className="text-right font-medium px-1 pb-2">Última</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => {
            const parado = l.acoes === 0
            return (
              <tr key={`${l.corretor}${l.dia}`} className={`border-t border-line ${parado ? 'text-t4' : 'text-t1'}`}>
                {varios && (
                  <td className="px-1 py-1.5 whitespace-nowrap">
                    <CorretorComFoto id={l.corretor} nome={nomeDoCorretor(l.corretor)} tamanho={24} className="gap-1.5">
                      {nomeDoCorretor(l.corretor).split(' ')[0]}
                    </CorretorComFoto>
                  </td>
                )}
                <td className="px-1 py-1.5 whitespace-nowrap">{rotuloDia(l.dia)}</td>
                <td className="px-1 py-1.5 text-right font-semibold">{l.contatos}</td>
                <td className="px-1 py-1.5 text-right">{l.whatsapp}</td>
                <td className="px-1 py-1.5 text-right">{l.ligacoes}</td>
                <td className="px-1 py-1.5 text-right">{l.leads}</td>
                <td className="px-1 py-1.5 text-right">{l.etapas}</td>
                <td className="px-1 py-1.5 text-right">{l.descartes}</td>
                <td className="px-1 py-1.5 text-right">{horaSP(l.primeira)}</td>
                <td className="px-1 py-1.5 text-right">{horaSP(l.ultima)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const SEMANA_SEG = [1, 2, 3, 4, 5, 6, 0]
const ROT_SEMANA: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sáb' }
const HORAS = Array.from({ length: 17 }, (_, i) => i + 6) // 6h às 22h

/** Mapa de calor: um quadrado por dia da semana e hora; quanto mais ações, mais cor. */
export function MapaDeCalor({ celulas }: { celulas: { dow: number; hora: number; n: number }[] }) {
  const max = Math.max(1, ...celulas.map(c => c.n))
  const mapa = new Map(celulas.map(c => [`${c.dow}-${c.hora}`, c.n]))
  const fora = celulas.filter(c => c.hora < 6 || c.hora > 22).reduce((s, c) => s + c.n, 0)
  if (celulas.length === 0) return <p className="text-[13px] text-t4 py-3">Nenhuma ação registrada no período.</p>
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[3px]" aria-label="Ações por dia da semana e hora">
        <thead>
          <tr>
            <th scope="col" className="w-9" />
            {HORAS.map(h => (
              <th key={h} scope="col" className="text-[11px] font-medium text-t4 w-7 text-center">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SEMANA_SEG.map(d => (
            <tr key={d}>
              <th scope="row" className="text-[11.5px] font-medium text-t3 text-left pr-1">{ROT_SEMANA[d]}</th>
              {HORAS.map(h => {
                const n = mapa.get(`${d}-${h}`) ?? 0
                const forca = n === 0 ? 0 : 12 + Math.round((88 * n) / max)
                return (
                  <td key={h} title={`${ROT_SEMANA[d]} às ${h}h: ${n} ${n === 1 ? 'ação' : 'ações'}`}
                      className="w-7 h-6 rounded-[5px]"
                      style={{ background: n === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--brand-fill) ${forca}%, var(--surface-2))` }}>
                    <span className="sr-only">{n}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {fora > 0 && <p className="text-[12px] text-t4 mt-1">{fora} {fora === 1 ? 'ação' : 'ações'} antes das 6h ou depois das 22h.</p>}
    </div>
  )
}

// ── Presença: a linha do tempo do dia ────────────────────────────────────────

const INI = 6 * 60
const FIM = 23 * 60
const posicao = (iso: string) => `${Math.min(100, Math.max(0, ((minutoDoDiaSP(iso) - INI) / (FIM - INI)) * 100))}%`

export function BlocoPresenca() {
  const estado = useBloco<Presenca>('presenca')
  const { nomeDoCorretor } = usePerf()
  return (
    <Bloco
      titulo="Linha do tempo do *dia*"
      descricao={<>Acesso ao sistema, primeira e última ação e as perdas no pingue-pongue, na mesma régua (6h às 23h). Mostra no máximo os últimos 31 dias do período.</>}
      estado={estado}
      altura={240}
    >
      {d => (
        <div className="flex flex-col gap-1">
          {!d.registro_desde && (
            <p className="text-[12.5px] text-warning mb-2">
              O registro de acesso começa a partir desta versão do sistema. Até lá, aparecem só as ações e as perdas.
            </p>
          )}
          <div className="flex items-center gap-4 flex-wrap text-[12px] text-t3 mb-2" aria-hidden>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-info" /> acesso</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-5 h-1.5 rounded-full bg-success" /> da 1ª à última ação</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-[3px] h-3 rounded-full bg-error" /> perda no pingue-pongue</span>
          </div>
          <div className="flex text-[11px] text-t4 tabular-nums pl-[160px] pr-1">
            {[6, 9, 12, 15, 18, 21].map(h => (
              <span key={h} className="flex-1">{h}h</span>
            ))}
          </div>
          {d.dias.map(dia => (
            <div key={`${dia.corretor}${dia.dia}`} className="flex items-center gap-3 py-1">
              {/* a régua das horas acima desloca o mesmo tanto (148 + gap 12) */}
              <span className="w-[148px] flex-shrink-0 flex items-center gap-1.5 text-[12.5px] text-t2 min-w-0">
                <span className="flex-shrink-0">{rotuloDia(dia.dia)}</span>
                <span className="text-t4 flex-shrink-0" aria-hidden>·</span>
                <CorretorComFoto id={dia.corretor} nome={nomeDoCorretor(dia.corretor)} tamanho={24} className="gap-1.5 text-t4">
                  {nomeDoCorretor(dia.corretor).split(' ')[0]}
                </CorretorComFoto>
              </span>
              <div className="relative flex-1 h-5 rounded-[6px] bg-s2" role="img"
                   aria-label={`${rotuloDia(dia.dia)}: primeiro acesso ${horaSP(dia.primeiro_acesso)}, primeira ação ${horaSP(dia.primeira_acao)}, última ${horaSP(dia.ultima_acao)}, ${dia.perdas.length} perdas`}>
                {dia.primeira_acao && dia.ultima_acao && (
                  <span className="absolute top-[7px] h-1.5 rounded-full bg-success"
                        style={{ left: posicao(dia.primeira_acao), width: `calc(${posicao(dia.ultima_acao)} - ${posicao(dia.primeira_acao)} + 4px)` }} />
                )}
                {dia.acessos_em.map(a => (
                  <span key={a} title={`acesso às ${horaSP(a)}`} className="absolute top-[5px] w-2.5 h-2.5 -ml-[5px] rounded-full bg-info ring-2 ring-surface"
                        style={{ left: posicao(a) }} />
                ))}
                {dia.perdas.map(p => (
                  <span key={p} title={`perdeu um lead às ${horaSP(p)}`} className="absolute top-[3px] w-[3px] h-3.5 -ml-[1px] rounded-full bg-error"
                        style={{ left: posicao(p) }} />
                ))}
              </div>
              <span className="w-[150px] flex-shrink-0 text-[12px] text-t4 tabular-nums text-right hidden sm:block">
                {dia.primeiro_acesso ? `acesso ${horaSP(dia.primeiro_acesso)}` : 'sem acesso'} · {horaSP(dia.primeira_acao)}–{horaSP(dia.ultima_acao)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Bloco>
  )
}
