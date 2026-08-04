import { describe, it, expect } from 'vitest'
import { formatPhone, whatsappAppUrl, whatsappUrl } from '../lib/formatters'

/**
 * Telefone é o dado mais exibido do sistema — aparece em Contatos, Leads,
 * Kanban, discador e no Pulse. Os leads do Meta chegam com o código do país,
 * e sem tratar isso metade da base aparecia crua na tela.
 */
describe('formatPhone', () => {
  it('formata celular com DDD (11 dígitos)', () => {
    expect(formatPhone('47999887766')).toBe('(47) 99988-7766')
  })

  it('formata fixo com DDD (10 dígitos)', () => {
    expect(formatPhone('4733445566')).toBe('(47) 3344-5566')
  })

  it('descarta o +55 do celular vindo do Meta (13 dígitos)', () => {
    expect(formatPhone('+5547999887766')).toBe('(47) 99988-7766')
    expect(formatPhone('5548984782876')).toBe('(48) 98478-2876')
  })

  it('descarta o +55 do fixo (12 dígitos)', () => {
    expect(formatPhone('554733445566')).toBe('(47) 3344-5566')
  })

  it('ignora máscara já aplicada', () => {
    expect(formatPhone('(47) 99988-7766')).toBe('(47) 99988-7766')
  })

  it('devolve intacto o que não tem tamanho de telefone', () => {
    expect(formatPhone('123')).toBe('123')
    expect(formatPhone('')).toBe('')
  })

  it('não descarta o 55 quando ele é o próprio DDD', () => {
    // 5599998888 é (55) 9999-8888 em Santa Maria/RS, não um +55 com sobra.
    // O corte só acontece em 12 ou 13 dígitos, onde o país é inequívoco.
    expect(formatPhone('5599998888')).toBe('(55) 9999-8888')
  })
})

describe('links de WhatsApp', () => {
  it('a URL de disparo acrescenta o código do país uma única vez', () => {
    expect(whatsappUrl('47999887766')).toBe('https://api.whatsapp.com/send?phone=5547999887766')
    expect(whatsappUrl('5547999887766')).toBe('https://api.whatsapp.com/send?phone=5547999887766')
  })

  it('o link do app abre a conversa sem mensagem', () => {
    // Ligação não leva texto: o objetivo é chegar na conversa pronto para
    // tocar no telefone.
    expect(whatsappAppUrl('47999887766')).toBe('whatsapp://send?phone=5547999887766')
  })
})
