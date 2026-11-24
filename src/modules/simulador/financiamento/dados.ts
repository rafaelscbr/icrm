import { create } from 'zustand'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { acumulado12Meses, FaixaMip, IndiceObra, Indexador, ParametrosBanco } from './calc'

/**
 * Dados do Simulador de financiamento — parâmetros dos bancos e índices.
 *
 * Tudo vem do banco (migração 111). O BCB é consultado SÓ pelo servidor (Edge
 * Function indices-bcb, uma vez por dia); aqui se lê o que ela gravou. Se a
 * busca no BCB falhar, a última leitura salva continua valendo.
 *
 * Leitura única por sessão: são poucas linhas (sete bancos, ~100 meses de
 * índice) e mudam no máximo uma vez por dia. O admin recarrega ao salvar.
 */

/** A linha de bancos_parametros como o admin edita — com os vazios. */
export interface BancoRow {
  id: string
  nome: string
  sigla: string
  logo_url: string | null
  ativo: boolean
  padrao: boolean
  ordem: number
  cnpj8: string | null
  taxa_sfh: number | null
  taxa_sfi: number | null
  indexador: Indexador
  cota_sac: number | null
  cota_price: number | null
  prazo_maximo: number | null
  idade_maxima_meses: number
  comprometimento: number
  mip: FaixaMip[]
  dfi: number
  tarifa: number
  atualizado_em: string | null
  atualizado_por: string | null
}

export type SerieIndice = 'incc_di' | 'incc_m' | 'tr' | 'cub_sc'

export interface IndiceMensal {
  serie: SerieIndice
  /** 'YYYY-MM-01' */
  mes: string
  variacao: number
  fonte: string
}

export interface SituacaoBusca {
  fonte: 'sgs' | 'olinda'
  tentado_em: string | null
  ok_em: string | null
  erro: string | null
}

/** O índice "INCC" da obra é o INCC-DI da FGV (série 192 do BCB). */
export const SERIE_DO_INDICE: Record<IndiceObra, SerieIndice> = { incc: 'incc_di', cub: 'cub_sc' }

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

function lerBanco(r: Record<string, unknown>): BancoRow {
  return {
    id: String(r.id), nome: String(r.nome), sigla: String(r.sigla),
    logo_url: (r.logo_url as string | null) ?? null,
    ativo: !!r.ativo, padrao: !!r.padrao, ordem: Number(r.ordem ?? 0),
    cnpj8: (r.cnpj8 as string | null) ?? null,
    taxa_sfh: num(r.taxa_sfh), taxa_sfi: num(r.taxa_sfi),
    indexador: (r.indexador as Indexador) ?? 'TR',
    cota_sac: num(r.cota_sac), cota_price: num(r.cota_price), prazo_maximo: num(r.prazo_maximo),
    idade_maxima_meses: Number(r.idade_maxima_meses ?? 966),
    comprometimento: Number(r.comprometimento ?? 30),
    mip: Array.isArray(r.mip) ? (r.mip as FaixaMip[]).map(f => ({ idadeAte: Number(f.idadeAte), coef: Number(f.coef) })) : [],
    dfi: Number(r.dfi ?? 0.01), tarifa: Number(r.tarifa ?? 25),
    atualizado_em: (r.atualizado_em as string | null) ?? null,
    atualizado_por: (r.atualizado_por as string | null) ?? null,
  }
}

/** Banco pronto para a conta; null se faltar cota ou prazo (não se presume). */
export function bancoParaCalculo(b: BancoRow): ParametrosBanco | null {
  if (b.cota_sac == null || b.cota_price == null || b.prazo_maximo == null) return null
  return {
    id: b.id, nome: b.nome, sigla: b.sigla, logoUrl: b.logo_url, ativo: b.ativo,
    taxaSfh: b.taxa_sfh, taxaSfi: b.taxa_sfi, indexador: b.indexador,
    cotaSac: b.cota_sac, cotaPrice: b.cota_price, prazoMaximo: b.prazo_maximo,
    idadeMaximaMeses: b.idade_maxima_meses, comprometimento: b.comprometimento,
    mip: b.mip, dfi: b.dfi, tarifa: b.tarifa,
    atualizadoEm: b.atualizado_em, atualizadoPor: b.atualizado_por,
  }
}

