import { useEffect, useState } from 'react'
import { Loader2, PauseCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLeadPauseStore } from '../../store/useLeadPauseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { fraseDaVolta, pausaEmVigor } from '../../lib/pausaLeads'
import { useFotoDoCorretor } from '../../components/shared/CorretorComFoto'
import { FotoPerfil } from '../../components/shared/FotoPerfil'

/**
 * Quem está fora da roleta agora — visão do admin (migração 089).
 *
 * O corretor pausa o recebimento pelo menu do perfil; aqui o admin vê quem
 * pausou, até quando, e pode devolver alguém à roleta antes da hora. Sem
 * ninguém em pausa o bloco não aparece: a tela de rodízio continua limpa.
 */
export function PausasDaEquipe() {
  const { pausas, carregado, erro, carregando, carregar, retomar } = useLeadPauseStore()
  const { allProfiles, fetchAllProfiles, profile } = useAuthStore()
  const [agora, setAgora] = useState(() => Date.now())
  const [devolvendo, setDevolvendo] = useState<string | null>(null)
  const fotoDe = useFotoDoCorretor()

  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => { if (allProfiles.length === 0) void fetchAllProfiles() }, [allProfiles.length, fetchAllProfiles])
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  if (!carregado && erro) {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-[14px] border border-error-line bg-error-bg px-4 py-3" role="alert">
        <p className="flex-1 text-[13.5px] text-error">Não foi possível ler quem está com o recebimento de leads pausado.</p>
        <button type="button" onClick={() => void carregar()} disabled={carregando}
                className="cursor-pointer text-[13px] font-semibold text-error underline-offset-2 hover:underline disabled:opacity-60">
          Tentar de novo
        </button>
      </div>
    )
  }

  const emVigor = pausas.filter(p => pausaEmVigor(p, agora))
  if (emVigor.length === 0) return null

  const nome = (id: string) =>
    allProfiles.find(p => p.id === id)?.name ?? (id === profile?.id ? profile.name : 'Corretor')

  async function devolver(brokerId: string) {
    setDevolvendo(brokerId)
    try {
      await retomar(brokerId)
      toast.success(`${nome(brokerId)} voltou para a roleta`)
    } catch {
      // erro já mostrado pela camada do banco; a pausa continua na lista
    } finally {
      setDevolvendo(null)
    }
  }

  return (
    <section className="mb-5 rounded-[14px] border border-warning-line bg-warning-bg px-4 py-3.5" aria-label="Corretores fora da roleta">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-t1">
        <PauseCircle size={15} strokeWidth={1.9} className="text-warning" aria-hidden />
        {emVigor.length === 1 ? '1 corretor fora da roleta agora' : `${emVigor.length} corretores fora da roleta agora`}
      </p>
      <p className="mt-0.5 text-[12.5px] text-t3">
        Pausaram o recebimento de leads. Enquanto isso, a roleta e o rodízio por tempo de resposta pulam a vez deles.
      </p>
      <ul className="mt-3 divide-y divide-warning-line/60">
        {emVigor.map(p => (
          <li key={p.id} className="flex items-center gap-3 py-2">
            <FotoPerfil nome={nome(p.brokerId)} url={fotoDe(p.brokerId)} tamanho={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-t1">{nome(p.brokerId)}</p>
              <p className="text-[12.5px] tabular-nums text-t3">{fraseDaVolta(p.untilAt, agora)}</p>
            </div>
            <button type="button" onClick={() => void devolver(p.brokerId)} disabled={devolvendo !== null}
                    className="flex h-9 flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3
                               text-[13px] font-semibold text-t1 transition-colors hover:bg-s2 disabled:cursor-default disabled:opacity-60
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
              {devolvendo === p.brokerId && <Loader2 size={13} className="animate-spin" aria-hidden />}
              Devolver à roleta
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
