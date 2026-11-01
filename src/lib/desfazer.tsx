import toast from 'react-hot-toast'

/**
 * Aviso de exclusão com "Desfazer" (01/11/2026).
 *
 * A exclusão já aconteceu no banco quando este aviso aparece — o sistema não
 * esconde o registro e apaga depois (isso seria otimista). Desfazer é gravar
 * de novo: o `restaurar` faz o upsert com o mesmo id e só então o registro
 * volta para a tela. Se a restauração falhar, o erro aparece e nada muda.
 *
 * Só entra onde a exclusão não leva nada junto em cascata no banco — contato,
 * imóvel e campanha apagam listas, filas e leads, e "desfazer" ali
 * devolveria um registro pela metade.
 */
export function avisarComDesfazer(mensagem: string, restaurar: () => Promise<unknown>) {
  toast((t) => (
    <div className="flex items-center gap-4">
      <span className="text-[14px] text-t1">{mensagem}</span>
      <button
        type="button"
        onClick={async () => {
          toast.dismiss(t.id)
          const id = toast.loading('Restaurando…')
          try {
            await restaurar()
            toast.success('Restaurado', { id })
          } catch {
            toast.error('Não foi possível restaurar.', { id })
          }
        }}
        className="shrink-0 text-[14px] font-semibold text-brand-text hover:underline cursor-pointer
                   focus:outline-none focus-visible:underline"
      >
        Desfazer
      </button>
    </div>
  ), { duration: 7000 })
}
