import { Link, useLocation } from 'react-router-dom'
import { Compass, Home } from 'lucide-react'
import { Painel, IconeTom } from './visual'

/**
 * 404 dentro do app.
 *
 * Antes, uma URL desconhecida casava com `/*` e caía em `AppRoutes`, onde
 * nenhuma `Route` interna batia: a sidebar aparecia e o conteúdo ficava vazio.
 * Parecia tela quebrada, e um link antigo ou um erro de digitação eram
 * indistinguíveis de uma falha do sistema.
 *
 * Também é o que um corretor vê ao abrir `/admin`: a rota só existe para admin,
 * então "não existe para você" é a resposta certa — e honesta.
 */
export function NaoEncontrada() {
  const { pathname } = useLocation()

  return (
    <div className="p-4 sm:p-6">
      <Painel className="px-6 py-16 flex flex-col items-center gap-4 text-center">
        <IconeTom icon={Compass} tom="neutro" tamanho="lg" />
        <div>
          <p className="font-heading text-base font-bold text-t1">
            Esta página não existe
          </p>
          <p className="text-sm text-t3 mt-1.5 max-w-md">
            Nada responde por <span className="font-mono text-t2">{pathname}</span>.
            Pode ser um link antigo, um endereço digitado errado, ou uma tela que
            só admin enxerga.
          </p>
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 rounded-[14px] border border-line bg-s2
                     px-4 py-2.5 min-h-[44px] text-[13px] font-semibold text-t2
                     hover:bg-s3 transition-all
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Home size={14} strokeWidth={1.8} aria-hidden /> Voltar para o início
        </Link>
      </Painel>
    </div>
  )
}