/** Variação acumulada em 12 meses (% a.a.) de uma série; null sem 12 meses seguidos. */
export function acumuladoDaSerie(indices: IndiceMensal[], serie: SerieIndice): { valor: number; ate: string } | null {
  const linhas = indices.filter(i => i.serie === serie).sort((a, b) => a.mes.localeCompare(b.mes))
  const ultimas = linhas.slice(-12)
  const valor = acumulado12Meses(ultimas.map(l => l.variacao))
  if (valor == null) return null
  return { valor, ate: ultimas[ultimas.length - 1].mes }
}

/** Dias desde uma data ISO. */
export function diasDesde(iso: string | null, hoje: Date = new Date()): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((hoje.getTime() - d.getTime()) / 86_400_000)
}

interface Estado {
  bancos: BancoRow[]
  indices: IndiceMensal[]
  situacao: SituacaoBusca[]
  carregado: boolean
  carregando: boolean
  erro: string | null
  carregar: (forcar?: boolean) => Promise<void>
}

export const useParametrosFinanciamento = create<Estado>((set, get) => ({
  bancos: [], indices: [], situacao: [],
  carregado: false, carregando: false, erro: null,

  carregar: async (forcar = false) => {
    const s = get()
    if (s.carregando || (s.carregado && !forcar)) return
    set({ carregando: true, erro: null })
    const [b, i, sit] = await Promise.all([
      supabase.from('bancos_parametros').select('*').order('ordem'),
      supabase.from('indices_mensais').select('serie, mes, variacao, fonte').order('mes'),
      supabase.from('indices_sync').select('*'),
    ])
    const erro = b.error ?? i.error ?? sit.error
    if (erro) {
      set({ carregando: false, erro: erro.message })
      return
    }
    set({
      bancos: (b.data ?? []).map(lerBanco),
      indices: (i.data ?? []).map(r => ({ ...r, variacao: Number(r.variacao) }) as IndiceMensal),
      situacao: (sit.data ?? []) as SituacaoBusca[],
      carregado: true, carregando: false,
    })
  },
}))

// ── Escrita (só admin; a regra de acesso está no banco) ─────────────────────

export const financiamentoDb = {
  salvarBanco: async (b: BancoRow): Promise<void> => {
    const { atualizado_em: _a, atualizado_por: _p, ...linha } = b
    void _a; void _p
    // Banco padrão é um só: desmarca os outros antes (índice único no banco).
    if (b.padrao) {
      const { error } = await supabase.from('bancos_parametros').update({ padrao: false }).neq('id', b.id).eq('padrao', true)
      if (error) { toast.error(`Não salvou: ${error.message}`); throw error }
    }
    const { error } = await supabase.from('bancos_parametros').update(linha).eq('id', b.id)
    if (error) { toast.error(`Não salvou: ${error.message}`); throw error }
  },

  salvarCub: async (mes: string, variacao: number): Promise<void> => {
    const { error } = await supabase.from('indices_mensais').upsert(
      { serie: 'cub_sc', mes, variacao, fonte: 'admin', atualizado_em: new Date().toISOString() },
      { onConflict: 'serie,mes' },
    )
    if (error) { toast.error(`CUB não salvo: ${error.message}`); throw error }
  },

  apagarCub: async (mes: string): Promise<void> => {
    const { error } = await supabase.from('indices_mensais').delete().eq('serie', 'cub_sc').eq('mes', mes)
    if (error) { toast.error(`Não apagou: ${error.message}`); throw error }
  },

  buscarAgora: async (): Promise<void> => {
    const { error } = await supabase.rpc('indices_bcb_buscar_agora')
    if (error) { toast.error(`Busca não disparada: ${error.message}`); throw error }
  },

  /** Taxa média do BCB por banco: a mais recente de cada modalidade. Só o admin usa. */
  taxasBcb: async (): Promise<{ cnpj8: string; ano_mes: string; modalidade: string; taxa_ano: number }[]> => {
    const { data, error } = await supabase
      .from('taxas_bcb')
      .select('cnpj8, ano_mes, modalidade, taxa_ano')
      .order('ano_mes', { ascending: false })
      .limit(400)
    if (error) throw error
    return (data ?? []).map(r => ({ ...r, taxa_ano: Number(r.taxa_ano) }))
  },
}
