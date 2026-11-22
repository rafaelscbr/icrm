import { useMemo, useState } from 'react'
import { Segmentado } from '../../../components/shared/visual'
import { Bloco, BotaoCsv, Indicador, Quadro } from './pecas'
import { useBloco, usePerf } from './contexto'
import { ROTULO_ETAPA, nomeDeArquivo, pct, rotuloDia } from './formatos'
import type { Cadencia } from './tipos'

/**
 * Bloco 5 — Cadência de follow-up: um quadrado por dia para cada lead ativo da
 * carteira (cheio = teve contato dele naquele dia). "Hoje" é o último dia do
 * período (ou hoje, se o período vai além).
 */

export type GrupoFiltro = 'todos' | 'diario' | 'sem_contato_hoje' | 'nunca_contatou' | 'atendimento_sem_hoje'

type LeadCad = Cadencia['leads'][number]

/** Os grupos prontos do bloco. "Em atendimento sem contato hoje" atravessa os outros. */
export function filtrarCadencia(leads: LeadCad[], g: GrupoFiltro): LeadCad[] {
  switch (g) {
    case 'todos': return leads
    case 'atendimento_sem_hoje': return leads.filter(l => l.etapa === 'atendimento' && !l.contato_ref)
    default: return leads.filter(l => l.grupo === g)
  }
}

export function BlocoCadencia() {
  const estado = useBloco<Cadencia>('cadencia')
  const { filtros, nomeDoCorretor } = usePerf()

  return (
    <Bloco
      titulo="Cadência de *follow-up*"
      descricao="A carteira ativa de hoje e os dias em que cada lead teve contato do corretor dono — no máximo os últimos 31 dias do período."
      estado={estado}
      vazio={d => d.total_leads === 0}
      textoVazio="Nenhum lead ativo na carteira."
      altura={360}
      acao={estado.dados && (
        <BotaoCsv
          nome={nomeDeArquivo('cadencia', filtros.de, filtros.ate)}
          cabecalho={['Lead', 'Corretor', 'Etapa', 'Passo', 'Contatos no período', 'Dias sem contato', 'Contato no dia de referência', ...estado.dados.grade]}
          linhas={() => estado.dados!.leads.map(l => [
            l.nome, l.corretor_nome, ROTULO_ETAPA[l.etapa] ?? l.etapa, `${l.passo}/${estado.dados!.max_tentativas}`,
            l.contatos_periodo, l.dias_sem_contato, l.contato_ref ? 'sim' : 'não',
            ...estado.dados!.grade.map(g => (l.dias.includes(g) ? 'x' : '')),
          ])}
        />
      )}
    >
      {d => <Conteudo d={d} nomeDoCorretor={nomeDoCorretor} />}
    </Bloco>
  )
}

