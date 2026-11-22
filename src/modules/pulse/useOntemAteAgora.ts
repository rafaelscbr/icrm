import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/db'
import { producaoAte } from '../leads/monitorLeads'
import type { EventoDoDia, Producao } from '../leads/monitorLeads'
import type { PulseResumoDia } from './types'

const DIA_MS = 86_400_000

/**
 * Quanto cada corretor tinha feito ONTEM ATÉ ESTA HORA — comparar meio dia de
 * hoje com o dia inteiro de ontem faz qualquer um parecer mal às 11h.
 *
 * Uma leitura dos registros de ontem por dia (`dia` muda na virada e a leitura
 * se refaz: a TV fica ligada por dias). Prova antes de usar: a soma do dia
 * inteiro contada aqui tem de bater com o fechamento do banco
 * (pulse_resumo_dia). Se não bater, devolve null e a tela compara com o dia
 * todo de ontem, e diz isso.
 */
export function useOntemAteAgora(dia: string | null, resumoOntem: PulseResumoDia | null, agora: number) {
  const [registros, setRegistros] = useState<{ dia: string; eventos: EventoDoDia[] } | null>(null)

  useEffect(() => {
    if (!dia || registros?.dia === dia) return
    let vivo = true
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1)
    db.leadMonitor.eventosDoDia(ontem.toISOString(), hoje.toISOString())
      .then(eventos => { if (vivo) setRegistros({ dia, eventos }) })
      .catch(e => console.error('[pulse] registros de ontem:', e))
    return () => { vivo = false }
  }, [dia, registros?.dia])

  const ateAgora = useMemo<Map<string, Producao> | null>(() => {
    if (!registros || registros.dia !== dia || !resumoOntem) return null
    const cheio = producaoAte(registros.eventos, Infinity)
    const confere = resumoOntem.corretores.every(c => {
      const p = cheio.get(c.brokerId)
      return (p?.interacoes ?? 0) === c.interacoesHoje && (p?.ligacoes ?? 0) === c.ligacoesHoje
        && (p?.avancos ?? 0) === (c.avancosHoje ?? 0) && (p?.visitas ?? 0) === c.visitasHoje
    })
    return confere ? producaoAte(registros.eventos, agora - DIA_MS) : null
  }, [registros, dia, resumoOntem, agora])

  /** A régua de ontem para um corretor: até esta hora se a prova passou, senão o dia inteiro. */
  const ontemDe = (id: string): Producao | undefined => {
    if (ateAgora) return ateAgora.get(id) ?? { interacoes: 0, ligacoes: 0, avancos: 0, visitas: 0 }
    const c = resumoOntem?.corretores.find(x => x.brokerId === id)
    return c ? { interacoes: c.interacoesHoje, ligacoes: c.ligacoesHoje, avancos: c.avancosHoje ?? 0, visitas: c.visitasHoje } : undefined
  }

  return { ateAgora: ateAgora !== null, ontemDe }
}
