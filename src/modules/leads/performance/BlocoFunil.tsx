import { Fragment } from 'react'
import { Bloco, BotaoCsv, Tabela } from './pecas'
import { useBloco, usePerf } from './contexto'
import { ROTULO_ETAPA, diaHoraSP, nomeDeArquivo, pct } from './formatos'
import type { Funil } from './tipos'

/**
 * Bloco 6 — Funil do corretor: o que entrou e o que saiu de cada etapa pelas
 * mãos dele no período, a conversão para a etapa seguinte, o tempo médio em
 * cada uma e os leads parados há mais de X dias.
 */
export function BlocoFunil({ onParadoDias }: { onParadoDias: (n: number) => void }) {
  const estado = useBloco<Funil>('funil')
  const { filtros, nomeDoCorretor, abrirLead } = usePerf()

  return (
    <Bloco
      titulo="Funil do *corretor*"
      descricao="Movimentos de etapa feitos por ele no período. Conversão = quantos avançaram a partir da etapa sobre quantos entraram nela; pode passar de 100% quando avançam leads que entraram antes do período."
      estado={estado}
      altura={300}
      acao={estado.dados && (
        <BotaoCsv
          nome={nomeDeArquivo('leads-parados', filtros.de, filtros.ate)}
          cabecalho={['Lead', 'Corretor', 'Etapa', 'Último contato', 'Dias sem contato']}
          linhas={() => estado.dados!.parados.map(p => [p.nome, nomeDoCorretor(p.corretor), ROTULO_ETAPA[p.etapa] ?? p.etapa, diaHoraSP(p.ultimo_contato), p.dias])}
        />
      )}
    >
      {d => {
        const corretores = [...new Set(d.etapas.map(e => e.corretor))]
        return (
          <div className="flex flex-col gap-6">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[13px] tabular-nums" aria-label="Funil do corretor por etapa">
                <thead>
                  <tr className="text-[12px] text-t4">
                    <th scope="col" className="text-left font-medium px-1 pb-2">Etapa</th>
                    <th scope="col" className="text-right font-medium px-1 pb-2">Na carteira hoje</th>
                    <th scope="col" className="text-right font-medium px-1 pb-2">Entraram</th>
                    <th scope="col" className="text-right font-medium px-1 pb-2">Avançaram</th>
                    <th scope="col" className="text-right font-medium px-1 pb-2">Voltaram</th>
                    <th scope="col" className="text-right font-medium px-1 pb-2">Conversão</th>
                    <th scope="col" className="text-right font-medium px-1 pb-2">Tempo médio na etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {corretores.map(c => (
                    <Fragment key={c}>
                      {corretores.length > 1 && (
                        <tr><th colSpan={7} scope="colgroup" className="text-left text-[12.5px] font-semibold text-t2 pt-3 pb-1 px-1">{nomeDoCorretor(c)}</th></tr>
                      )}
                      {d.etapas.filter(e => e.corretor === c).map(e => (
                        <tr key={`${c}${e.etapa}`} className="border-t border-line">
                          <th scope="row" className="text-left font-normal text-t1 px-1 py-2">{ROTULO_ETAPA[e.etapa] ?? e.etapa}</th>
                          <td className="text-right px-1 py-2 text-t2">{e.na_carteira}</td>
                          <td className="text-right px-1 py-2">{e.entraram}</td>
                          <td className="text-right px-1 py-2 text-success">{e.avancaram}</td>
                          <td className="text-right px-1 py-2 text-t3">{e.voltaram}</td>
                          <td className="text-right px-1 py-2 font-semibold">{e.etapa === 'venda' ? '—' : pct(e.avancaram, e.entraram)}</td>
                          <td className="text-right px-1 py-2 text-t2">
                            {e.tempo_medio_dias == null ? '—' : `${String(e.tempo_medio_dias).replace('.', ',')} d`}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <p className="text-[12px] text-t4 mt-2">Em "Lead", entraram = leads recebidos no período. Tempo médio = da entrada na etapa até ele mover o lead dali.</p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <h4 className="text-[13px] font-semibold text-t2">
                  Leads parados <span className="text-t4 font-normal">· {d.total_parados} sem contato há mais de {d.parado_dias} {d.parado_dias === 1 ? 'dia' : 'dias'}</span>
                </h4>
                <label className="inline-flex items-center gap-2 text-[12.5px] text-t3 nao-imprimir">
                  Mais de
                  <select value={filtros.paradoDias} onChange={e => onParadoDias(Number(e.target.value))}
                          className="h-8 px-2 rounded-[9px] bg-s2 text-[13px] text-t1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                    {[1, 2, 3, 5, 7, 10, 15, 30].map(n => <option key={n} value={n}>{n} {n === 1 ? 'dia' : 'dias'}</option>)}
                  </select>
                </label>
              </div>
              {d.parados.length === 0 ? (
                <p className="text-[13px] text-t4">Nenhum lead parado com esse limite.</p>
              ) : (
                <Tabela
                  rotulo="Leads parados"
                  linhas={d.parados}
                  chave={p => p.lead_id}
                  onLinha={p => abrirLead(p.lead_id, p.nome, nomeDoCorretor(p.corretor))}
                  busca={p => p.nome}
                  ordemInicial={{ chave: 'dias', desc: true }}
                  colunas={[
                    { chave: 'nome', rotulo: 'Lead', ordem: p => p.nome.toLowerCase(), valor: p => <span className="font-medium text-t1">{p.nome}</span> },
                    ...(corretores.length > 1 ? [{ chave: 'corretor', rotulo: 'Corretor', valor: (p: Funil['parados'][number]) => nomeDoCorretor(p.corretor).split(' ')[0] }] : []),
                    { chave: 'etapa', rotulo: 'Etapa', ordem: p => p.etapa, valor: p => ROTULO_ETAPA[p.etapa] ?? p.etapa },
                    { chave: 'ultimo', rotulo: 'Último contato', ordem: p => p.ultimo_contato, valor: p => p.ultimo_contato ? diaHoraSP(p.ultimo_contato) : <span className="text-error">nunca</span> },
                    { chave: 'dias', rotulo: 'Dias', alinhar: 'direita', ordem: p => p.dias, valor: p => <span className="font-semibold text-warning">{p.dias}</span> },
                  ]}
                />
              )}
            </div>
          </div>
        )
      }}
    </Bloco>
  )
}