function Conteudo({ d, nomeDoCorretor }: { d: Cadencia; nomeDoCorretor: (id: string) => string }) {
  const { abrirLead } = usePerf()
  const [grupo, setGrupo] = useState<GrupoFiltro>('todos')
  const conta = (g: GrupoFiltro) => filtrarCadencia(d.leads, g).length
  const vistas = useMemo(() => filtrarCadencia(d.leads, grupo), [d, grupo])
  const varios = d.aderencia.length > 1

  return (
    <div className="flex flex-col gap-5">
      <Quadro colunas={d.aderencia.length > 2 ? 3 : d.aderencia.length === 2 ? 2 : 2}>
        {d.aderencia.map(a => (
          <Indicador
            key={a.corretor}
            rotulo={`Aderência${varios ? ` · ${nomeDoCorretor(a.corretor).split(' ')[0]}` : ''} em ${rotuloDia(d.dia_ref)}`}
            valor={pct(a.feitos, a.base)}
            tom={a.base === 0 ? undefined : a.feitos / a.base >= 0.8 ? 'sucesso' : a.feitos / a.base >= 0.5 ? 'atencao' : 'risco'}
            nota={`${a.feitos} de ${a.base} leads em cadência (followup, abaixo de ${d.max_tentativas} toques) tiveram contato no dia`}
          />
        ))}
        {!varios && (
          <Indicador rotulo="Carteira ativa" valor={d.total_leads}
                     nota={`${conta('diario')} com contato no dia · ${conta('nunca_contatou')} nunca contatados por ele`} />
        )}
      </Quadro>

      <div className="flex items-center gap-2 flex-wrap nao-imprimir">
        <Segmentado<GrupoFiltro>
          rotulo="Grupo de leads"
          valor={grupo}
          onChange={setGrupo}
          opcoes={[
            { value: 'todos', label: `Todos ${d.leads.length}` },
            { value: 'diario', label: `Acompanhamento diário ${conta('diario')}` },
            { value: 'sem_contato_hoje', label: `Sem contato hoje ${conta('sem_contato_hoje')}` },
            { value: 'nunca_contatou', label: `Sem contato dele ${conta('nunca_contatou')}` },
            { value: 'atendimento_sem_hoje', label: `Atendimento sem contato hoje ${conta('atendimento_sem_hoje')}` },
          ]}
        />
      </div>
      {d.total_leads > d.leads.length && (
        <p className="text-[12.5px] text-warning -mt-2">Mostrando {d.leads.length} de {d.total_leads} leads (os há mais tempo sem contato primeiro).</p>
      )}

      {vistas.length === 0 ? (
        <p className="text-[13px] text-t4">Nenhum lead neste grupo.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[13px] tabular-nums" aria-label="Cadência de follow-up por lead">
            <thead>
              <tr className="text-[12px] text-t4">
                <th scope="col" className="text-left font-medium px-1 pb-2">Lead</th>
                {varios && <th scope="col" className="text-left font-medium px-1 pb-2">Corretor</th>}
                <th scope="col" className="text-left font-medium px-1 pb-2">Etapa</th>
                <th scope="col" className="text-right font-medium px-1 pb-2">Passo</th>
                <th scope="col" className="text-right font-medium px-1 pb-2">Contatos</th>
                <th scope="col" className="text-right font-medium px-1 pb-2" title="Dias desde o último contato de qualquer corretor">Sem contato</th>
                <th scope="col" className="text-left font-medium px-2 pb-2">
                  <span className="flex gap-[3px]" aria-hidden>
                    {d.grade.map(g => (
                      <span key={g} className="w-3.5 text-center text-[10px] leading-none" title={rotuloDia(g)}>{Number(g.slice(8))}</span>
                    ))}
                  </span>
                  <span className="sr-only">Dias do período</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vistas.map(l => {
                const tem = new Set(l.dias)
                return (
                  <tr key={l.lead_id} className="border-t border-line cursor-pointer hover:bg-s2"
                      tabIndex={0} onClick={() => abrirLead(l.lead_id, l.nome, l.corretor_nome)}
                      onKeyDown={e => { if (e.key === 'Enter') abrirLead(l.lead_id, l.nome, l.corretor_nome) }}>
                    <td className="px-1 py-1.5 font-medium text-t1 max-w-[220px] truncate">{l.nome}</td>
                    {varios && <td className="px-1 py-1.5 text-t2">{l.corretor_nome.split(' ')[0]}</td>}
                    <td className="px-1 py-1.5 text-t2">{ROTULO_ETAPA[l.etapa] ?? l.etapa}</td>
                    <td className="px-1 py-1.5 text-right text-t2">{l.etapa === 'followup' ? `${l.passo}/${d.max_tentativas}` : '—'}</td>
                    <td className="px-1 py-1.5 text-right">{l.contatos_periodo}</td>
                    <td className={`px-1 py-1.5 text-right ${l.dias_sem_contato >= 3 ? 'text-warning font-semibold' : 'text-t2'}`}>
                      {l.ultimo_contato ? `${l.dias_sem_contato} d` : <span className="text-error">nunca</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex gap-[3px]" role="img"
                            aria-label={`${l.dias.length} de ${d.grade.length} dias com contato`}>
                        {d.grade.map(g => (
                          <span key={g} title={`${rotuloDia(g)}${tem.has(g) ? ': teve contato' : ''}`}
                                className={`w-3.5 h-3.5 rounded-[4px] ${tem.has(g) ? 'bg-success' : 'bg-s3'} ${g === d.dia_ref ? 'ring-1 ring-t3/40' : ''}`} />
                        ))}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
