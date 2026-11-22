import type { ReactNode } from 'react'
import { Bloco, Indicador, Quadro } from './pecas'
import { useBloco } from './contexto'
import { ETAPAS, ROTULO_ETAPA, pct, tempoUtil } from './formatos'
import type { PrimeiroContatoGrupo, Resumo, ResumoCorretor } from './tipos'

/**
 * Bloco 1 — Resumo. Com um corretor, um quadro de indicadores em grupos; com
 * dois ou mais, a mesma lista de indicadores lado a lado (bloco 8, comparação).
 */
export function BlocoResumo() {
  const estado = useBloco<Resumo>('resumo')
  return (
    <Bloco
      titulo="Resumo do *atendimento*"
      descricao="Contato é só WhatsApp e ligação registrados no iCRM. Tempo até o 1º contato em minutos úteis, pela agenda do rodízio."
      estado={estado}
      vazio={d => d.corretores.length === 0}
      textoVazio="Nenhum corretor no filtro."
      altura={260}
    >
      {d => d.corretores.length === 1
        ? <ResumoDeUm c={d.corretores[0]} prazo={d.prazo_min} />
        : <Comparacao corretores={d.corretores} prazo={d.prazo_min} />}
    </Bloco>
  )
}

function carteiraTotal(c: ResumoCorretor) {
  return Object.values(c.carteira).reduce<number>((s, n) => s + (n ?? 0), 0)
}

function carteiraTexto(c: ResumoCorretor) {
  const partes = ETAPAS.filter(e => (c.carteira[e] ?? 0) > 0).map(e => `${ROTULO_ETAPA[e]} ${c.carteira[e]}`)
  return partes.length ? partes.join(' · ') : 'Sem leads em aberto'
}

function ResumoDeUm({ c, prazo }: { c: ResumoCorretor; prazo: number }) {
  return (
    <div className="flex flex-col gap-5">
      <Grupo titulo="Recebidos no período">
        <Quadro colunas={3}>
          <Indicador rotulo="Pelo rodízio" valor={c.recebidos.rodizio} />
          <Indicador rotulo="Por transferência" valor={c.recebidos.manual_eventos}
                     nota={c.enviados.manual > 0 ? `enviou ${c.enviados.manual}` : undefined} />
          <Indicador rotulo="Pelo pingue-pongue" valor={c.recebidos.pingue_eventos}
                     nota={`${c.recebidos.pingue_leads} ${c.recebidos.pingue_leads === 1 ? 'lead' : 'leads'} · saíram ${c.enviados.pingue_eventos}`} />
        </Quadro>
      </Grupo>

      <Grupo titulo="Dos que vieram pelo rodízio">
        <Quadro colunas={3}>
          <Indicador rotulo="Atendidos" valor={c.atendidos} tom={c.atendidos > 0 ? 'sucesso' : undefined}
                     nota={`${pct(c.atendidos, c.recebidos.rodizio)} dos ${c.recebidos.rodizio}`} />
          <Indicador rotulo="Perdidos no pingue-pongue" valor={c.perdidos_pingue} tom={c.perdidos_pingue > 0 ? 'risco' : undefined}
                     nota="saíram sem contato dele e estão com outro corretor" />
          <Indicador rotulo="Recuperados" valor={c.recuperados}
                     nota="saíram, voltaram e ele contatou (já nos atendidos)" />
        </Quadro>
      </Grupo>

      <Grupo titulo="Contatos e funil">
        <Quadro colunas={4}>
          <Indicador rotulo="Contatos" valor={c.contatos.total} nota={`${c.contatos.whatsapp} WhatsApp · ${c.contatos.ligacao} ligações`} />
          <Indicador rotulo="Leads contatados" valor={c.contatos.leads} />
          <Indicador rotulo="Avanços de etapa" valor={c.avancos} />
          <Indicador rotulo="Descartes" valor={c.descartes} />
        </Quadro>
        <p className="text-[12.5px] text-t3 mt-2">
          Carteira ativa hoje: <span className="font-semibold text-t1 tabular-nums">{carteiraTotal(c)}</span> — {carteiraTexto(c)}
        </p>
      </Grupo>

      <Grupo titulo={`Tempo até o 1º contato · prazo de ${prazo} min`}>
        <Quadro colunas={2}>
          <TempoGrupo rotulo="Chegou no horário de atendimento" g={c.primeiro_contato.dentro} />
          <TempoGrupo rotulo="Chegou fora do horário" g={c.primeiro_contato.fora} />
        </Quadro>
        <p className="text-[12px] text-t4 mt-2">
          Fora do horário, o tempo só começa a contar quando o atendimento abre — contato antes disso conta como na hora.
          A porcentagem no prazo é sobre todos os recebidos, inclusive os que nunca foram contatados.
        </p>
      </Grupo>
    </div>
  )
}

function TempoGrupo({ rotulo, g }: { rotulo: string; g: PrimeiroContatoGrupo }) {
  if (g.recebidos === 0) return <Indicador rotulo={rotulo} valor="—" nota="nenhum lead nesse horário" />
  const tom = g.no_prazo / g.recebidos >= 0.8 ? 'sucesso' : g.no_prazo / g.recebidos >= 0.5 ? 'atencao' : 'risco'
  return (
    <Indicador
      rotulo={rotulo}
      valor={<>{pct(g.no_prazo, g.recebidos)} <span className="text-[13px] font-semibold text-t3">no prazo</span></>}
      tom={tom}
      nota={`${g.no_prazo} de ${g.recebidos} · mediana ${tempoUtil(g.mediana_min)}${g.contatados < g.recebidos ? ` · ${g.recebidos - g.contatados} sem contato` : ''}`}
    />
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-[13px] font-semibold text-t2 mb-2">{titulo}</h4>
      {children}
    </div>
  )
}

