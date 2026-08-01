import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import type { Contact } from '../types'

/**
 * Busca de contatos NO SERVIDOR, com debounce.
 *
 * Substitui o `contacts.filter(...)` que os comboboxes faziam em memória — o
 * que obrigava toda tela com formulário a carregar os 12.543 contatos (~7,7 MB)
 * antes que o usuário digitasse a primeira letra.
 *
 * Só dispara a partir de 2 caracteres: com 1 letra a busca traria centenas de
 * linhas sem ajudar ninguém a escolher.
 */

const MIN_CARACTERES = 2
const DEBOUNCE_MS    = 300

export function useContactSearch(query: string, limite = 8) {
  const [resultados, setResultados] = useState<Contact[]>([])
  const [buscando,   setBuscando]   = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_CARACTERES) {
      setResultados([])
      setBuscando(false)
      return
    }

    let cancelado = false
    setBuscando(true)

    const timer = setTimeout(async () => {
      const achados = await db.contacts.search(q, limite)
      // Resposta de uma busca antiga não pode sobrescrever a atual
      if (cancelado) return
      setResultados(achados)
      setBuscando(false)
    }, DEBOUNCE_MS)

    return () => { cancelado = true; clearTimeout(timer) }
  }, [query, limite])

  return { resultados, buscando }
}

/**
 * Verifica no banco se já existe contato com este telefone.
 * Usado pelos formulários para avisar sobre duplicata enquanto o usuário digita.
 */
export function useContactByPhone(phone: string, minDigitos = 10) {
  const [contato, setContato] = useState<Contact | null>(null)

  useEffect(() => {
    const digitos = phone.replace(/\D/g, '')
    if (digitos.length < minDigitos) {
      setContato(null)
      return
    }

    let cancelado = false
    const timer = setTimeout(async () => {
      try {
        const achado = await db.contacts.findByPhone(digitos)
        if (!cancelado) setContato(achado)
      } catch {
        if (!cancelado) setContato(null)   // erro já toastado pela camada db
      }
    }, DEBOUNCE_MS)

    return () => { cancelado = true; clearTimeout(timer) }
  }, [phone, minDigitos])

  return contato
}
