import { useEffect, useState } from 'react'
import {
  Check, Loader2, Database, AlertTriangle, Megaphone, Package, Wallet,
  Repeat, Timer, UserCircle2, Users,
} from 'lucide-react'
import { SidePanel } from '../../../components/ui/SidePanel'
import { Button } from '../../../components/ui/Button'
import { Rotulo, IconeTom, Dica } from './Primitivas'
import { useCallCampaignsStore } from '../../../store/useCallCampaignsStore'
import { useLeadListsStore } from '../../../store/useLeadListsStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { CADENCIA_PADRAO, descreveCadencia } from './config'
import type { CallCampaign } from '../../../types'
import toast from 'react-hot-toast'

/**
 * Criar ou editar campanha de ligação — painel lateral.
 *
 * Na criação dá para já escolher as listas da Base de Leads. É o caminho real
 * ("quero ligar para a lista do Porto Velas") e evita que a campanha nasça
 * vazia e o corretor abra a fila num beco sem saída — um clique a menos e um
 * erro a menos.
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

  const [nome,      setNome]      = useState('')
  const [descricao, setDescricao] = useState('')
  const [produto,   setProduto]   = useState('')
  const [ticket,    setTicket]    = useState('')
  const [maxTent,   setMaxTent]   = useState(5)
  const [reserva,   setReserva]   = useState(15)
  const [dono,      setDono]      = useState('')
  const [listasSel, setListasSel] = useState<Set<string>>(new Set())
  const [salvando,  setSalvando]  = useState(false)

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
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={editando ? 'Editar campanha' : 'Nova campanha de ligação'}
      subtitle={editando ? campaign?.name : 'Prospecção ativa por telefone'}
      size="lg"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={handleSalvar} disabled={salvando}>
            {salvando
              ? <><Loader2 size={14} className="animate-spin" /> Salvando…</>
              : editando ? 'Salvar alterações' : 'Criar campanha'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">

        {/* Identidade */}
        <section className="flex flex-col gap-4">
          <div>
            <label htmlFor="camp-nome" className="flex items-center gap-2 mb-2">
              <IconeTom icon={Megaphone} tom="marca" tamanho="sm" />
              <Rotulo>Nome da campanha</Rotulo>
            </label>
            <input
              id="camp-nome"
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex.: Porto Velas"
              autoFocus
              className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                         text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="camp-produto" className="flex items-center gap-2 mb-2">
                <IconeTom icon={Package} tom="neutro" tamanho="sm" />
                <Rotulo>Produto</Rotulo>
              </label>
              <input
                id="camp-produto"
                type="text"
                value={produto}
                onChange={e => setProduto(e.target.value)}
                placeholder="Empreendimento"
                className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                           text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label htmlFor="camp-ticket" className="flex items-center gap-2 mb-2">
                <IconeTom icon={Wallet} tom="marca" tamanho="sm" />
                <Rotulo>Ticket médio</Rotulo>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-t3" aria-hidden>R$</span>
                <input
                  id="camp-ticket"
                  type="text"
                  inputMode="numeric"
                  value={ticket ? Number(ticket.replace(/\D/g, '')).toLocaleString('pt-BR') : ''}
                  onChange={e => setTicket(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full bg-s3/50 border border-line rounded-[14px] pl-10 pr-3.5 py-3 text-sm
                             text-t1 placeholder:text-t4 focus:outline-none focus:ring-2
                             focus:ring-brand/30 tabular-nums"
                />
              </div>
            </div>
          </div>

          {isAdmin && (
            <div>
              <label htmlFor="camp-dono" className="flex items-center gap-2 mb-2">
                <IconeTom icon={UserCircle2} tom="info" tamanho="sm" />
                <Rotulo>Responsável</Rotulo>
              </label>
              <select
                id="camp-dono"
                value={dono}
                onChange={e => setDono(e.target.value)}
                className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                           text-t1 focus:outline-none focus:ring-2 focus:ring-brand/30 appearance-none"
              >
                <option value="">Sem responsável</option>
                {allProfiles.filter(p => p.active).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-t4 mt-1.5">
                Administra a campanha. A fila em si é compartilhada por toda a equipe.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="camp-obs" className="block mb-2">
              <Rotulo>Abordagem</Rotulo>
            </label>
            <textarea
              id="camp-obs"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={2}
              placeholder="Argumento, o que oferecer, como abrir a conversa…"
              className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                         text-t1 placeholder:text-t4 focus:outline-none focus:ring-2
                         focus:ring-brand/30 resize-none"
            />
          </div>
        </section>

        {/* Ritmo */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-3.5 rounded-full bg-info" aria-hidden />
            <Repeat size={14} strokeWidth={1.6} className="text-t3" aria-hidden />
            <h3 className="font-label text-[11px] uppercase tracking-[0.14em] text-t3">Ritmo da fila</h3>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="camp-tent" className="flex items-center gap-2 mb-2">
                <Rotulo>Máximo de tentativas</Rotulo>
              </label>
              <input
                id="camp-tent"
                type="number" min={1} max={10}
                value={maxTent}
                onChange={e => setMaxTent(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                           text-t1 focus:outline-none focus:ring-2 focus:ring-brand/30 tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="camp-reserva" className="flex items-center gap-2 mb-2">
                <Timer size={12} strokeWidth={1.6} className="text-t4" aria-hidden />
                <Rotulo>Reserva (minutos)</Rotulo>
              </label>
              <input
                id="camp-reserva"
                type="number" min={5} max={60}
                value={reserva}
                onChange={e => setReserva(Math.max(5, Math.min(60, Number(e.target.value) || 15)))}
                className="w-full bg-s3/50 border border-line rounded-[14px] px-3.5 py-3 text-sm
                           text-t1 focus:outline-none focus:ring-2 focus:ring-brand/30 tabular-nums"
              />
            </div>
          </div>

          <div className="mt-3">
            <Dica tom="info">
              Entre tentativas: <span className="font-semibold">
                {descreveCadencia(campaign?.retryHours ?? CADENCIA_PADRAO)}
              </span>, sempre na janela útil. Depois da última, o lead encerra como não
              localizado. A reserva impede que dois corretores liguem para o mesmo número
              ao mesmo tempo.
            </Dica>
          </div>
        </section>

        {/* Listas — só na criação; depois, pelo botão da tela de detalhe */}
        {!editando && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1 h-3.5 rounded-full bg-brand" aria-hidden />
              <Database size={14} strokeWidth={1.6} className="text-t3" aria-hidden />
              <h3 className="font-label text-[11px] uppercase tracking-[0.14em] text-t3">
                Quem vai entrar na fila
              </h3>
            </div>

            {listasAtivas.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-[14px] border border-warning-line bg-warning-bg px-3.5 py-3">
                <AlertTriangle size={14} strokeWidth={1.6} className="text-warning shrink-0" aria-hidden />
                <p className="text-[13px] text-warning">
                  Nenhuma lista disponível. Cadastre uma em Base de Leads primeiro.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {listasAtivas.map(l => {
                  const sel = listasSel.has(l.id)
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggle(l.id)}
                      aria-pressed={sel}
                      className={`flex items-center gap-3 rounded-[14px] border p-3.5 text-left
                                  transition-all cursor-pointer min-h-[56px]
                                  focus:outline-none focus:ring-2 focus:ring-brand/30
                        ${sel
                          ? 'bg-brand-tint border-brand/40'
                          : 'bg-s3/30 border-line hover:border-line-strong'}`}
                    >
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2
                        ${sel ? 'bg-brand border-brand' : 'border-t5 bg-s3/50'}`} aria-hidden>
                        {sel && <Check size={11} strokeWidth={3} className="text-[var(--brand-btn-text)]" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-semibold truncate ${sel ? 'text-t1' : 'text-t2'}`}>
                          {l.name}
                        </p>
                        {l.description && <p className="text-[11px] text-t4 truncate">{l.description}</p>}
                      </div>
                      <span className="font-heading text-[13px] font-bold text-t3 tabular-nums shrink-0">
                        {l.totalCount.toLocaleString('pt-BR')}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {listasSel.size > 0 && (
              <div className="flex items-center gap-3 mt-3 rounded-[14px] border border-brand/25 bg-brand-tint px-3.5 py-3">
                <IconeTom icon={Users} tom="marca" tamanho="sm" />
                <p className="text-[13px] text-t2">
                  <span className="font-heading font-extrabold text-brand-text tabular-nums text-[15px]">
                    {totalSel.toLocaleString('pt-BR')}
                  </span>{' '}
                  contatos entram na fila. Telefones já marcados como inválidos são ignorados.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </SidePanel>
  )
}
