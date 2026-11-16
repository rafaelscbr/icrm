import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../lib/db'
import type { Lead } from '../../types'
import type { Atribuicao, EstadoRoleta } from './monitorLeads'

const DIA_MS = 86_400_000
/** Janela da trilha de distribuição: cobre o maior período da tela (30 dias). */
const JANELA_DIAS = 31
/** Espera os eventos assentarem antes de perguntar ao banco (um lead novo gera vários). */
const ASSENTAR_MS = 1500

/**
 * Dados do monitoramento ao vivo que NÃO estão nos leads em memória: a trilha
 * de distribuição (`lead_assignments`) e o estado das roletas.
 *
 * Como fica "ao vivo" sem pesar no banco:
 *   • uma leitura ao abrir (30 dias de trilha — algumas centenas de linhas);
 *   • depois disso nenhuma releitura periódica. A tela só volta ao banco
 *     quando os leads em memória mostram que algo mudou de mão — chegou lead ou
 *     um lead trocou de corretor — e aí busca APENAS as linhas novas da trilha
 *     e as duas linhas das roletas;
 *   • quem está em pausa e quem já fez o 1º contato não custam nada: vêm do
 *     que o realtime já entrega.
 *
 * Se uma atualização falhar, os números anteriores continuam na tela com o
 * aviso de que podem estar atrasados — nunca somem em silêncio.
 */
export function useMonitorLeads(leads: Lead[], lerRoleta: boolean) {
  const [atribuicoes, setAtribuicoes] = useState<Atribuicao[] | null>(null)
  const [roleta, setRoleta] = useState<EstadoRoleta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState(false)

  const trilha = useRef<Atribuicao[] | null>(null)
  const emVoo = useRef<Promise<void> | null>(null)
  const pedidoDuranteVoo = useRef(false)

  const carregar = useCallback(async () => {
    if (emVoo.current) { pedidoDuranteVoo.current = true; return emVoo.current }
    setAtualizando(true)
    emVoo.current = (async () => {
      try {
        const atual = trilha.current
        const ultimo = atual && atual.length > 0 ? atual[atual.length - 1].createdAt : undefined
        const desde = new Date(Date.now() - JANELA_DIAS * DIA_MS).toISOString()
        const [novas, estado] = await Promise.all([
          // Com trilha em memória, só o que entrou depois da última linha.
          db.leadMonitor.atribuicoes(atual && ultimo ? { desde, depoisDe: ultimo } : { desde }),
          lerRoleta ? db.leadMonitor.roleta() : Promise.resolve(null),
        ])
        const vistos = new Set((atual ?? []).map(a => a.id))
        const junta = atual && ultimo ? [...atual, ...novas.filter(a => !vistos.has(a.id))] : novas
        trilha.current = junta
        setAtribuicoes(junta)
        setRoleta(estado)
        setErro(null)
      } catch (e) {
        setErro(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Falha ao ler a distribuição dos leads')
      } finally {
        setAtualizando(false)
        emVoo.current = null
        if (pedidoDuranteVoo.current) { pedidoDuranteVoo.current = false; void carregar() }
      }
    })()
    return emVoo.current
  }, [lerRoleta])

  /**
   * Muda quando chega lead ou quando um lead troca de corretor — os dois únicos
   * fatos que criam linha nova na trilha. Um número, não um texto: é recalculado
   * a cada evento do realtime.
   */
  const assinatura = useMemo(() => {
    let h = leads.length
    for (const l of leads) {
      const s = l.id + (l.brokerId ?? '')
      let x = 0
      for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0
      h = (h + x) | 0     // soma: a ordem da lista não importa
    }
    return h
  }, [leads])

  const primeira = useRef(true)
  useEffect(() => {
    const espera = primeira.current ? 0 : ASSENTAR_MS
    primeira.current = false
    const id = setTimeout(() => { void carregar() }, espera)
    return () => clearTimeout(id)
  }, [assinatura, carregar])

  return { atribuicoes, roleta, erro, atualizando, recarregar: carregar }
}
