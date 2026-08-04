import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Painel, IconeTom } from './visual'

/**
 * A tríade obrigatória de toda tela que lê do banco: CARREGANDO, FALHOU e
 * VAZIO — nessa ordem de precedência.
 *
 * Existe porque o sistema tinha um defeito grave e invisível: quando a consulta
 * falhava, o store engolia o erro e a tela renderizava o estado vazio. Com
 * 12.578 contatos no banco, uma falha de rede fazia a página afirmar
 * "0 contatos cadastrados · Adicione seu primeiro contato". O corretor lia isso
 * como fato e trabalhava em cima.
 *
 * O toast que o `db.ts` dispara não resolve: ele dura segundos e some, e a
 * afirmação falsa fica na tela para sempre.
 *
 * Ao passar por este componente, esconder a falha deixa de ser possível por
 * descuido — `erro` é um parâmetro obrigatório, e falha sempre vence vazio.
 *
 * Ver `feedback_db_source_of_truth` e o princípio "nunca afirmar além do
 * observado" em docs/principios-visuais.md.
 */

interface Props {
  /** primeira carga em andamento (não mostrar em revisita com dado em tela) */
  carregando: boolean
  /** mensagem da falha; `null` quando a leitura deu certo */
  erro: string | null
  /** true quando a leitura deu certo e não há nada para mostrar */
  vazio: boolean
  onTentarDeNovo?: () => void

  /** conteúdo do estado vazio */
  icone?: LucideIcon
  titulo?: string
  descricao?: string
  acao?: ReactNode

  /** o que renderizar quando há dado */
  children: ReactNode
}

export function EstadoTela({
  carregando, erro, vazio, onTentarDeNovo,
  icone, titulo = 'Nada por aqui ainda', descricao, acao,
  children,
}: Props) {
  // 1. FALHA vence tudo. Se a leitura não completou, a tela não tem o direito
  //    de afirmar coisa alguma sobre o volume de dados.
  if (erro) {
    return (
      <Painel className="px-6 py-12 flex flex-col items-center gap-4 text-center">
        <IconeTom icon={AlertTriangle} tom="risco" tamanho="lg" />
        <div>
          <p className="font-heading text-base font-bold text-t1">
            Não foi possível carregar
          </p>
          <p className="text-sm text-t3 mt-1.5 max-w-md" role="alert">
            {erro}
          </p>
          <p className="text-[13px] text-t4 mt-2 max-w-md">
            O que aparece nesta tela pode estar incompleto. Não tome decisão com
            base nela até recarregar.
          </p>
        </div>
        {onTentarDeNovo && (
          <button
            onClick={onTentarDeNovo}
            className="flex items-center gap-2 rounded-[14px] border border-error-line bg-error-bg
                       px-4 py-2.5 min-h-[44px] text-[13px] font-semibold text-error
                       hover:brightness-110 transition-all cursor-pointer
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
          >
            <RefreshCw size={14} strokeWidth={1.8} aria-hidden /> Tentar de novo
          </button>
        )}
      </Painel>
    )
  }

  // 2. CARREGANDO — só quando ainda não há nada em tela.
  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3" aria-busy="true">
        <Loader2 size={24} className="animate-spin text-brand" aria-hidden />
        <p className="text-sm text-t3">Carregando…</p>
      </div>
    )
  }

  // 3. VAZIO DE VERDADE — a leitura completou e não há nada.
  if (vazio) {
    return (
      <Painel className="px-6 py-14 flex flex-col items-center gap-4 text-center">
        {icone && <IconeTom icon={icone} tom="neutro" tamanho="lg" />}
        <div>
          <p className="font-heading text-base font-bold text-t1">{titulo}</p>
          {descricao && <p className="text-sm text-t3 mt-1.5 max-w-md">{descricao}</p>}
        </div>
        {acao}
      </Painel>
    )
  }

  return <>{children}</>
}
