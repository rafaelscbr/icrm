import { describe, it, expect } from 'vitest'
import { dddDoTelefone, regiaoDoTelefone, rotuloDoDDD } from '../lib/regiaoPorDDD'
import { dddsDoRecorte, normalizar } from '../modules/leads/safra'

describe('região pelo DDD', () => {
  it('lê o DDD como o banco lê', () => {
    expect(dddDoTelefone('(47) 99999-0000')).toBe('47')
    expect(dddDoTelefone('+55 47 3367-3175')).toBe('47')
    expect(dddDoTelefone('5511987654321')).toBe('11')
    expect(dddDoTelefone('380996693075')).toBe('ex')     // Ucrânia
    expect(dddDoTelefone('')).toBeNull()
    expect(dddDoTelefone(undefined)).toBeNull()
  })

  it('traduz em região e estado', () => {
    expect(regiaoDoTelefone('47999990000')).toEqual({ ddd: '47', uf: 'SC', regiao: 'Vale do Itajaí e Norte de SC' })
    expect(rotuloDoDDD('47')).toBe('Vale do Itajaí e Norte de SC')
    expect(rotuloDoDDD('11')).toBe('São Paulo e região metropolitana · SP')
    expect(rotuloDoDDD('ex')).toBe('Fora do Brasil ou número fora do padrão')
    expect(rotuloDoDDD('23')).toBe('DDD 23')                 // não existe
  })

  it('soma os DDDs do recorte', () => {
    const f = normalizar({
      start: null, end: null, bucket: 'month',
      corretores: [{ id: 'dio', nome: 'Dionata' }],
      produtos: [{ chave: 'dotzero', nome: 'Dotzero' }, { chave: 'porto velas', nome: 'Porto Velas' }],
      cubo: [[0, 0, '2026-11-01', 1, 0, 40], [0, 1, '2026-11-01', 1, 0, 5]],
      ddds: [[0, 0, '47', 36], [0, 0, '11', 4], [0, 1, '47', 5]],
      motivos: [], visitas: [], historySince: null,
    })
    expect(dddsDoRecorte(f, { corretor: null, produto: 'dotzero' })).toEqual({
      total: 40, porDDD: [{ ddd: '47', n: 36 }, { ddd: '11', n: 4 }],
    })
    expect(dddsDoRecorte(f).total).toBe(45)
  })
})
