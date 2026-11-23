import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../pages/LoginPage'
import { useAuthStore } from '../store/useAuthStore'
import { guardarUltimaConta, lerUltimaConta } from '../lib/ultimaConta'

// A tela de entrada reconhece quem volta: foto, "É você?", e-mail preenchido.
// "Não é você?" esquece a conta e volta ao formulário completo.

function montar() {
  useAuthStore.setState({ user: null })
  render(<MemoryRouter><LoginPage /></MemoryRouter>)
}

describe('entrada · quem volta', () => {
  beforeEach(() => localStorage.clear())

  it('sem conta lembrada, formulário normal', () => {
    montar()
    expect(screen.getByText('Entre com sua conta para abrir o seu funil.')).toBeTruthy()
    expect(screen.queryByText(/É você\?/)).toBeNull()
  })

  it('com conta lembrada, pergunta se é a pessoa e já traz o e-mail', () => {
    guardarUltimaConta({ email: 'ryan@souza.com', nome: 'Ryan Maciel', foto: '/corretores/ryan.jpg' })
    montar()
    expect(screen.getByText(/É você\?/)).toBeTruthy()
    expect(screen.getByText('Ryan')).toBeTruthy()
    expect(screen.getByText('ryan@souza.com')).toBeTruthy()
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe('ryan@souza.com')
    expect(document.querySelector('img[src="/corretores/ryan.jpg"]')).toBeTruthy()
  })

  it('"Não é você?" esquece a conta e limpa o e-mail', () => {
    guardarUltimaConta({ email: 'ryan@souza.com', nome: 'Ryan Maciel' })
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Não é você?' }))
    expect(lerUltimaConta()).toBeNull()
    expect(screen.getByText('Entre com sua conta para abrir o seu funil.')).toBeTruthy()
    expect((screen.getByLabelText('E-mail') as HTMLInputElement).value).toBe('')
  })

  it('nunca guarda senha', () => {
    guardarUltimaConta({ email: 'a@b.com', nome: 'A' })
    expect(localStorage.getItem('icrm:ultima-conta')).not.toMatch(/senha|password/i)
  })
})
