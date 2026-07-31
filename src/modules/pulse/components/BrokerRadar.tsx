import { Users } from 'lucide-react'
import { Painel, PainelTitulo } from './Primitives'
import { tempoRelativo } from '../pulseEvents'
import type { PulseBroker } from '../types'
import type { CorretorOnline } from '../usePulsePresence'

/**
 * Radar dos corretores.
 *
 * "Online" aqui significa exatamente uma coisa: COM O iCRM ABERTO. O corretor
 * que passou a manhã no WhatsApp com o sistema fechado aparece offline. O
 * rótulo diz isso sem eufemismo de propósito — um painel que sugere "quem está
 * produzindo" quando mede "quem está com a aba aberta" ensina a conclusão
 * errada.
 */

const ATIVO_MS = 10 * 60 * 1000

type Estado = 'ativo' | 'ocioso' | 'offline'

function estadoDe(online: boolean, ultima: string | null, agora: number): Estado {
  if (!online) return 'offline'
  if (ultima && agora - new Date(ultima).getTime() < ATIVO_MS) return 'ativo'
  return 'ocioso'
}

const PONTO: Record<Estado, string> = {
  ativo:   'bg-success',
  ocioso:  'bg-warning',
  offline: 'bg-t5',
}

interface Props {
  corretores: PulseBroker[]
  online:     CorretorOnline[]
  agora:      number
  className?: string
}

export function BrokerRadar({ corretores, online, agora, className = '' }: Props) {
  const idsOnline = new Set(online.map(o => o.brokerId))

  // Quem está trabalhando primeiro; depois ocioso; offline por último.
  const peso: Record<Estado, number> = { ativo: 0, ocioso: 1, offline: 2 }
  const lista = [...corretores]
    .map(c => ({ c, estado: estadoDe(idsOnline.has(c.brokerId), c.ultimaAtividadeAt, agora) }))
    .sort((a, bb) => peso[a.estado] - peso[bb.estado] || a.c.nome.localeCompare(bb.c.nome))

  return (
    <Painel className={className}>
      <PainelTitulo
        icon={Users}
        extra={
          <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4 tabular-nums">
            {idsOnline.size} online
          </span>
        }
      >
        Corretores · online no iCRM
      </PainelTitulo>

      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-3">
        <ul className="flex flex-col">
          {lista.map(({ c, estado }) => (
            <li
              key={c.brokerId}
              className="flex items-center gap-2.5 py-2 border-b border-line/60 last:border-0"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${PONTO[estado]}`} aria-hidden />

              <span className={`text-[15px] truncate flex-1 min-w-0 ${estado === 'offline' ? 'text-t4' : 'text-t1'}`}>
                {c.nome}
              </span>

              <span className="font-label text-[10px] uppercase tracking-[0.1em] text-t4 tabular-nums shrink-0">
                {c.interacoesHoje} at · {c.visitasHoje} vis
              </span>

              <span className="font-label text-[10px] uppercase tracking-[0.1em] text-t4 shrink-0 w-[74px] text-right">
                {estado === 'offline'
                  ? 'offline'
                  : c.ultimaAtividadeAt
                    ? tempoRelativo(c.ultimaAtividadeAt, agora)
                    : 'sem ação'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Painel>
  )
}
