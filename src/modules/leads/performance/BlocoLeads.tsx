import { useMemo } from 'react'
import { Bloco, BotaoCsv, Situacao, Tabela } from './pecas'
import type { Coluna } from './pecas'
import { CorretorComFoto } from '../../../components/shared/CorretorComFoto'
import { useBloco, usePerf } from './contexto'
import {
  ROTULO_ETAPA, ROTULO_MOTIVO_ENTRADA, ROTULO_ORIGEM, diaHoraSP, nomeDeArquivo, tempoUtil,
} from './formatos'
import type { LeadRecebido, LeadsRecebidos } from './tipos'

/** Bloco 3 — Leads recebidos no período, um por linha. Clique abre o lead. */
export function BlocoLeads() {
  const estado = useBloco<LeadsRecebidos>('leads')
  const { filtros, abrirLead } = usePerf()

  return (
    <Bloco
      titulo="Leads *recebidos*"
      descricao="Cada lead que chegou para ele no período — pelo rodízio, por transferência ou pelo pingue-pongue — e o que aconteceu depois."
      estado={estado}
      vazio={d => d.total === 0}
      textoVazio="Nenhum lead recebido no período e nos filtros escolhidos."
      altura={360}
      acao={estado.dados && (
        <BotaoCsv
          nome={nomeDeArquivo('leads-recebidos', filtros.de, filtros.ate)}
          cabecalho={['Lead', 'Corretor', 'Entrada', 'Origem', 'Produto', 'Anúncio', 'Recebido em', '1º contato dele', 'Tempo útil (min)', 'Transferências', 'Etapa', 'Situação', 'Com quem está']}
          linhas={() => estado.dados!.linhas.map(l => [
            l.nome, l.corretor_nome, ROTULO_MOTIVO_ENTRADA[l.motivo] ?? l.motivo, ROTULO_ORIGEM[l.origem ?? ''] ?? l.origem,
            l.produto, l.anuncio_nome, diaHoraSP(l.recebido_em), diaHoraSP(l.primeiro_contato), l.minutos,
            l.transferencias, ROTULO_ETAPA[l.etapa] ?? l.etapa, l.situacao, l.dono_nome,
          ])}
        />
      )}
    >
      {d => (
        <>
          {d.truncado && (
            <p className="text-[12.5px] text-warning mb-3">Mostrando os 2.000 mais recentes de {d.total}. Encurte o período para ver todos.</p>
          )}
          <ListaLeads linhas={d.linhas} onAbrir={l => abrirLead(l.lead_id, l.nome, l.dono_nome ?? l.corretor_nome)} />
        </>
      )}
    </Bloco>
  )
}

function ListaLeads({ linhas, onAbrir }: { linhas: LeadRecebido[]; onAbrir: (l: LeadRecebido) => void }) {
  const { filtros } = usePerf()
  const varios = useMemo(() => new Set(linhas.map(l => l.corretor)).size > 1 || filtros.corretores.length !== 1, [linhas, filtros.corretores.length])

  const colunas: Coluna<LeadRecebido>[] = [
    { chave: 'nome', rotulo: 'Lead', ordem: l => l.nome.toLowerCase(),
      valor: l => <span className="font-medium text-t1">{l.nome}</span> },
    ...(varios ? [{ chave: 'corretor', rotulo: 'Corretor', ordem: (l: LeadRecebido) => l.corretor_nome,
      valor: (l: LeadRecebido) => (
        <CorretorComFoto id={l.corretor} nome={l.corretor_nome} tamanho={24} className="gap-1.5 whitespace-nowrap">
          {l.corretor_nome.split(' ')[0]}
        </CorretorComFoto>
      ) }] : []),
    { chave: 'motivo', rotulo: 'Entrada', ordem: l => l.motivo,
      valor: l => <span className={l.motivo === 'sla_recapture' ? 'text-warning' : 'text-t2'}>{ROTULO_MOTIVO_ENTRADA[l.motivo] ?? l.motivo}</span> },
    { chave: 'origem', rotulo: 'Origem e anúncio', ordem: l => `${l.origem ?? ''}${l.anuncio_nome ?? ''}`,
      valor: l => (
        <span className="block max-w-[260px]">
          <span className="text-t2">{ROTULO_ORIGEM[l.origem ?? ''] ?? l.origem ?? '—'}</span>
          {(l.anuncio_nome || l.produto) && <span className="block text-[12px] text-t4 truncate">{[l.produto, l.anuncio_nome].filter(Boolean).join(' · ')}</span>}
        </span>
      ) },
    { chave: 'recebido', rotulo: 'Recebido', ordem: l => l.recebido_em, valor: l => diaHoraSP(l.recebido_em) },
    { chave: 'contato', rotulo: '1º contato dele', ordem: l => l.primeiro_contato,
      valor: l => l.primeiro_contato ? diaHoraSP(l.primeiro_contato) : <span className="text-error">sem contato</span> },
    { chave: 'tempo', rotulo: 'Tempo útil', alinhar: 'direita', ordem: l => l.minutos,
      valor: l => l.contato_antes ? <span title="Contato registrado antes do lead chegar para ele (comum em prospecção)" className="text-t3">antes</span> : tempoUtil(l.minutos) },
    { chave: 'transf', rotulo: 'Transf.', alinhar: 'direita', ordem: l => l.transferencias,
      valor: l => <span className={l.transferencias > 2 ? 'text-warning font-semibold' : ''}>{l.transferencias}</span> },
    { chave: 'etapa', rotulo: 'Etapa', ordem: l => l.etapa, valor: l => ROTULO_ETAPA[l.etapa] ?? l.etapa },
    { chave: 'situacao', rotulo: 'Situação', ordem: l => `${l.situacao}${l.com_ele ? 1 : 0}`,
      valor: l => (
        <span>
          <Situacao s={l.situacao} />
          {!l.com_ele && l.dono_nome && <span className="block text-[12px] text-t4">com {l.dono_nome.split(' ')[0]}</span>}
        </span>
      ) },
  ]

  return (
    <Tabela
      rotulo="Leads recebidos"
      colunas={colunas}
      linhas={linhas}
      chave={l => `${l.corretor}${l.lead_id}`}
      onLinha={onAbrir}
      busca={l => [l.nome, l.produto, l.anuncio_nome, l.corretor_nome, l.dono_nome].filter(Boolean).join(' ')}
      ordemInicial={{ chave: 'recebido', desc: true }}
    />
  )
}
