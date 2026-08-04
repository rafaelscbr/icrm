import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Painel, IconeTom } from './visual'

/**
 * Fronteira de erro de render.
 *
 * Sem ela, uma exceção em qualquer componente de rota desmonta a árvore inteira
 * e o corretor fica com a tela branca — sem sidebar, sem menu, sem nada que
 * indique o que fazer. O único caminho de volta é fechar e reabrir.
 *
 * O router aqui é o declarativo (`BrowserRouter` + `Routes`), não o data
 * router; `errorElement` não existe nesse modo. Uma classe com
 * `componentDidCatch` é o equivalente — e é o único jeito de capturar erro de
 * render em React, hooks não fazem isso.
 *
 * A chave é `resetKey`: quando o caminho muda, o boundary volta a renderizar.
 * Sem isso, um erro em uma tela travaria todas as outras.
 */

interface Props {
  children: ReactNode
  /** muda quando a rota muda — zera o estado de erro */
  resetKey?: string
}

interface State {
  erro: Error | null
}

export class ErroDeTela extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.erro) {
      this.setState({ erro: null })
    }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('[render] tela quebrou:', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <div className="p-4 sm:p-6">
        <Painel className="px-6 py-14 flex flex-col items-center gap-4 text-center">
          <IconeTom icon={AlertTriangle} tom="risco" tamanho="lg" />
          <div>
            <p className="font-heading text-base font-bold text-t1">
              Esta tela parou de responder
            </p>
            <p className="text-sm text-t3 mt-1.5 max-w-md" role="alert">
              Um erro inesperado interrompeu a renderização. Nada do que você
              tinha salvo foi perdido — o problema é só de exibição.
            </p>
            <p className="text-[13px] text-t4 mt-2 max-w-md font-mono break-words">
              {this.state.erro.message}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 rounded-[14px] border border-error-line bg-error-bg
                         px-4 py-2.5 min-h-[44px] text-[13px] font-semibold text-error
                         hover:brightness-110 transition-all cursor-pointer
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
            >
              <RefreshCw size={14} strokeWidth={1.8} aria-hidden /> Recarregar
            </button>
            <a
              href="/"
              className="flex items-center gap-2 rounded-[14px] border border-line bg-s2
                         px-4 py-2.5 min-h-[44px] text-[13px] font-semibold text-t2
                         hover:bg-s3 transition-all
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Home size={14} strokeWidth={1.8} aria-hidden /> Ir para o início
            </a>
          </div>
        </Painel>
      </div>
    )
  }
}
