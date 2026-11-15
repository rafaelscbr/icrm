import { describe, it, expect } from 'vitest'
import {
  buildBody, classify, isExpired, MAX_AGE_MS, EVENT_NAMES,
} from '../../supabase/functions/meta-conversions/payload'

const base = {
  id: '6f1c2a34-0000-4000-8000-000000000001',
  leadgen_id: '1234567890123456',
  event_name: 'lead_qualificado',
  event_time: '2026-11-14T12:00:00.000Z',
}

describe('meta-conversions · corpo do envio', () => {
  it('segue o formato Conversion Leads', () => {
    const body = JSON.parse(buildBody(base))
    expect(body).toEqual({
      data: [{
        event_name: 'QUALIFIED',   // nome a que a campanha está presa no Meta
        event_time: 1794657600,
        event_id: base.id,
        action_source: 'system_generated',
        user_data: { lead_id: 1234567890123456 },
        custom_data: { event_source: 'crm', lead_event_source: 'iCRM' },
      }],
    })
  })

  it('preserva todos os dígitos de um leadgen_id de 17 dígitos', () => {
    // 2^53 = 9007199254740992: acima disso o number do JS arredonda
    const id = '12345678901234567'
    const texto = buildBody({ ...base, leadgen_id: id })
    expect(texto).toContain(`"user_data":{"lead_id":${id}}`)
  })

  it('não leva dado pessoal: só o lead_id em user_data', () => {
    const body = JSON.parse(buildBody(base))
    expect(Object.keys(body.data[0].user_data)).toEqual(['lead_id'])
  })

  it('o código de teste fica fora de data e só quando informado', () => {
    expect(JSON.parse(buildBody(base, 'TEST123')).test_event_code).toBe('TEST123')
    expect(JSON.parse(buildBody(base, null))).not.toHaveProperty('test_event_code')
    expect(JSON.parse(buildBody(base, ''))).not.toHaveProperty('test_event_code')
  })

  it('recusa leadgen_id fora do padrão e nome de evento desconhecido', () => {
    expect(() => buildBody({ ...base, leadgen_id: '123' })).toThrow()
    expect(() => buildBody({ ...base, leadgen_id: '1234567890123456}' })).toThrow()
    expect(() => buildBody({ ...base, event_name: 'Lead Qualificado' })).toThrow()
  })

  it('os demais eventos saem com o próprio nome', () => {
    for (const n of ['lead_recebido', 'visita', 'proposta', 'venda']) {
      expect(JSON.parse(buildBody({ ...base, event_name: n })).data[0].event_name).toBe(n)
    }
  })

  it('os nomes de evento são fixos e em minúsculas', () => {
    expect([...EVENT_NAMES]).toEqual(['lead_recebido', 'lead_qualificado', 'visita', 'proposta', 'venda'])
    for (const n of EVENT_NAMES) expect(n).toBe(n.toLowerCase())
  })
})

describe('meta-conversions · limite de 7 dias', () => {
  const agora = new Date('2026-11-14T12:00:00Z').getTime()
  it('evento recente passa; perto de 7 dias expira', () => {
    expect(isExpired(new Date(agora - 6 * 86400000).toISOString(), agora)).toBe(false)
    expect(isExpired(new Date(agora - MAX_AGE_MS - 1000).toISOString(), agora)).toBe(true)
    expect(isExpired(new Date(agora - 7 * 86400000).toISOString(), agora)).toBe(true)
  })
})

describe('meta-conversions · leitura da resposta', () => {
  it('200 sem erro = enviado', () => {
    expect(classify(200, { events_received: 1, fbtrace_id: 'x' }).outcome).toBe('enviado')
    expect(classify(200, { fbtrace_id: 'x' }).outcome).toBe('enviado')
  })
  it('200 com zero eventos recebidos = erro', () => {
    expect(classify(200, { events_received: 0 }).outcome).toBe('erro')
  })
  it('erro de validação é definitivo e traz a mensagem do Meta', () => {
    const v = classify(400, { error: { message: 'Invalid parameter', code: 100, error_user_msg: 'lead_id inválido' } })
    expect(v.outcome).toBe('erro')
    expect(v.auth).toBe(false)
    expect(v.error).toContain('Invalid parameter')
    expect(v.error).toContain('lead_id inválido')
  })
  it('token inválido volta à fila e interrompe o lote', () => {
    const v = classify(400, { error: { message: 'Invalid OAuth access token', code: 190 } })
    expect(v).toMatchObject({ outcome: 'tentar', auth: true })
  })
  it('falha passageira volta à fila', () => {
    expect(classify(500, {}).outcome).toBe('tentar')
    expect(classify(429, {}).outcome).toBe('tentar')
    expect(classify(400, { error: { code: 4, message: 'limit' } }).outcome).toBe('tentar')
    expect(classify(400, { error: { code: 100, is_transient: true, message: 'x' } }).outcome).toBe('tentar')
  })
})
