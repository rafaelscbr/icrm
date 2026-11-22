/**
 * O formato do que as funções perf_* do banco devolvem (migração 098).
 * O banco calcula; a tela só desenha. Instantes vêm em ISO (UTC) e são
 * mostrados no horário de São Paulo.
 */

export interface PrimeiroContatoGrupo {
  recebidos: number
  contatados: number
  mediana_min: number | null
  no_prazo: number
}

export interface ResumoCorretor {
  id: string
  nome: string
  recebidos: { rodizio: number; manual_eventos: number; manual_leads: number; pingue_eventos: number; pingue_leads: number }
  enviados: { manual: number; pingue_eventos: number; pingue_leads: number }
  atendidos: number
  perdidos_pingue: number
  recuperados: number
  contatos: { total: number; whatsapp: number; ligacao: number; leads: number }
  carteira: Partial<Record<string, number>>
  avancos: number
  descartes: number
  primeiro_contato: { dentro: PrimeiroContatoGrupo; fora: PrimeiroContatoGrupo }
}

export interface Resumo {
  periodo: { de: string; ate: string }
  prazo_min: number
  corretores: ResumoCorretor[]
}

export interface AtividadeDia {
  corretor: string
  dia: string
  contatos: number
  whatsapp: number
  ligacoes: number
  leads: number
  etapas: number
  descartes: number
  acoes: number
  primeira: string | null
  ultima: string | null
}

export interface Atividade {
  dias: AtividadeDia[]
  calor: { corretor: string; dow: number; hora: number; n: number }[]
}

export interface LeadRecebido {
  corretor: string
  corretor_nome: string
  lead_id: string
  nome: string
  origem: string | null
  produto: string | null
  anuncio_id: string | null
  anuncio_nome: string | null
  recebido_em: string
  motivo: 'campaign_routing' | 'round_robin' | 'manual' | 'sla_recapture' | string
  primeiro_contato: string | null
  contato_antes: boolean | null
  minutos: number | null
  transferencias: number
  etapa: string
  situacao: 'ativo' | 'descartado' | 'vendido'
  dono_nome: string | null
  com_ele: boolean
}

export interface LeadsRecebidos {
  total: number
  truncado: boolean
  linhas: LeadRecebido[]
}

export interface Transferencias {
  por_dia: { corretor: string; dia: string; saidas: number; saidas_leads: number; entradas: number; entradas_leads: number }[]
  por_hora: { corretor: string; hora: number; saidas: number; entradas: number }[]
  totais: { corretor: string; saidas: number; saidas_leads: number; entradas: number; entradas_leads: number }[]
  perdidos: {
    corretor: string; lead_id: string; nome: string; recebido_em: string; saiu_em: string
    para: string | null; dono_hoje: string | null; etapa: string; situacao: 'ativo' | 'descartado' | 'vendido'; avancou: boolean
  }[]
  ida_e_volta: {
    corretor: string; lead_id: string; nome: string; transferencias: number; passou_por: string | null
    primeiro_contato: string | null; dono_hoje: string | null; etapa: string; descartado: boolean
  }[]
  manuais: {
    corretor: string; lead_id: string; nome: string | null; quando: string
    direcao: 'recebida' | 'enviada'; de: string | null; para: string | null
  }[]
}

export type GrupoCadencia = 'diario' | 'sem_contato_hoje' | 'nunca_contatou'

export interface Cadencia {
  dia_ref: string
  grade: string[]
  max_tentativas: number
  total_leads: number
  leads: {
    lead_id: string; nome: string; corretor: string; corretor_nome: string; etapa: string
    passo: number; ultimo_contato: string | null; dias_sem_contato: number
    dias: string[]; contatos_periodo: number; contato_ref: boolean; teve_contato_dele: boolean
    grupo: GrupoCadencia
  }[]
  aderencia: { corretor: string; base: number; feitos: number; por_dia: { dia: string; feitos: number }[] }[]
}

export interface Funil {
  parado_dias: number
  total_parados: number
  etapas: {
    corretor: string; etapa: string; entraram: number; avancaram: number; voltaram: number
    tempo_medio_dias: number | null; na_carteira: number
  }[]
  parados: { corretor: string; lead_id: string; nome: string; etapa: string; ultimo_contato: string | null; dias: number }[]
}

export interface Descartes {
  linhas: {
    corretor: string; corretor_nome: string; lead_id: string; nome: string; quando: string
    etapa: string | null; motivo: string | null; contatos_antes: number; contatos_dele_antes: number
    origem: string | null; anuncio_id: string | null; anuncio_nome: string | null; produto: string | null
    ainda_descartado: boolean
  }[]
  por_motivo: { corretor: string; motivo: string; n: number; poucos_contatos: number }[]
}

export interface Presenca {
  registro_desde: string | null
  dias: {
    corretor: string; dia: string; primeiro_acesso: string | null; acessos: number; acessos_em: string[]
    primeira_acao: string | null; ultima_acao: string | null; perdas: string[]
  }[]
}

export interface OpcoesPerf {
  corretores: { id: string; nome: string; ativo: boolean; papel: 'admin' | 'broker' }[]
  produtos: string[]
  origens: string[]
  anuncios: { id: string; nome: string | null; leads: number }[]
}
