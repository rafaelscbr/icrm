import { it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiretoSimulator } from '../modules/simulador/direto/Simulator'
import { AssociativoSimulator } from '../modules/simulador/associativo/Simulator'

it('modo individual: converte, adiciona com +, remove e recalcula', () => {
  render(<DiretoSimulator shared={{ empreendimento: 'X', cliente: '', telefone: '', valorTotal: 600000 }} onShared={() => {}} corretor="R" />)
  // O simulador abre vazio: o corretor monta 9 reforços semestrais de R$ 8.000 e 56 parcelas
  const [, qtdReforco, qtdParcelas] = screen.getAllByLabelText('Quantidade')
  fireEvent.change(qtdReforco, { target: { value: '9' } })
  fireEvent.change(screen.getByLabelText('Valor por reforço'), { target: { value: '800000' } })
  fireEvent.change(qtdParcelas, { target: { value: '56' } })
  fireEvent.click(screen.getByRole('button', { name: 'Individual' }))
  // 9 reforços semestrais viram 9 linhas editáveis
  expect(screen.getAllByText(/^Reforço \d+$/).length).toBe(9)
  expect(screen.getByText('9 reforços')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Adicionar reforço/ }))
  expect(screen.getAllByText(/^Reforço \d+$/).length).toBe(10)
  fireEvent.click(screen.getByRole('button', { name: 'Remover reforço 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remover reforço 1' }))
  expect(screen.getAllByText(/^Reforço \d+$/).length).toBe(8)
  const meses = screen.getAllByLabelText('Mês') as HTMLSelectElement[]
  fireEvent.change(meses[0], { target: { value: '12' } })
  expect(meses[0].value).toBe('12')
  // card mostra total em reforços = 8 × 8000
  expect(screen.getAllByText(/64\.000,00/).length).toBeGreaterThan(0)
  // volta ao periódico sem perder a lista
  fireEvent.click(screen.getByRole('button', { name: 'Periódico' }))
  expect(screen.queryByText(/^Reforço \d+$/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Individual' }))
  expect(screen.getAllByText(/^Reforço \d+$/).length).toBe(8)
})

it('associativo: balões individuais com + e remoção', () => {
  render(<AssociativoSimulator shared={{ empreendimento: 'X', cliente: '', telefone: '', valorTotal: 480000 }} onShared={() => {}} corretor="R" />)
  // O simulador abre vazio: o corretor monta 3 balões anuais
  const qtds = screen.getAllByLabelText('Quantidade')
  fireEvent.change(qtds[1], { target: { value: '36' } })
  fireEvent.change(qtds[2], { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Individuais' }))
  expect(screen.getAllByText(/^Balão \d+$/).length).toBe(3)
  fireEvent.click(screen.getByRole('button', { name: /Adicionar balão/ }))
  expect(screen.getAllByText(/^Balão \d+$/).length).toBe(4)
  fireEvent.click(screen.getByRole('button', { name: 'Remover balão 4' }))
  expect(screen.getAllByText(/^Balão \d+$/).length).toBe(3)
  expect(screen.getByText('3 balões')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Anuais' }))
  expect(screen.queryByText(/^Balão \d+$/)).toBeNull()
})
