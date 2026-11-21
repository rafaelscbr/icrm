import { supabase } from '../../lib/supabase'

/**
 * Dados e regras da seção "Avisos de acesso" (migração 098).
 * As regras de envio moram no banco; aqui só o que a tela precisa mostrar.
 */

export const FUSO = 'America/Sao_Paulo'

export interface ConfigAvisoAcesso {
  entradaAtiva:       boolean
  atrasoAtivo:        boolean
  /** 'HH:MM' */
  atrasoInicio:       string
  atrasoFim:          string
  atrasoIntervaloMin: number
  /** ISO: 1 = segunda … 7 = domingo */
  dias:               number[]
  corretores:         string[]
  destinatario:       string | null
}

export interface AcessoRegistrado {
  brokerId:  string
  createdAt: string
}

export interface SituacaoDoDia {
  brokerId: string
  primeiro: string | null
  ultimo:   string | null
}

/** '09:02' ou '09:02:00' → '9h02' (o mesmo formato do aviso no celular). */
export function horaFalada(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return `${Number(h)}h${m}`
}

/** Hora de Brasília de um instante ISO, no formato '9h02'. */
export function horaFaladaDe(iso: string): string {
  const hhmm = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: FUSO,
  }).format(new Date(iso))
  return horaFalada(hhmm)
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function hhmm(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Os horários em que o alerta de atraso sai: início, início + intervalo … até o fim. */
export function horariosDeAlerta(inicio: string, fim: string, intervaloMin: number): string[] {
  if (!/^\d{2}:\d{2}/.test(inicio) || !/^\d{2}:\d{2}/.test(fim) || intervaloMin < 1) return []
  const lista: string[] = []
  for (let t = minutos(inicio); t <= minutos(fim); t += intervaloMin) lista.push(hhmm(t))
  return lista
}

/** Meia-noite de hoje em Brasília, como instante ISO. */
export function inicioDoDia(agora: Date = new Date()): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: FUSO,
  }).format(agora)
  // Brasília não tem horário de verão desde 2019: o deslocamento é fixo.
  return new Date(`${ymd}T00:00:00-03:00`).toISOString()
}

/** Primeiro e último acesso de hoje de cada corretor, na ordem pedida. */
export function situacaoDoDia(brokerIds: string[], acessos: AcessoRegistrado[]): SituacaoDoDia[] {
  return brokerIds.map(id => {
    const meus = acessos.filter(a => a.brokerId === id).map(a => a.createdAt).sort()
    return { brokerId: id, primeiro: meus[0] ?? null, ultimo: meus[meus.length - 1] ?? null }
  })
}

function mapConfig(r: Record<string, unknown>): ConfigAvisoAcesso {
  return {
    entradaAtiva:       r.entrada_ativa === true,
    atrasoAtivo:        r.atraso_ativo === true,
    atrasoInicio:       String(r.atraso_inicio ?? '09:10').slice(0, 5),
    atrasoFim:          String(r.atraso_fim ?? '18:10').slice(0, 5),
    atrasoIntervaloMin: Number(r.atraso_intervalo_min ?? 60),
    dias:               ((r.dias as number[] | null) ?? []).map(Number),
    corretores:         (r.corretores as string[] | null) ?? [],
    destinatario:       (r.destinatario as string | null) ?? null,
  }
}

export async function carregarConfig(): Promise<ConfigAvisoAcesso | null> {
  const { data, error } = await supabase.from('aviso_acesso_config').select('*').eq('id', 1).maybeSingle()
  if (error) throw error
  return data ? mapConfig(data as Record<string, unknown>) : null
}

/** Salva tudo de uma vez. Quem salva passa a receber os avisos. */
export async function salvarConfig(c: ConfigAvisoAcesso): Promise<ConfigAvisoAcesso> {
  const { data, error } = await supabase.rpc('set_aviso_acesso_config', {
    p_entrada_ativa:        c.entradaAtiva,
    p_atraso_ativo:         c.atrasoAtivo,
    p_atraso_inicio:        c.atrasoInicio,
    p_atraso_fim:           c.atrasoFim,
    p_atraso_intervalo_min: c.atrasoIntervaloMin,
    p_dias:                 c.dias,
    p_corretores:           c.corretores,
  })
  if (error) throw error
  return mapConfig(data as Record<string, unknown>)
}

export async function acessosDeHoje(): Promise<AcessoRegistrado[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('broker_id, created_at')
    .eq('action', 'acesso')
    .gte('created_at', inicioDoDia())
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(r => ({ brokerId: r.broker_id as string, createdAt: r.created_at as string }))
}
