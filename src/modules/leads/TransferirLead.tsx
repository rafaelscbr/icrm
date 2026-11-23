import { FotoPerfil } from '../../components/shared/FotoPerfil'
import { useEffect, useState } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Lead } from '../../types'
import { useAuthStore } from '../../store/useAuthStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { slaActive } from './SlaBadge'

/**
 * O corretor responsável, na ficha do lead — e a transferência para outro.
 *
 * Quem pode: o admin, em qualquer lead; o corretor, nos leads DELE. O banco
 * confere de novo (transfer_lead): a tela só deixa de oferecer o que o banco
 * recusaria.
 *
 * Para onde:
 *   • admin   → qualquer usuário ativo, em um clique (ele consegue desfazer).
 *   • corretor → só outros corretores ativos, e com confirmação. Para ele a
 *     transferência não tem volta: ao deixar de ser o dono, o lead sai do funil
 *     dele e só quem recebeu (ou o admin) pode devolver.
 *
 * O histórico vai junto: quem recebe lê a ficha inteira (migração 094).
 */
export function TransferirLead({ lead, brokerName, canTransfer, onTransferido }: {
  lead: Lead
  /** nome do responsável atual; `undefined` quando o lead está sem corretor */
  brokerName?: string
  canTransfer: boolean
  /** corretor transferiu: o lead saiu do funil dele e a ficha deve fechar */
  onTransferido: () => void
}) {
  const { profile, isAdmin, allProfiles, fetchAllProfiles } = useAuthStore()
  const transfer = useLeadsStore(s => s.transfer)

  const [aberto, setAberto]             = useState(false)
  const [carga, setCarga]               = useState<'pronto' | 'carregando' | 'erro'>('pronto')
  const [confirmar, setConfirmar]       = useState<{ id: string; name: string } | null>(null)
  const [transferindo, setTransferindo] = useState(false)

  // A lista de usuários só vem pronta no login do admin; o corretor busca na
  // primeira vez que abre o menu. Lista vazia é falha (o próprio usuário
  // sempre volta nela), então vira erro com "tentar de novo", nunca um menu
  // em branco.
  async function carregar() {
    setCarga('carregando')
    try {
      const perfis = await fetchAllProfiles()
      setCarga(perfis.length > 0 ? 'pronto' : 'erro')
    } catch {
      setCarga('erro')
    }
  }

  function alternar() {
    if (!canTransfer) return
    const abrir = !aberto
    setAberto(abrir)
    setConfirmar(null)
    if (abrir && allProfiles.length === 0) void carregar()
  }

  function fechar() {
    if (transferindo) return
    setAberto(false)
    setConfirmar(null)
  }

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); fechar() } }
    document.addEventListener('keydown', aoTeclar, true)
    return () => document.removeEventListener('keydown', aoTeclar, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `fechar` só lê estado; reassinar a cada render não muda nada
  }, [aberto, transferindo])

  const destinos = allProfiles.filter(p =>
    p.active && (isAdmin || (p.role === 'broker' && p.id !== profile?.id))
  )

  // Banco primeiro: a função valida a permissão e grava a trilha (quem passou
  // para quem), a nota no histórico e o aviso para quem recebe. A tela só muda
  // depois que o banco confirmou.
  async function transferir(id: string, name: string) {
    if (id === lead.brokerId) { fechar(); return }
    setTransferindo(true)
    try {
      await transfer(lead.id, id)
      toast.success(`Lead transferido para ${name.split(' ')[0]}`)
      setAberto(false)
      setConfirmar(null)
      if (!isAdmin) onTransferido()
    } catch { /* erro já avisado pela camada do banco */ }
    finally { setTransferindo(false) }
  }

  const primeiroNome = brokerName ? brokerName.split(' ')[0] : 'Atribuir'
  const dono = lead.brokerId
    ? (lead.brokerId === profile?.id ? profile : allProfiles.find(p => p.id === lead.brokerId))
    : undefined

  return (
    <div className="relative">
      <button
        type="button"
        onClick={alternar}
        disabled={!canTransfer}
        title={canTransfer ? 'Transferir para outro corretor' : `Corretor: ${brokerName}`}
        aria-haspopup={canTransfer ? 'dialog' : undefined}
        aria-expanded={canTransfer ? aberto : undefined}
        className={`inline-flex items-center gap-2 h-9 pl-1 pr-3 rounded-full bg-s2 text-[13.5px] font-medium text-t1
          ${canTransfer ? 'hover:bg-s3 cursor-pointer' : 'cursor-default'}`}
      >
        {/* O rosto do responsável: o lead tem dono, e o dono é gente */}
        <FotoPerfil nome={brokerName ?? '?'} url={dono?.avatarUrl} tamanho={28} />
        {primeiroNome}
        {canTransfer && <ChevronDown size={12} strokeWidth={1.8} className="text-t4" aria-hidden />}
      </button>

      {canTransfer && aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={fechar} aria-hidden />
          <div className="absolute left-0 top-full mt-1.5 z-20 w-[264px] bg-surface border border-line rounded-[14px] shadow-dropdown overflow-hidden"
               role="dialog" aria-label="Transferir lead">
            {confirmar ? (
              // Confirmação do corretor: curta, diz o que acontece e o que não volta.
              <div className="p-3.5">
                <p className="text-[14px] font-semibold text-t1 leading-snug">
                  Transferir para {confirmar.name.split(' ')[0]}?
                </p>
                <p className="text-[12.5px] text-t3 leading-snug mt-1.5">
                  O lead sai do seu funil e o histórico vai junto. {confirmar.name.split(' ')[0]} recebe um aviso.
                  {' '}Só quem recebeu, ou o administrador, pode devolver.
                </p>
                {slaActive(lead) && (
                  <p className="text-[12.5px] text-warning leading-snug mt-1.5">
                    O prazo de 1º contato continua contando: a transferência não reinicia o relógio.
                  </p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => void transferir(confirmar.id, confirmar.name)}
                    disabled={transferindo}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-[10px] bg-brand-fill text-brand-fill-text
                               hover:bg-brand-fill-hover text-[13px] font-semibold cursor-pointer disabled:opacity-70
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    {transferindo && <Loader2 size={13} className="animate-spin" aria-hidden />}
                    {transferindo ? 'Transferindo…' : 'Transferir'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmar(null)}
                    disabled={transferindo}
                    className="h-9 px-3 rounded-[10px] text-[13px] font-medium text-t2 hover:bg-s2 cursor-pointer disabled:opacity-70
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="px-3 pt-2.5 pb-1.5 font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-t4">
                  Transferir para
                </p>
                {carga === 'carregando' && (
                  <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-t3" role="status">
                    <Loader2 size={13} className="animate-spin" aria-hidden /> Carregando corretores…
                  </p>
                )}
                {carga === 'erro' && (
                  <div className="px-3 pb-3" role="alert">
                    <p className="text-[13px] text-error leading-snug">Não foi possível carregar os corretores.</p>
                    <button type="button" onClick={() => void carregar()}
                      className="mt-2 h-8 px-3 rounded-[9px] text-[13px] font-semibold text-t1 bg-s2 hover:bg-s3 cursor-pointer">
                      Tentar de novo
                    </button>
                  </div>
                )}
                {carga === 'pronto' && destinos.length === 0 && allProfiles.length > 0 && (
                  <p className="px-3 pb-3 text-[13px] text-t3 leading-snug">Não há outro corretor ativo para receber o lead.</p>
                )}
                {carga === 'pronto' && destinos.length > 0 && (
                  <ul className="pb-1 max-h-[280px] overflow-y-auto" aria-label="Corretores">
                    {destinos.map(p => {
                      const atual = p.id === lead.brokerId
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            disabled={transferindo || atual}
                            aria-current={atual ? 'true' : undefined}
                            onClick={() => isAdmin ? void transferir(p.id, p.name) : setConfirmar({ id: p.id, name: p.name })}
                            className={`w-full flex items-center gap-2.5 px-3 min-h-[40px] text-left text-[13.5px] transition-colors
                              ${atual ? 'text-t1 bg-s2 cursor-default' : 'text-t2 hover:bg-s2 cursor-pointer'}`}
                          >
                            <FotoPerfil nome={p.name} url={p.avatarUrl} tamanho={24} />
                            <span className="flex-1 truncate">{p.name}</span>
                            {atual && <Check size={14} className="text-brand-text flex-shrink-0" aria-label="Responsável atual" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
