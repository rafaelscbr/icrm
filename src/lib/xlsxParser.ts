import * as XLSX from 'xlsx'
import { normalizePhone } from './formatters'

export interface ParsedLead {
  name:   string
  phone:  string   // normalizado (só dígitos, sem 55)
  rawPhone: string // original do arquivo
  email?: string
  extra?: string
}

export interface ParseResult {
  leads:           ParsedLead[]
  errors:          string[]
  duplicatePhones: number
  invalidPhones:   number
}

const PHONE_KEYS = ['telefone', 'phone', 'cel', 'celular', 'fone', 'tel', 'whatsapp', 'contato']
const NAME_KEYS  = ['nome', 'name', 'cliente', 'prospect', 'contato', 'lead']
const EMAIL_KEYS = ['email', 'emailaddress', 'correio', 'mail']

function norm(k: string) {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findCol(row: Record<string, unknown>, keys: string[]): string | undefined {
  return Object.keys(row).find(k => keys.includes(norm(k)))
}

export function parseXlsx(file: File): Promise<ParseResult> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        const leads:  ParsedLead[] = []
        const errors: string[]     = []
        const seen = new Set<string>()
        let duplicatePhones = 0
        let invalidPhones   = 0

        rows.forEach((row, i) => {
          const phoneKey = findCol(row, PHONE_KEYS)
          const rawPhone = String(row[phoneKey ?? ''] ?? '').trim()

          if (!rawPhone) {
            errors.push(`Linha ${i + 2}: telefone não encontrado`)
            return
          }

          // Para células com múltiplos números (ex: "(47) 9999-1234;47999991234"),
          // normalizePhone tenta cada parte e retorna o primeiro válido
          const phone = normalizePhone(rawPhone)
          if (!phone) {
            invalidPhones++
            errors.push(`Linha ${i + 2}: número inválido — "${rawPhone}"`)
            return
          }

          if (seen.has(phone)) { duplicatePhones++; return }
          seen.add(phone)

          const nameKey  = findCol(row, NAME_KEYS)
          const emailKey = findCol(row, EMAIL_KEYS)
          const name     = String(row[nameKey ?? ''] ?? '').trim() || `Lead ${i + 2}`
          const email    = emailKey ? String(row[emailKey] ?? '').trim() || undefined : undefined

          const usedKeys = new Set([phoneKey, nameKey, emailKey].filter(Boolean) as string[])
          const extras   = Object.entries(row)
            .filter(([k, v]) => !usedKeys.has(k) && String(v).trim())
            .map(([k, v]) => `${k}: ${v}`)

          leads.push({ name, phone, rawPhone, email, extra: extras.length ? extras.join(' | ') : undefined })
        })

        resolve({ leads, errors, duplicatePhones, invalidPhones })
      } catch {
        resolve({ leads: [], errors: ['Erro ao ler o arquivo. Verifique se é um XLSX válido.'], duplicatePhones: 0, invalidPhones: 0 })
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
