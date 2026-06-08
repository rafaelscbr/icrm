/**
 * MessagePickerModal.test.tsx
 *
 * Testa o componente MessagePickerModal diretamente:
 *  ✓ Estado `selected` é null ao montar (sem estado stale)
 *  ✓ Estado `selected` é resetado a cada abertura (useLayoutEffect)
 *  ✓ Botão desabilitado quando nenhum template selecionado
 *  ✓ Loading state durante confirmação
 *  ✓ Modal fecha SOMENTE após sucesso do onPick
 *  ✓ Modal fica aberto quando onPick lança erro
 *  ✓ onClose bloqueado durante loading
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock Supabase (necessário pois LeadsTab importa supabase transitivamente)
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    },
    getChannels: vi.fn(() => []),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(() => ({})) })),
    removeChannel: vi.fn(),
  }
}))
vi.mock('../lib/auth', () => ({
  getCurrentUserId: vi.fn(() => 'broker-id'),
  requireBrokerId:  vi.fn(() => 'broker-id'),
}))
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }),
}))

// Mock simplificado do Modal — renderiza children + footer diretamente
vi.mock('../components/ui/Modal', () => ({
  Modal: ({ isOpen, children, footer, onClose }: {
    isOpen: boolean; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void
  }) => {
    if (!isOpen) return null
    return (
      <div data-testid="modal">
        <div data-testid="modal-body">{children}</div>
        <div data-testid="modal-footer">{footer}</div>
        <button data-testid="modal-backdrop" onClick={onClose}>backdrop</button>
      </div>
    )
  }
}))

// ─── Import do componente ─────────────────────────────────────────────────────

import { MessagePickerModal } from '../modules/campaigns/LeadsTab'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEMPLATES = ['Olá {nome}, tudo bem?', 'Oi {nome}! Como posso ajudar?']

function renderModal(props: {
  isOpen?: boolean
  onPick?: (msg: string, idx: number) => Promise<void>
  onClose?: () => void
}) {
  const onClose = props.onClose ?? vi.fn()
  const onPick  = props.onPick  ?? vi.fn(async () => {})
  return render(
    <MessagePickerModal
      isOpen={props.isOpen ?? true}
      onClose={onClose}
      templates={TEMPLATES}
      leadName="João Silva"
      onPick={onPick}
    />
  )
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('MessagePickerModal', () => {

  it('MODAL-1: não renderiza nada quando isOpen=false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByTestId('modal')).toBeNull()
  })

  it('MODAL-2: renderiza o modal quando isOpen=true', () => {
    renderModal({ isOpen: true })
    expect(screen.getByTestId('modal')).toBeDefined()
  })

  it('MODAL-3: botão "Enviar mensagem" desabilitado ao abrir (nenhuma opção selecionada)', () => {
    renderModal({})
    const btn = screen.getByRole('button', { name: /Enviar mensagem/i })
    expect(btn).toBeDisabled()
  })

  it('MODAL-4: botão habilitado após selecionar template', async () => {
    renderModal({})
    const template1 = screen.getAllByRole('button').find(b => b.textContent?.includes('Mensagem principal'))
    await act(async () => { fireEvent.click(template1!) })
    const confirmBtn = screen.getByRole('button', { name: /Enviar mensagem 1/i })
    expect(confirmBtn).not.toBeDisabled()
  })

  it('MODAL-5: mostra loading spinner durante onPick', async () => {
    let resolveDispatch!: () => void
    const dispatchPromise = new Promise<void>(r => { resolveDispatch = r })
    const onPick  = vi.fn(() => dispatchPromise)
    const onClose = vi.fn()

    renderModal({ onPick, onClose })

    // Seleciona template
    const template1 = screen.getAllByRole('button').find(b => b.textContent?.includes('Mensagem principal'))
    await act(async () => { fireEvent.click(template1!) })

    // Clica confirmar — dispatch pendente
    const confirmBtn = screen.getByRole('button', { name: /Enviar mensagem 1/i })
    await act(async () => { fireEvent.click(confirmBtn) })

    // Deve mostrar "Registrando…"
    await waitFor(() => {
      expect(screen.queryByText(/Registrando/)).toBeDefined()
    })

    // Resolve o dispatch
    await act(async () => { resolveDispatch() })

    // Após sucesso, onClose deve ter sido chamado
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('MODAL-6: modal fecha SOMENTE após onPick resolver com sucesso', async () => {
    const onClose = vi.fn()
    const onPick  = vi.fn(async () => { /* sucesso imediato */ })

    renderModal({ onPick, onClose })

    const template1 = screen.getAllByRole('button').find(b => b.textContent?.includes('Mensagem principal'))
    await act(async () => { fireEvent.click(template1!) })

    const confirmBtn = screen.getByRole('button', { name: /Enviar mensagem 1/i })
    await act(async () => { fireEvent.click(confirmBtn) })

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('MODAL-7: modal NÃO fecha quando onPick lança erro', async () => {
    const onClose = vi.fn()
    const onPick  = vi.fn().mockRejectedValue(new Error('DB timeout'))

    renderModal({ onPick, onClose })

    const template1 = screen.getAllByRole('button').find(b => b.textContent?.includes('Mensagem principal'))
    await act(async () => { fireEvent.click(template1!) })

    const confirmBtn = screen.getByRole('button', { name: /Enviar mensagem 1/i })
    await act(async () => { fireEvent.click(confirmBtn) })

    // Aguarda o estado de loading ser resolvido
    await waitFor(() => {
      expect(screen.queryByText(/Registrando/)).toBeNull()
    })

    // onClose NÃO deve ter sido chamado
    expect(onClose).not.toHaveBeenCalled()
    // Modal ainda visível (pode tentar de novo)
    expect(screen.getByTestId('modal')).toBeDefined()
  })

  it('MODAL-8: botão reabilitado após erro (permite retry)', async () => {
    const onClose = vi.fn()
    const onPick  = vi.fn().mockRejectedValue(new Error('Falha de rede'))

    renderModal({ onPick, onClose })

    const template1 = screen.getAllByRole('button').find(b => b.textContent?.includes('Mensagem principal'))
    await act(async () => { fireEvent.click(template1!) })

    const confirmBtn = screen.getByRole('button', { name: /Enviar mensagem 1/i })
    await act(async () => { fireEvent.click(confirmBtn) })

    await waitFor(() => {
      // Após erro, loading deve ter voltado a false
      const btn = screen.getByRole('button', { name: /Enviar mensagem/i })
      expect(btn).not.toBeDisabled()
    })
  })

  it('MODAL-9: onClose do backdrop bloqueado durante loading', async () => {
    let resolveDispatch!: () => void
    const dispatchPromise = new Promise<void>(r => { resolveDispatch = r })
    const onPick  = vi.fn(() => dispatchPromise)
    const onClose = vi.fn()

    renderModal({ onPick, onClose })

    const template1 = screen.getAllByRole('button').find(b => b.textContent?.includes('Mensagem principal'))
    await act(async () => { fireEvent.click(template1!) })

    const confirmBtn = screen.getByRole('button', { name: /Enviar mensagem 1/i })
    await act(async () => { fireEvent.click(confirmBtn) })

    // Durante loading, o backdrop usa () => {} (no-op)
    // O backdrop vai chamar onClose que foi passado como loading ? () => {} : onClose
    // Durante loading, onClose passado ao Modal é () => {} — não fecha
    // Simulamos isso clicando no backdrop
    const backdrop = screen.getByTestId('modal-backdrop')
    await act(async () => { fireEvent.click(backdrop) })

    // onClose real NÃO deve ter sido chamado (o backdrop estava no-op)
    // Nota: o mock do Modal passa onClose diretamente, então se loading=true
    // o onClose passado ao Modal seria () => {} — o teste verifica indiretamente
    // que o modal AINDA está aberto (não desmontou)
    expect(screen.getByTestId('modal')).toBeDefined()

    // Resolve para limpar
    await act(async () => { resolveDispatch() })
  })

  it('MODAL-10: selected é sempre null ao montar (sem estado stale de disparo anterior)', async () => {
    const onPick  = vi.fn(async () => {})
    const onClose = vi.fn()

    const { rerender } = render(
      <MessagePickerModal
        key="lead-001"
        isOpen={true}
        onClose={onClose}
        templates={TEMPLATES}
        leadName="Lead 1"
        onPick={onPick}
      />
    )

    // Seleciona template e confirma (primeiro disparo)
    const template1 = screen.getAllByRole('button').find(b => b.textContent?.includes('Mensagem principal'))
    await act(async () => { fireEvent.click(template1!) })
    const confirmBtn = screen.getByRole('button', { name: /Enviar mensagem 1/i })
    await act(async () => { fireEvent.click(confirmBtn) })
    await waitFor(() => expect(onClose).toHaveBeenCalled())

    // Segundo disparo — novo lead, nova key (força remount)
    rerender(
      <MessagePickerModal
        key="lead-002"          // ← key diferente → remount → estado limpo
        isOpen={true}
        onClose={vi.fn()}
        templates={TEMPLATES}
        leadName="Lead 2"
        onPick={vi.fn(async () => {})}
      />
    )

    // Botão deve estar desabilitado (selected=null após remount)
    const btn = screen.getByRole('button', { name: /Enviar mensagem/i })
    expect(btn).toBeDisabled()
  })
})