// ── Bloco 8: comparação lado a lado ──────────────────────────────────────────

type Linha = { rotulo: string; valor: (c: ResumoCorretor, prazo: number) => ReactNode; numero?: (c: ResumoCorretor) => number; maiorMelhor?: boolean }

const LINHAS: (Linha | string)[] = [
  'Recebidos',
  { rotulo: 'Pelo rodízio', valor: c => c.recebidos.rodizio, numero: c => c.recebidos.rodizio },
  { rotulo: 'Por transferência', valor: c => c.recebidos.manual_eventos, numero: c => c.recebidos.manual_eventos },
  { rotulo: 'Pelo pingue-pongue', valor: c => c.recebidos.pingue_eventos, numero: c => c.recebidos.pingue_eventos },
  'Rodízio',
  { rotulo: 'Atendidos', valor: c => <>{c.atendidos} <span className="text-t4">({pct(c.atendidos, c.recebidos.rodizio)})</span></>,
    numero: c => (c.recebidos.rodizio ? c.atendidos / c.recebidos.rodizio : 0), maiorMelhor: true },
  { rotulo: 'Perdidos no pingue-pongue', valor: c => c.perdidos_pingue, numero: c => c.perdidos_pingue, maiorMelhor: false },
  { rotulo: 'Recuperados', valor: c => c.recuperados },
  'Contatos',
  { rotulo: 'Contatos', valor: c => c.contatos.total, numero: c => c.contatos.total, maiorMelhor: true },
  { rotulo: 'WhatsApp', valor: c => c.contatos.whatsapp },
  { rotulo: 'Ligações', valor: c => c.contatos.ligacao },
  { rotulo: 'Leads contatados', valor: c => c.contatos.leads, numero: c => c.contatos.leads, maiorMelhor: true },
  'Funil',
  { rotulo: 'Carteira ativa', valor: c => carteiraTotal(c) },
  { rotulo: 'Avanços de etapa', valor: c => c.avancos, numero: c => c.avancos, maiorMelhor: true },
  { rotulo: 'Descartes', valor: c => c.descartes },
  '1º contato',
  { rotulo: 'No prazo, no horário', valor: c => `${pct(c.primeiro_contato.dentro.no_prazo, c.primeiro_contato.dentro.recebidos)} de ${c.primeiro_contato.dentro.recebidos}`,
    numero: c => (c.primeiro_contato.dentro.recebidos ? c.primeiro_contato.dentro.no_prazo / c.primeiro_contato.dentro.recebidos : -1), maiorMelhor: true },
  { rotulo: 'Mediana, no horário', valor: c => tempoUtil(c.primeiro_contato.dentro.mediana_min) },
  { rotulo: 'No prazo, fora do horário', valor: c => `${pct(c.primeiro_contato.fora.no_prazo, c.primeiro_contato.fora.recebidos)} de ${c.primeiro_contato.fora.recebidos}` },
]

function Comparacao({ corretores, prazo }: { corretores: ResumoCorretor[]; prazo: number }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13.5px] tabular-nums" aria-label="Comparação entre corretores">
        <thead>
          <tr>
            <th scope="col" className="text-left text-[12px] font-medium text-t4 px-1 pb-2">Indicador</th>
            {corretores.map(c => (
              <th key={c.id} scope="col" className="text-right text-[13px] font-semibold text-t1 px-2 pb-2 whitespace-nowrap">{c.nome.split(' ')[0]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LINHAS.map((l, i) => {
            if (typeof l === 'string') {
              return (
                <tr key={`g${i}`}>
                  <th colSpan={corretores.length + 1} scope="colgroup"
                      className="text-left text-[12px] font-semibold text-t3 pt-4 pb-1 px-1 border-b border-line">{l}</th>
                </tr>
              )
            }
            // Destaca o melhor da linha quando "melhor" faz sentido.
            let melhor: string | null = null
            if (l.numero && l.maiorMelhor !== undefined && corretores.length > 1) {
              const vals = corretores.map(c => ({ id: c.id, v: l.numero!(c) })).filter(x => x.v >= 0)
              const alvo = l.maiorMelhor ? Math.max(...vals.map(x => x.v)) : Math.min(...vals.map(x => x.v))
              const empatados = vals.filter(x => x.v === alvo)
              if (empatados.length === 1 && vals.length > 1) melhor = empatados[0].id
            }
            return (
              <tr key={l.rotulo} className="border-b border-line/60">
                <th scope="row" className="text-left font-normal text-t2 px-1 py-2">{l.rotulo}</th>
                {corretores.map(c => (
                  <td key={c.id} className={`text-right px-2 py-2 ${melhor === c.id ? 'font-bold text-success' : 'text-t1'}`}>
                    {l.valor(c, prazo)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[12px] text-t4 mt-2">Em verde, o melhor da linha quando há um só. Prazo de 1º contato: {prazo} min úteis.</p>
    </div>
  )
}
