export function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`
  }
  if (value >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(0)}k`
  }
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatCurrencyFull(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export function formatDateShort(iso: string): string {
  const date = new Date(iso + 'T00:00:00')
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
}

/**
 * Normaliza número para armazenamento: apenas dígitos, sem +55 ou 0 inicial.
 * Retorna null se o número tiver menos de 8 dígitos (inválido).
 */
export function normalizePhone(raw: string): string | null {
  // Suporta células com múltiplos números separados por ";" — tenta cada parte
  const parts = String(raw).split(';')
  for (const part of parts) {
    const result = _normalizeSinglePhone(part.trim())
    if (result) return result
  }
  return null
}

function _normalizeSinglePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (!d || d === '-') return null
  // Remove +55 ou 55 prefixo (13 ou 12 dígitos)
  if ((d.length === 13 || d.length === 12) && d.startsWith('55')) d = d.slice(2)
  // Remove 0 prefixo de DDD
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1)
  if (d.length < 8) return null
  // Adiciona 9º dígito em celulares com 10 dígitos (DDD + 8 dígitos sem o 9)
  // Só adiciona se o 3º dígito (1º do número após DDD) não for 9
  if (d.length === 10 && d[2] !== '9') {
    d = d.slice(0, 2) + '9' + d.slice(2)
  }
  return d
}

/**
 * Gera link direto para api.whatsapp.com, bypassando wa.me.
 *
 * CAUSA RAIZ DO BUG (evidência real — HTTP response do servidor wa.me):
 *   Enviado para wa.me:  ?text=%F0%9F%92%B0  (💰, UTF-8 correto)
 *   wa.me redirect:       &text=%EF%BF%BD    (U+FFFD = 🔲, CORROMPIDO)
 *
 * O servidor wa.me só decodifica UTF-8 até 2 bytes (U+0000–U+07FF).
 * Qualquer emoji ou símbolo acima de U+00FF (3 ou 4 bytes UTF-8) é
 * substituído por U+FFFD na construção do redirect — por isso emojis
 * NUNCA chegaram corretamente ao WhatsApp via wa.me.
 *
 * api.whatsapp.com/send recebe o parâmetro diretamente, sem intermediário,
 * e decodifica %F0%9F%92%B0 → 💰 corretamente.
 *
 * encodeURIComponent é obrigatório aqui: passamos diretamente ao destino
 * final sem depender do WHATWG URL parser do browser para recodificar.
 */
function encodeWhatsAppText(text: string): string {
  // Normaliza quebras de linha antes de codificar
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return encodeURIComponent(normalized)
}

export function whatsappUrl(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  // api.whatsapp.com — destino final sem redirect intermediário
  const base = `https://api.whatsapp.com/send?phone=${withCountry}`
  return message ? `${base}&text=${encodeWhatsAppText(message)}` : base
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Retorna a data LOCAL (fuso do dispositivo) em formato YYYY-MM-DD.
 * Evita o bug de usar toISOString() que converte para UTC e pode devolver
 * o dia errado em fusos negativos como São Paulo (UTC-3).
 */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isBirthdayThisMonth(birthdate: string): boolean {
  const month = new Date().getMonth() + 1
  const bMonth = parseInt(birthdate.split('-')[1], 10)
  return bMonth === month
}

export function getBirthdayDay(birthdate: string): string {
  return birthdate.split('-')[2]
}

export function getCurrentMonthYear(): string {
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function isThisMonth(dateIso: string): boolean {
  const now = new Date()
  const d = new Date(dateIso)
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}
