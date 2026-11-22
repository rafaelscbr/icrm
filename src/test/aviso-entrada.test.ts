import { describe, it, expect, vi, beforeEach } from 'vitest'

const registrar = vi.fn()
vi.mock('../lib/db', () => ({ db: { notifications: { registrarEntradaDoDia: (...a: unknown[]) => registrar(...a) } } }))

import { diaDeSaoPaulo, registrarEntradaDoDia } from '../lib/avisoEntrada'

describe('aviso de entrada do corretor', () => {
  beforeEach(() => {
    registrar.mockReset()
    localStorage.clear()
    vi.useRealTimers()
  })

  it('o dia é o de São Paulo, não o UTC', () => {
    // 02:30 UTC de 23/11 ainda é 22/11 em São Paulo (UTC−3)
    expect(diaDeSaoPaulo(new Date('2026-11-23T02:30:00Z'))).toBe('2026-11-22')
    expect(diaDeSaoPaulo(new Date('2026-11-23T03:00:00Z'))).toBe('2026-11-23')
  })

  it('chama o banco uma vez por dia por aparelho', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-22T11:00:00Z'))
    registrar.mockResolvedValue(true)

    await registrarEntradaDoDia('u1')
    await registrarEntradaDoDia('u1')
    expect(registrar).toHaveBeenCalledTimes(1)

    // dia seguinte: chama de novo
    vi.setSystemTime(new Date('2026-11-23T11:00:00Z'))
    await registrarEntradaDoDia('u1')
    expect(registrar).toHaveBeenCalledTimes(2)
  })

  it('se o banco falha, tenta de novo na próxima volta', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    registrar.mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(true)

    await registrarEntradaDoDia('u2')
    await registrarEntradaDoDia('u2')
    expect(registrar).toHaveBeenCalledTimes(2)
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })
})
