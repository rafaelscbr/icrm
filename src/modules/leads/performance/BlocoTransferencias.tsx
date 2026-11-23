import { useMemo } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Grafico, eixoCategoria, eixoValor } from '../../../components/charts/Grafico'
import type { CoresGrafico } from '../../../components/charts/Grafico'
import { Bloco, BotaoCsv, Indicador, Quadro, Situacao, Tabela } from './pecas'
import { CorretorComFoto } from '../../../components/shared/CorretorComFoto'
import { useBloco, usePerf } from './contexto'
import { ROTULO_ETAPA, diaHoraSP, nomeDeArquivo, rotuloDia } from './formatos'
import type { Transferencias } from './tipos'

/** Bloco 4 — Pingue-pongue e transferências manuais. */
export function BlocoTransferencias() {
  const estado = useBloco<Transferencias>('transferencias')
  const { filtros } = usePerf()

  return (
    <Bloco
      titulo="Pingue-pongue e *transferências*"
      descricao="Saídas e entradas pelo prazo de 1º contato vencido, os leads que ele perdeu assim e as transferências feitas à mão."
      estado={estado}
      altura={340}
      acao={estado.dados && (
        <BotaoCsv
          nome={nomeDeArquivo('perdidos-pingue-pongue', filtros.de, filtros.ate)}
          cabecalho={['Lead', 'Recebido em', 'Saiu em', 'Foi para', 'Com quem está', 'Etapa hoje', 'Situação', 'Avançou com o outro']}
          linhas={() => estado.dados!.perdidos.map(p => [p.nome, diaHoraSP(p.recebido_em), diaHoraSP(p.saiu_em), p.para, p.dono_hoje, ROTULO_ETAPA[p.etapa] ?? p.etapa, p.situacao, p.avancou ? 'sim' : 'não'])}
        />
      )}
    >
      {d => <Conteudo d={d} />}
    </Bloco>
  )
}

