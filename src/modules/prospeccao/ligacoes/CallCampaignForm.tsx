import { useEffect, useState } from 'react'
import { Check, Loader2, Database, AlertTriangle } from 'lucide-react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useCallCampaignsStore } from '../../../store/useCallCampaignsStore'
import { useLeadListsStore } from '../../../store/useLeadListsStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { CADENCIA_PADRAO, descreveCadencia } from './config'
import type { CallCampaign } from '../../../types'
import toast from 'react-hot-toast'

/**
 * Criar ou editar campanha de ligação.
 *
 * Na criação dá para já escolher as listas da Base de Leads — é o caminho real
 * ("quero ligar para a lista do Porto Velas") e evita que a campanha nasça
 * vazia e o corretor abra a fila num beco sem saída.
 */

interface Props {
  isOpen:    boolean
  onClose:   () => void
  campaign?: CallCampaign
}

export function CallCampaignForm({ isOpen, onClose, campaign }: Props) {
  const { create, update, addLists } = useCallCampaignsStore()
  const { lists, load: loadLists }   = useLeadListsStore()
  const { profile, allProfiles, isAdmin } = useAuthStore()

  const editando = Boolean(campaign)

  const [nome,        setNome]        = useState('')
  const [descricao,   setDescricao]   = useState('')
  const [produto,     setProduto]     = useState('')
  const [ticket,      setTicket]      = useState('')
  const [maxTent,     setMaxTent]     = useState(5)
  const [reserva,     setReserva]     = useState(15)
  const [dono,        setDono]        = useState('')
  const [listasSel,   setListasSel]   = useState<Set<string>>(new Set())
  const [salvando,    setSalvando]    = useState(false)

  useEffect(() => {
    if (!isOpen) return
    void loadLists()
    setNome(campaign?.name ?? '')
    setDescricao(campaign?.description ?? '')
    setProduto(campaign?.productName ?? '')
    setTicket(campaign?.averageTicket ? String(campaign.averageTicket) : '')
    setMaxTent(campaign?.maxAttempts ?? 5)
    setReserva(campaign?.claimMinutes ?? 15)
    setDono(campaign?.ownerBrokerId ?? profile?.id ?? '')
    setListasSel(new Set())
    setSalvando(false)
  }, [isOpen, campaign, profile?.id, loadLists])

  const listasAtivas = lists.filter(l => l.status !== 'archived')
  const totalSel = listasAtivas
    .filter(l => listasSel.has(l.id))
    .reduce((acc, l) => acc + l.totalCount, 0)

  function toggle(id: string) {
    setListasSel(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSalvar() {
    if (!nome.trim()) { toast.error('Dê um nome à campanha'); return }
    setSalvando(true)
    try {
      const payload = {
        name:          nome.trim(),
        description:   descricao.trim() || undefined,
        productName:   produto.trim() || undefined,
        averageTicket: ticket ? Number(ticket.replace(/\D/g, '')) : undefined,
        maxAttempts:   maxTent,
        claimMinutes:  reserva,
        ownerBrokerId: dono || undefined,
      }

      if (campaign) {
        await update(campaign.id, payload)
        toast.success('Campanha atualizada')
      } else {
        const nova = await create({ ...payload, retryHours: CADENCIA_PADRAO })
        if (listasSel.size > 0) {
          const r = await addLists(nova.id, [...listasSel])
          toast.success(
            `Campanha criada — ${r.added.toLocaleString('pt-BR')} contatos na fila` +
            (r.ignorados > 0 ? ` (${r.ignorados} ignorados por telefone inválido)` : '')
          )
        } else {
          toast.success('Campanha criada')
        }
      }
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar a campanha')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editando ? 'Editar campanha de ligação' : 'Nova campanha de ligação'}
      size="md"
    >
      <div className="flex flex-col gap-5">

        <div>
          <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
            Nome da campanha
          </label>
          <input
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex.: Porto Velas"
            className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                       text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
              Produto
            </label>
            <input
              type="text"
              value={produto}
              onChange={e => setProduto(e.target.value)}
              placeholder="Empreendimento"
              className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                         text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25"
            />
          </div>
          <div>
            <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
              Ticket médio
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-t3">R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={ticket ? Number(ticket.replace(/\D/g, '')).toLocaleString('pt-BR') : ''}
                onChange={e => setTicket(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="w-full bg-s3/50 border border-line rounded-[14px] pl-10 pr-3.5 py-2.5 text-sm
                           text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 tabular-nums"
              />
            </div>
          </div>
        </div>

        {isAdmin && (
          <div>
            <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
              Responsável
            </label>
            <select
              value={dono}
              onChange={e => setDono(e.target.value)}
              className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                         text-t1 focus:outline-none focus:ring-2 focus:ring-brand/25 appearance-none"
            >
              <option value="">Sem responsável</option>
              {allProfiles.filter(p => p.active).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-t4 mt-1.5">
              A fila é compartilhada: todos os participantes puxam da mesma lista.
              O responsável é quem administra a campanha.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
              Máximo de tentativas
            </label>
            <input
              type="number" min={1} max={10}
              value={maxTent}
              onChange={e => setMaxTent(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                         text-t1 focus:outline-none focus:ring-2 focus:ring-brand/25 tabular-nums"
            />
          </div>
          <div>
            <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
              Reserva (min)
            </label>
            <input
              type="number" min={5} max={60}
              value={reserva}
              onChange={e => setReserva(Math.max(5, Math.min(60, Number(e.target.value) || 15)))}
              className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                         text-t1 focus:outline-none focus:ring-2 focus:ring-brand/25 tabular-nums"
            />
          </div>
        </div>

        <p className="text-[11px] text-t4 -mt-2">
          Cadência entre tentativas: {descreveCadencia(campaign?.retryHours ?? CADENCIA_PADRAO)}.
          Depois da última, o lead encerra como não localizado. A reserva impede que
          dois corretores liguem para o mesmo número ao mesmo tempo.
        </p>

        <div>
          <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
            Observações
          </label>
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            rows={2}
            placeholder="Abordagem, argumento, o que oferecer…"
            className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-2.5 text-sm
                       text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 resize-none"
          />
        </div>

        {/* Listas — só na criação; depois, pela tela de detalhe */}
        {!editando && (
          <div>
            <label className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
              Listas da Base de Leads
            </label>

            {listasAtivas.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-[14px] border border-warning-line bg-warning-bg px-3.5 py-3">
                <AlertTriangle size={14} className="text-warning flex-shrink-0" strokeWidth={1.6} />
                <p className="text-[13px] text-warning">
                  Nenhuma lista disponível. Cadastre uma em Base de Leads primeiro.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                {listasAtivas.map(l => {
                  const sel = listasSel.has(l.id)
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggle(l.id)}
                      className={`flex items-center gap-3 rounded-[14px] border p-3 text-left transition-all cursor-pointer
                        ${sel ? 'bg-brand-tint border-brand/40' : 'bg-s3/30 border-line hover:border-line-strong'}`}
                    >
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2
                        ${sel ? 'bg-brand border-brand' : 'border-t5 bg-s3/50'}`}>
                        {sel && <Check size={11} strokeWidth={3} className="text-[var(--brand-btn-text)]" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-medium truncate ${sel ? 'text-t1' : 'text-t2'}`}>{l.name}</p>
                        {l.description && <p className="text-[11px] text-t4 truncate">{l.description}</p>}
                      </div>
                      <span className="text-[11px] font-semibold text-t3 tabular-nums flex-shrink-0">
                        {l.totalCount.toLocaleString('pt-BR')}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {listasSel.size > 0 && (
              <div className="flex items-center gap-2 mt-2 rounded-[14px] border border-line bg-s2/50 px-3.5 py-2.5">
                <Database size={13} className="text-t4 flex-shrink-0" strokeWidth={1.6} />
                <p className="text-[13px] text-t3">
                  <span className="font-semibold text-t1 tabular-nums">{totalSel.toLocaleString('pt-BR')}</span> contatos
                  entram na fila. Telefones já marcados como inválidos são ignorados.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={handleSalvar} disabled={salvando}>
            {salvando
              ? <><Loader2 size={14} className="animate-spin" /> Salvando…</>
              : editando ? 'Salvar' : 'Criar campanha'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
