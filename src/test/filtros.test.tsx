import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterDropdown } from '../components/shared/FilterDropdown'

/**
 * Regressão de 04/08: clicar numa opção fechava o painel e **não aplicava o
 * filtro**.
 *
 * Causa: o navegador marca o radio e dispara `change` como ação padrão do
 * clique, isto é, depois dos listeners. Como o handler do rótulo fecha o
 * popover e o React 19 aplica eventos discretos de forma síncrona, o input já
 * estava desmontado quando a ação padrão chegava — o `change` caía num nó solto.
 *
 * O contrato que estes testes travam: **escolher uma opção chama `onChange`
 * com o valor**, por clique e por teclado, e o painel fecha no clique.
 */

const OPCOES = [
  { value: 'lead',     label: 'Lead',     count: 12 },
  { value: 'followup', label: 'Followup', count: 106 },
  { value: 'visita',   label: 'Visita',   count: 3 },
]

function abrir() {
  const onChange = vi.fn()
  render(
    <FilterDropdown label="Etapa" options={OPCOES} value={null} onChange={onChange} allLabel="Todas as etapas" />
  )
  return { onChange, user: userEvent.setup() }
}

describe('FilterDropdown', () => {
  it('escolher uma opção aplica o filtro e fecha o painel', async () => {
    const { onChange, user } = abrir()

    await user.click(screen.getByRole('button', { name: /etapa/i }))
    const opcao = await screen.findByRole('radio', { name: /followup/i })

    await user.click(opcao)

    expect(onChange).toHaveBeenCalledWith('followup')
    expect(screen.queryByRole('radio', { name: /followup/i })).toBeNull()
  })

  it('a opção "todas" limpa o filtro', async () => {
    const { onChange, user } = abrir()

    await user.click(screen.getByRole('button', { name: /etapa/i }))
    await user.click(await screen.findByRole('radio', { name: /todas as etapas/i }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('reescolher a opção já marcada ainda aplica — o radio não emite `change`', async () => {
    // Este é o caso que denuncia a regressão em ambiente de teste: se a
    // aplicação dependesse só do `change` do radio, clicar no que já está
    // marcado não faria nada, porque `checked` não muda e o evento não sai.
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <FilterDropdown label="Etapa" options={OPCOES} value="lead" onChange={onChange} allLabel="Todas as etapas" />
    )
    // com filtro ativo há dois botões com "Etapa": o gatilho e o "x"
    await user.click(screen.getByRole('button', { name: /^etapa/i }))
    await user.click(await screen.findByRole('radio', { name: /^lead/i }))
    expect(onChange).toHaveBeenCalledWith('lead')
  })

  it('o gatilho ocupa a pílula inteira — sem zona morta na borda', () => {
    render(<FilterDropdown label="Etapa" options={OPCOES} value={null} onChange={() => {}} />)
    const gatilho = screen.getByRole('button', { name: /etapa/i })
    const pilula  = gatilho.parentElement!

    // A geometria (altura e recuos) tem que estar no botão. Quando estava no
    // invólucro, a pílula media 95×36 e a área clicável só 75×16.
    expect(gatilho.className).toMatch(/h-11/)
    expect(gatilho.className).toMatch(/pl-2\.5/)
    expect(pilula.className).not.toMatch(/\bh-9\b|\bpl-2\.5\b/)
  })

  it('o "x" de limpar é irmão do gatilho, nunca um botão dentro de outro', () => {
    render(<FilterDropdown label="Etapa" options={OPCOES} value="lead" onChange={() => {}} />)
    const limpar = screen.getByRole('button', { name: /remover filtro etapa/i })
    expect(limpar.closest('button')).toBe(limpar)
  })
})
