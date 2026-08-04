import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EstadoTela } from '../components/shared/EstadoTela'

/**
 * O bug que este componente existe para impedir: a leitura falha, o store
 * engole o erro, e a tela afirma "0 registros" com o banco cheio.
 *
 * A precedência erro > carregando > vazio é o contrato. Se alguém inverter,
 * estes testes quebram.
 */
describe('EstadoTela', () => {
  it('falha vence vazio — nunca afirma ausência de dado sem ter lido', () => {
    render(
      <EstadoTela carregando={false} erro="Falha de comunicação com o banco." vazio
                  titulo="Nenhum contato cadastrado">
        <p>lista</p>
      </EstadoTela>
    )
    expect(screen.getByText('Não foi possível carregar')).toBeTruthy()
    expect(screen.queryByText('Nenhum contato cadastrado')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe('Falha de comunicação com o banco.')
  })

  it('falha vence carregando', () => {
    render(
      <EstadoTela carregando erro="caiu" vazio={false}><p>lista</p></EstadoTela>
    )
    expect(screen.getByText('Não foi possível carregar')).toBeTruthy()
    expect(screen.queryByText('Carregando…')).toBeNull()
  })

  it('carregando vence vazio — vazio só depois da leitura completar', () => {
    render(
      <EstadoTela carregando erro={null} vazio titulo="Nada aqui">
        <p>lista</p>
      </EstadoTela>
    )
    expect(screen.getByText('Carregando…')).toBeTruthy()
    expect(screen.queryByText('Nada aqui')).toBeNull()
  })

  it('vazio de verdade: leitura completou e não veio nada', () => {
    render(
      <EstadoTela carregando={false} erro={null} vazio titulo="Nada aqui">
        <p>lista</p>
      </EstadoTela>
    )
    expect(screen.getByText('Nada aqui')).toBeTruthy()
    expect(screen.queryByText('lista')).toBeNull()
  })

  it('com dado, renderiza os filhos e nada mais', () => {
    render(
      <EstadoTela carregando={false} erro={null} vazio={false} titulo="Nada aqui">
        <p>lista</p>
      </EstadoTela>
    )
    expect(screen.getByText('lista')).toBeTruthy()
    expect(screen.queryByText('Não foi possível carregar')).toBeNull()
  })

  it('oferece nova tentativa quando há como tentar de novo', () => {
    render(
      <EstadoTela carregando={false} erro="caiu" vazio={false} onTentarDeNovo={() => {}}>
        <p>lista</p>
      </EstadoTela>
    )
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeTruthy()
  })
})