function Conteudo({ d }: { d: Transferencias }) {
  const { nomeDoCorretor, abrirLead, filtros } = usePerf()
  const t = d.totais.reduce((s, x) => ({
    saidas: s.saidas + x.saidas, saidas_leads: s.saidas_leads + x.saidas_leads,
    entradas: s.entradas + x.entradas, entradas_leads: s.entradas_leads + x.entradas_leads,
  }), { saidas: 0, saidas_leads: 0, entradas: 0, entradas_leads: 0 })
  const recebidas = d.manuais.filter(m => m.direcao === 'recebida').length
  const enviadas = d.manuais.filter(m => m.direcao === 'enviada').length
  const varios = filtros.corretores.length !== 1

  const dias = useMemo(() => [...new Set(d.por_dia.map(x => x.dia))].sort(), [d])
  const opcaoDia = useMemo(() => (c: CoresGrafico) => ({
    grid: { left: 4, right: 8, top: 34, bottom: 4, containLabel: true },
    legend: { top: 0, left: 0 },
    xAxis: eixoCategoria(c, dias.map(rotuloDia)),
    yAxis: eixoValor(c, undefined, { minInterval: 1 }),
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [
      { name: 'Saídas', type: 'bar', barMaxWidth: 26, itemStyle: { color: c.risco, borderRadius: [5, 5, 0, 0] },
        data: dias.map(dia => d.por_dia.filter(x => x.dia === dia).reduce((s, x) => s + x.saidas, 0)) },
      { name: 'Entradas', type: 'bar', barMaxWidth: 26, itemStyle: { color: c.info, borderRadius: [5, 5, 0, 0] },
        data: dias.map(dia => d.por_dia.filter(x => x.dia === dia).reduce((s, x) => s + x.entradas, 0)) },
    ],
  }), [d, dias])

  const horas = Array.from({ length: 24 }, (_, h) => h)
  const opcaoHora = useMemo(() => (c: CoresGrafico) => ({
    grid: { left: 4, right: 8, top: 34, bottom: 4, containLabel: true },
    legend: { top: 0, left: 0 },
    xAxis: eixoCategoria(c, horas.map(h => `${h}h`)),
    yAxis: eixoValor(c, undefined, { minInterval: 1 }),
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [
      { name: 'Saídas', type: 'bar', stack: 'h', barMaxWidth: 18, itemStyle: { color: c.risco },
        data: horas.map(h => d.por_hora.filter(x => x.hora === h).reduce((s, x) => s + x.saidas, 0)) },
      { name: 'Entradas', type: 'bar', stack: 'h', barMaxWidth: 18, itemStyle: { color: c.info },
        data: horas.map(h => d.por_hora.filter(x => x.hora === h).reduce((s, x) => s + x.entradas, 0)) },
    ],
  }), [d]) // eslint-disable-line react-hooks/exhaustive-deps -- `horas` é fixa

  return (
    <div className="flex flex-col gap-6">
      <Quadro colunas={4}>
        <Indicador rotulo="Saídas no pingue-pongue" valor={t.saidas} tom={t.saidas > 0 ? 'risco' : undefined}
                   nota={`${t.saidas_leads} ${t.saidas_leads === 1 ? 'lead' : 'leads'} distintos`} />
        <Indicador rotulo="Entradas no pingue-pongue" valor={t.entradas} nota={`${t.entradas_leads} ${t.entradas_leads === 1 ? 'lead' : 'leads'} distintos`} />
        <Indicador rotulo="Perdidos para outro corretor" valor={d.perdidos.length} tom={d.perdidos.length > 0 ? 'risco' : undefined}
                   nota={`${d.perdidos.filter(p => p.avancou).length} avançaram com o outro`} />
        <Indicador rotulo="Transferências à mão" valor={recebidas} nota={`recebidas · enviou ${enviadas}`} />
      </Quadro>

      {d.por_dia.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div>
            <h4 className="text-[13px] font-semibold text-t2 mb-1">Por dia</h4>
            <Grafico opcao={opcaoDia} altura={200} rotulo="Saídas e entradas no pingue-pongue por dia" />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold text-t2 mb-1">Por hora do dia</h4>
            <Grafico opcao={opcaoHora} altura={200} rotulo="Saídas e entradas no pingue-pongue por hora" />
          </div>
        </div>
      )}

      <div>
        <h4 className="text-[13px] font-semibold text-t2 mb-2">Leads perdidos no pingue-pongue</h4>
        {d.perdidos.length === 0 ? (
          <p className="text-[13px] text-t4">Nenhum lead do rodízio perdido no período.</p>
        ) : (
          <Tabela
            rotulo="Leads perdidos no pingue-pongue"
            linhas={d.perdidos}
            chave={p => `${p.corretor}${p.lead_id}`}
            onLinha={p => abrirLead(p.lead_id, p.nome, p.dono_hoje ?? '')}
            ordemInicial={{ chave: 'saiu', desc: true }}
            colunas={[
              { chave: 'nome', rotulo: 'Lead', ordem: p => p.nome.toLowerCase(), valor: p => <span className="font-medium text-t1">{p.nome}</span> },
              ...(varios ? [{ chave: 'corretor', rotulo: 'Perdeu', valor: (p: Transferencias['perdidos'][number]) => (
                <CorretorComFoto id={p.corretor} nome={nomeDoCorretor(p.corretor)} tamanho={24} className="gap-1.5 whitespace-nowrap">
                  {nomeDoCorretor(p.corretor).split(' ')[0]}
                </CorretorComFoto>
              ) }] : []),
              { chave: 'recebido', rotulo: 'Recebido', ordem: p => p.recebido_em, valor: p => diaHoraSP(p.recebido_em) },
              { chave: 'saiu', rotulo: 'Saiu', ordem: p => p.saiu_em, valor: p => diaHoraSP(p.saiu_em) },
              { chave: 'para', rotulo: 'Foi para', ordem: p => p.para, valor: p => p.para?.split(' ')[0] ?? '—' },
              { chave: 'hoje', rotulo: 'Hoje', ordem: p => `${p.avancou ? 0 : 1}${p.etapa}`, valor: p => (
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  <span>{ROTULO_ETAPA[p.etapa] ?? p.etapa}</span>
                  <Situacao s={p.situacao} />
                  {p.dono_hoje && <span className="text-[12px] text-t4">com {p.dono_hoje.split(' ')[0]}</span>}
                  {p.avancou && (
                    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-warning" title="Avançou no funil depois que saiu dele">
                      <ArrowUpRight size={12} strokeWidth={2.2} aria-hidden /> avançou
                    </span>
                  )}
                </span>
              ) },
            ]}
          />
        )}
      </div>

      {d.ida_e_volta.length > 0 && (
        <div>
          <h4 className="text-[13px] font-semibold text-t2 mb-0.5">Em ida e volta</h4>
          <p className="text-[12.5px] text-t4 mb-2">Leads que passaram por ele e trocaram de mão mais de 2 vezes por falta de contato.</p>
          <Tabela
            rotulo="Leads em ida e volta"
            linhas={d.ida_e_volta}
            chave={v => `${v.corretor}${v.lead_id}`}
            onLinha={v => abrirLead(v.lead_id, v.nome, v.dono_hoje ?? '')}
            ordemInicial={{ chave: 'n', desc: true }}
            colunas={[
              { chave: 'nome', rotulo: 'Lead', ordem: v => v.nome.toLowerCase(), valor: v => <span className="font-medium text-t1">{v.nome}</span> },
              { chave: 'n', rotulo: 'Trocas', alinhar: 'direita', ordem: v => v.transferencias, valor: v => <span className="font-semibold text-warning">{v.transferencias}</span> },
              { chave: 'por', rotulo: 'Passou por', valor: v => v.passou_por ?? '—' },
              { chave: 'contato', rotulo: '1º contato', ordem: v => v.primeiro_contato, valor: v => v.primeiro_contato ? diaHoraSP(v.primeiro_contato) : <span className="text-error">nunca</span> },
              { chave: 'hoje', rotulo: 'Hoje', valor: v => `${ROTULO_ETAPA[v.etapa] ?? v.etapa}${v.dono_hoje ? ` · ${v.dono_hoje.split(' ')[0]}` : ''}${v.descartado ? ' · descartado' : ''}` },
            ]}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h4 className="text-[13px] font-semibold text-t2">Transferências à mão</h4>
          {d.manuais.length > 0 && (
            <BotaoCsv
              nome={nomeDeArquivo('transferencias-manuais', filtros.de, filtros.ate)}
              cabecalho={['Quando', 'Lead', 'Direção', 'De', 'Para']}
              linhas={() => d.manuais.map(m => [diaHoraSP(m.quando), m.nome, m.direcao, m.de, m.para])}
            />
          )}
        </div>
        {d.manuais.length === 0 ? (
          <p className="text-[13px] text-t4">Nenhuma transferência manual no período.</p>
        ) : (
          <Tabela
            rotulo="Transferências manuais"
            linhas={d.manuais}
            chave={m => `${m.corretor}${m.lead_id}${m.quando}`}
            onLinha={m => abrirLead(m.lead_id, m.nome ?? 'Lead', m.para ?? '')}
            ordemInicial={{ chave: 'quando', desc: true }}
            colunas={[
              { chave: 'quando', rotulo: 'Quando', ordem: m => m.quando, valor: m => diaHoraSP(m.quando) },
              { chave: 'nome', rotulo: 'Lead', ordem: m => (m.nome ?? '').toLowerCase(), valor: m => <span className="font-medium text-t1">{m.nome ?? '—'}</span> },
              { chave: 'dir', rotulo: '', ordem: m => m.direcao, valor: m => <span className={m.direcao === 'recebida' ? 'text-info' : 'text-t3'}>{m.direcao}</span> },
              { chave: 'de', rotulo: 'De', valor: m => m.de?.split(' ')[0] ?? '—' },
              { chave: 'para', rotulo: 'Para', valor: m => m.para?.split(' ')[0] ?? '—' },
            ]}
          />
        )}
      </div>
    </div>
  )
}
