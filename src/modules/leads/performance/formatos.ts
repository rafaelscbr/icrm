/**
 * Formatos do relatório de Performance — puros, sem tela, testáveis.
 * Todo horário é mostrado em São Paulo, que é onde a operação acontece.
 */

const FUSO = 'America/Sao_Paulo'

/** "14:05" no horário de São Paulo; "—" sem valor. */
export function horaSP(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
}

/** "18/11 14:05" no horário de São Paulo. */
export function diaHoraSP(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO })
  return `${dia} ${horaSP(iso)}`
}

/** Minutos decimais de São Paulo desde a meia-noite (para posicionar na linha do tempo). */
export function minutoDoDiaSP(iso: string): number {
  const [h, m] = new Date(iso)
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: FUSO })
    .split(':').map(Number)
  return (h % 24) * 60 + m
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "seg 17/11" a partir de AAAA-MM-DD (sem passar por fuso). */
export function rotuloDia(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number)
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return `${SEMANA[dow]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** Tempo útil: "agora", "7 min", "1h12", "2 d úteis" (dia útil = 10 h na agenda do rodízio). */
export function tempoUtil(min: number | null | undefined): string {
  if (min == null) return '—'
  if (min < 1) return 'na hora'
  if (min < 60) return `${Math.round(min)} min`
  if (min < 600) {
    const h = Math.floor(min / 60)
    const r = Math.round(min % 60)
    return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`
  }
  const d = min / 600
  return `${d.toFixed(1).replace('.', ',')} d úteis`
}

/** Porcentagem inteira; "—" quando não há base. */
export function pct(parte: number, total: number): string {
  if (!total) return '—'
  return `${Math.round((100 * parte) / total)}%`
}

export const ROTULO_MOTIVO_ENTRADA: Record<string, string> = {
  campaign_routing: 'Rodízio',
  round_robin: 'Rodízio',
  manual: 'Transferência',
  sla_recapture: 'Pingue-pongue',
}

export const ROTULO_ORIGEM: Record<string, string> = {
  meta_ads: 'Meta Ads',
  prospeccao_ligacao: 'Prospecção por ligação',
  portal: 'Portal',
  felicita: 'Felicità',
  campanha: 'Campanha',
}

export const ROTULO_ETAPA: Record<string, string> = {
  lead: 'Lead', followup: 'Followup', atendimento: 'Atendimento',
  visita: 'Visita', proposta: 'Proposta', venda: 'Venda',
}

export const ETAPAS = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda'] as const

/** "sem_condicao" → "Sem condição" (motivos de descarte sem rótulo cadastrado). */
export function rotuloMotivo(m: string | null | undefined, rotulos: Record<string, string> = {}): string {
  if (!m) return 'Sem motivo'
  if (rotulos[m]) return rotulos[m]
  const t = m.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/**
 * CSV para o Excel em português: separador ";", vírgula decimal fica com o
 * texto, e o BOM no início faz o Excel abrir os acentos certos.
 */
export function paraCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  const celula = (v: string | number | null | undefined) => {
    if (v == null) return ''
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const corpo = [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n')
  return `\uFEFF${corpo}`
}

/** Baixa um CSV no navegador. */
export function baixarCsv(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome.endsWith('.csv') ? nome : `${nome}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Nome de arquivo seguro: "performance-ryan-maciel-2026-11-14-a-2026-11-18". */
export function nomeDeArquivo(...partes: string[]): string {
  return partes
    .join('-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
