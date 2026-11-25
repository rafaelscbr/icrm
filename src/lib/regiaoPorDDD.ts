/**
 * Região PROVÁVEL do lead pelo DDD do telefone (25/11/2026).
 *
 * O formulário do Meta não pergunta a cidade; o DDD é a pista que existe. É
 * uma SUGESTÃO, e a tela diz isso: o DDD é de onde o número foi registrado, não
 * de onde a pessoa mora hoje, e um DDD cobre várias cidades.
 */

export interface RegiaoDDD {
  ddd: string
  uf: string
  /** a região do DDD, ex.: "Vale do Itajaí e Norte de SC" */
  regiao: string
}

const DDD: Record<string, [string, string]> = {
  '11': ['SP', 'São Paulo e região metropolitana'],
  '12': ['SP', 'São José dos Campos e Vale do Paraíba'],
  '13': ['SP', 'Santos e Baixada Santista'],
  '14': ['SP', 'Bauru e Marília'],
  '15': ['SP', 'Sorocaba'],
  '16': ['SP', 'Ribeirão Preto e São Carlos'],
  '17': ['SP', 'São José do Rio Preto'],
  '18': ['SP', 'Presidente Prudente e Araçatuba'],
  '19': ['SP', 'Campinas e Piracicaba'],
  '21': ['RJ', 'Rio de Janeiro e região metropolitana'],
  '22': ['RJ', 'Campos e Região dos Lagos'],
  '24': ['RJ', 'Petrópolis e Volta Redonda'],
  '27': ['ES', 'Vitória e região'],
  '28': ['ES', 'Sul do Espírito Santo'],
  '31': ['MG', 'Belo Horizonte e região'],
  '32': ['MG', 'Juiz de Fora e Zona da Mata'],
  '33': ['MG', 'Governador Valadares e Vale do Aço'],
  '34': ['MG', 'Uberlândia e Triângulo Mineiro'],
  '35': ['MG', 'Sul de Minas'],
  '37': ['MG', 'Divinópolis e Centro-Oeste de Minas'],
  '38': ['MG', 'Montes Claros e Norte de Minas'],
  '41': ['PR', 'Curitiba e região'],
  '42': ['PR', 'Ponta Grossa e Campos Gerais'],
  '43': ['PR', 'Londrina e Norte do Paraná'],
  '44': ['PR', 'Maringá e Noroeste do Paraná'],
  '45': ['PR', 'Cascavel e Foz do Iguaçu'],
  '46': ['PR', 'Sudoeste do Paraná'],
  '47': ['SC', 'Vale do Itajaí e Norte de SC'],
  '48': ['SC', 'Grande Florianópolis e Sul de SC'],
  '49': ['SC', 'Oeste e Planalto de SC'],
  '51': ['RS', 'Porto Alegre e região'],
  '53': ['RS', 'Pelotas e Sul do RS'],
  '54': ['RS', 'Caxias do Sul e Serra Gaúcha'],
  '55': ['RS', 'Santa Maria e Noroeste do RS'],
  '61': ['DF', 'Brasília e Entorno'],
  '62': ['GO', 'Goiânia e região'],
  '63': ['TO', 'Tocantins'],
  '64': ['GO', 'Sul de Goiás'],
  '65': ['MT', 'Cuiabá e região'],
  '66': ['MT', 'Interior do Mato Grosso'],
  '67': ['MS', 'Mato Grosso do Sul'],
  '68': ['AC', 'Acre'],
  '69': ['RO', 'Rondônia'],
  '71': ['BA', 'Salvador e região'],
  '73': ['BA', 'Sul da Bahia'],
  '74': ['BA', 'Juazeiro e Norte da Bahia'],
  '75': ['BA', 'Feira de Santana e Recôncavo'],
  '77': ['BA', 'Oeste e Sudoeste da Bahia'],
  '79': ['SE', 'Sergipe'],
  '81': ['PE', 'Recife e região'],
  '82': ['AL', 'Alagoas'],
  '83': ['PB', 'Paraíba'],
  '84': ['RN', 'Rio Grande do Norte'],
  '85': ['CE', 'Fortaleza e região'],
  '86': ['PI', 'Teresina e Norte do Piauí'],
  '87': ['PE', 'Sertão de Pernambuco'],
  '88': ['CE', 'Interior do Ceará'],
  '89': ['PI', 'Sul do Piauí'],
  '91': ['PA', 'Belém e região'],
  '92': ['AM', 'Manaus e região'],
  '93': ['PA', 'Santarém e Oeste do Pará'],
  '94': ['PA', 'Marabá e Sudeste do Pará'],
  '95': ['RR', 'Roraima'],
  '96': ['AP', 'Amapá'],
  '97': ['AM', 'Interior do Amazonas'],
  '98': ['MA', 'São Luís e região'],
  '99': ['MA', 'Interior do Maranhão'],
}

/** Código que a função do banco usa para número de fora do Brasil ou fora do padrão. */
export const DDD_EXTERIOR = 'ex'

/**
 * O DDD de um telefone, do mesmo jeito que o banco calcula (migração 115):
 * só dígitos; com 55 na frente e 12–13 dígitos, tira o 55; com 10–11 dígitos,
 * os dois primeiros. Vazio = null; qualquer outra coisa = 'ex'.
 */
export function dddDoTelefone(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (!d) return null
  if (/^55\d{10,11}$/.test(d)) return d.slice(2, 4)
  if (/^\d{10,11}$/.test(d)) return d.slice(0, 2)
  return DDD_EXTERIOR
}

export function regiaoDoDDD(ddd: string | null | undefined): RegiaoDDD | null {
  if (!ddd) return null
  const r = DDD[ddd]
  return r ? { ddd, uf: r[0], regiao: r[1] } : null
}

export function regiaoDoTelefone(telefone: string | null | undefined): RegiaoDDD | null {
  return regiaoDoDDD(dddDoTelefone(telefone))
}

/** "Vale do Itajaí e Norte de SC · DDD 47", ou o texto para fora do Brasil. */
export function rotuloDoDDD(ddd: string | null | undefined): string {
  if (ddd === DDD_EXTERIOR) return 'Fora do Brasil ou número fora do padrão'
  const r = regiaoDoDDD(ddd)
  if (!r) return ddd ? `DDD ${ddd}` : 'Sem telefone'
  return `${r.regiao}${r.regiao.endsWith(r.uf) ? '' : ` · ${r.uf}`}`
}
