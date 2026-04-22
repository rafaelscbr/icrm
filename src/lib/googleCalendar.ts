/**
 * Gera a URL do Google Calendar para criar um evento pré-preenchido.
 * Abre em nova aba — o usuário confirma com um clique em "Salvar".
 * Não requer chave de API nem OAuth.
 */
export interface CalendarEventParams {
  title: string
  description?: string
  date: string   // YYYY-MM-DD
  time?: string  // HH:mm (opcional — se omitido, cria evento de dia inteiro)
}

export function buildGoogleCalendarUrl(params: CalendarEventParams): string {
  const { title, description, date, time } = params

  let dates: string
  if (time) {
    // Evento com horário: duração padrão de 1h
    const [h, m] = time.split(':').map(Number)
    const start = `${date.replace(/-/g, '')}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`
    const endH  = h + 1 < 24 ? h + 1 : 23
    const end   = `${date.replace(/-/g, '')}T${String(endH).padStart(2, '0')}${String(m).padStart(2, '0')}00`
    dates = `${start}/${end}`
  } else {
    // Evento de dia inteiro
    const d = date.replace(/-/g, '')
    dates = `${d}/${d}`
  }

  const params_ = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    ...(description ? { details: description } : {}),
  })

  return `https://calendar.google.com/calendar/render?${params_.toString()}`
}
