import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useLeadConfigStore } from '../../../store/useLeadConfigStore'
import { Bloco, BotaoCsv, Tabela } from './pecas'
import { CorretorComFoto } from '../../../components/shared/CorretorComFoto'
import { useBloco, usePerf } from './contexto'
import { ROTULO_ETAPA, ROTULO_ORIGEM, diaHoraSP, nomeDeArquivo, rotuloMotivo } from './formatos'
import type { Descartes } from './tipos'

/** Bloco 7 — Descartes feitos por ele no período, com alerta para descarte com menos de 3 contatos. */
export function BlocoDescartes() {
  const estado = useBloco<Descartes>('descartes')
  const { filtros, abrirLead } = usePerf()
  const getByType = useLeadConfigStore(s => s.getByType)
  const rotulos = useMemo(
    () => Object.fromEntries(getByType('discard_reason').map(r => [r.slug, r.label])) as Record<string, string>,
    [getByType],
  )

  return (
    <Bloco
      titulo="*Descartes*"
      descricao="Leads que ele descartou no período. Contatos antes do descarte contam WhatsApp e ligação de qualquer corretor."
      estado={estado}
      vazio={d => d.linhas.length === 0}
      textoVazio="Nenhum descarte no período e nos filtros escolhidos."
      altura={240}
      acao={estado.dados && (
        <BotaoCsv
          nome={nomeDeArquivo('descartes', filtros.de, filtros.ate)}
          cabecalho={['Lead', 'Corretor', 'Quando', 'Etapa', 'Motivo', 'Contatos antes', 'Contatos dele antes', 'Origem', 'Anúncio', 'Ainda descartado']}
          linhas={() => estado.dados!.linhas.map(l => [
            l.nome, l.corretor_nome, diaHoraSP(l.quando), ROTULO_ETAPA[l.etapa ?? ''] ?? l.etapa, rotuloMotivo(l.motivo, rotulos),
            l.contatos_antes, l.contatos_dele_antes, ROTULO_ORIGEM[l.origem ?? ''] ?? l.origem, l.anuncio_nome, l.ainda_descartado ? 'sim' : 'não',
          ])}
        />
      )}
    >
      {d => {
        const poucos = d.linhas.filter(l => l.contatos_antes < 3).length
        const motivos = Object.entries(d.linhas.reduce<Record<string, number>>((m, l) => {
          const k = l.motivo ?? 'sem_motivo'; m[k] = (m[k] ?? 0) + 1; return m
        }, {})).sort((a, b) => b[1] - a[1])
        const max = Math.max(1, ...motivos.map(([, n]) => n))
        const varios = new Set(d.linhas.map(l => l.corretor)).size > 1

        return (
          <div className="flex flex-col gap-5">
            {poucos > 0 && (
              <p className="flex items-start gap-2 rounded-[12px] bg-warning-bg px-3.5 py-2.5 text-[13px] text-t1" role="status">
                <AlertTriangle size={15} strokeWidth={1.9} className="text-warning flex-shrink-0 mt-px" aria-hidden />
                <span><strong className="font-semibold">{poucos} de {d.linhas.length}</strong> {poucos === 1 ? 'descarte foi feito' : 'descartes foram feitos'} com menos de 3 contatos com o lead.</span>
              </p>
            )}

            <div>
              <h4 className="text-[13px] font-semibold text-t2 mb-2">Por motivo</h4>
              <ul className="flex flex-col gap-1.5">
                {motivos.map(([m, n]) => (
                  <li key={m} className="flex items-center gap-3 text-[13px]">
                    <span className="w-[180px] flex-shrink-0 text-t2 truncate">{rotuloMotivo(m === 'sem_motivo' ? null : m, rotulos)}</span>
                    <span className="flex-1 h-2 rounded-full bg-s2 overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full bg-t3/60" style={{ width: `${(100 * n) / max}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums font-semibold text-t1">{n}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Tabela
              rotulo="Descartes"
              linhas={d.linhas}
              chave={l => `${l.corretor}${l.lead_id}`}
              onLinha={l => abrirLead(l.lead_id, l.nome, l.corretor_nome)}
              busca={l => [l.nome, l.anuncio_nome, l.produto].filter(Boolean).join(' ')}
              ordemInicial={{ chave: 'quando', desc: true }}
              colunas={[
                { chave: 'nome', rotulo: 'Lead', ordem: l => l.nome.toLowerCase(), valor: l => <span className="font-medium text-t1">{l.nome}</span> },
                ...(varios ? [{ chave: 'corretor', rotulo: 'Corretor', valor: (l: Descartes['linhas'][number]) => (
                  <CorretorComFoto id={l.corretor} nome={l.corretor_nome} tamanho={24} className="gap-1.5 whitespace-nowrap">
                    {l.corretor_nome.split(' ')[0]}
                  </CorretorComFoto>
                ) }] : []),
                { chave: 'quando', rotulo: 'Quando', ordem: l => l.quando, valor: l => diaHoraSP(l.quando) },
                { chave: 'etapa', rotulo: 'Etapa', ordem: l => l.etapa, valor: l => ROTULO_ETAPA[l.etapa ?? ''] ?? l.etapa ?? '—' },
                { chave: 'motivo', rotulo: 'Motivo', ordem: l => l.motivo, valor: l => rotuloMotivo(l.motivo, rotulos) },
                { chave: 'contatos', rotulo: 'Contatos antes', alinhar: 'direita', ordem: l => l.contatos_antes,
                  valor: l => <span className={l.contatos_antes < 3 ? 'font-semibold text-warning' : ''} title={`${l.contatos_dele_antes} dele`}>{l.contatos_antes}</span> },
                { chave: 'origem', rotulo: 'Origem e anúncio', valor: l => (
                  <span className="block max-w-[240px]">
                    <span className="text-t2">{ROTULO_ORIGEM[l.origem ?? ''] ?? l.origem ?? '—'}</span>
                    {l.anuncio_nome && <span className="block text-[12px] text-t4 truncate">{l.anuncio_nome}</span>}
                  </span>
                ) },
              ]}
            />
          </div>
        )
      }}
    </Bloco>
  )
}
