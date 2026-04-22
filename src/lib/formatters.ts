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

export function whatsappUrl(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  const base = `https://wa.me/${withCountry}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
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
