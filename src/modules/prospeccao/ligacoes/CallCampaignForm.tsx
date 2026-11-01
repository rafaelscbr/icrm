import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check } from 'lucide-react'
import { SidePanel } from '../../../components/ui/SidePanel'
import { Button } from '../../../components/ui/Button'
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
 *
 * v10 "folha limpa" (01/11/2026): o nome é o título; produto, ticket e
 * abordagem logo abaixo; listas numa lista de marcar. Ritmo da fila e
 * responsável têm padrão bom e ficam em "Ritmo e responsável".
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
  const [erroNome,  setErroNome]  = useState('')
  const [ritmo,     setRitmo]     = useState(false)

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
    setErroNome('')
    setRitmo(false)
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

  async function handleSalvar(e?: FormEvent) {
    e?.preventDefault()
    if (salvando) return
    if (!nome.trim()) { setErroNome('Dê um nome à campanha'); return }
    setErroNome('')
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

  const sujo = !editando && Boolean(nome.trim() || produto.trim() || ticket || descricao.trim() || listasSel.size)

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={editando ? 'Editar campanha' : 'Nova campanha de ligação'}
      size="md"
      confirmarSaida={sujo && !salvando}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-t4 tabular-nums">
            {!editando && listasSel.size > 0 ? `${totalSel.toLocaleString('pt-BR')} contatos na fila` : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" form="form-campanha-ligacao" carregando={salvando}>
              {editando ? 'Salvar alterações' : 'Criar campanha'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="form-campanha-ligacao" onSubmit={handleSalvar} className="flex flex-col gap-6">

        {/* Nome — o título */}
        <div>
          <input
            id="camp-nome"
            type="text"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Nome da campanha"
            aria-label="Nome da campanha"
            aria-invalid={erroNome ? true : undefined}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- o painel abre para criar: o cursor vai para o nome
            autoFocus={!editando}
            className="campo-titulo campo-livre"
          />
          {erroNome
            ? <p className="text-xs text-error mt-0.5" role="alert">{erroNome}</p>
            : <p className="text-[13px] text-t4 mt-0.5">Ex.: Porto Velas · proprietários</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="camp-produto" className="rotulo-campo">Produto</label>
            <input
              id="camp-produto"
              type="text"
              value={produto}
              onChange={e => setProduto(e.target.value)}
              placeholder="Empreendimento"
              className="w-full px-3.5 py-2.5 min-h-[44px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="camp-ticket" className="rotulo-campo">Ticket médio</label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-[13px] text-t4 select-none" aria-hidden>R$</span>
              <input
                id="camp-ticket"
                type="text"
                inputMode="numeric"
                value={ticket ? Number(ticket.replace(/\D/g, '')).toLocaleString('pt-BR') : ''}
                onChange={e => setTicket(e.target.value.replace(/\D/g, ''))}
                placeholder="500.000"
                className="w-full pl-10 pr-4 py-2.5 min-h-[44px] tabular-nums"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="camp-obs" className="rotulo-campo">Abordagem</label>
          <textarea
            id="camp-obs"
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            rows={2}
            placeholder="Argumento, o que oferecer, como abrir a conversa…"
            className="w-full px-3.5 py-2.5 resize-none"
          />
        </div>

        {/* Listas — só na criação; depois, pelo botão da tela de detalhe */}
        {!editando && (
          <div className="flex flex-col gap-2">
            <span className="rotulo-campo">Quem entra na fila</span>
            {listasAtivas.length === 0 ? (
              <p className="text-[13px] text-t4">
                Nenhuma lista ainda. Cadastre uma em Base de Leads — dá para ligar listas depois.
              </p>
            ) : (
              <div role="group" aria-label="Listas da campanha"
                   className="rounded-[12px] bg-s2 max-h-[38vh] overflow-y-auto">
                {listasAtivas.map(l => {
                  const sel = listasSel.has(l.id)
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="checkbox"
                      aria-checked={sel}
                      onClick={() => toggle(l.id)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] text-left transition-colors
                                 hover:bg-s3/60 cursor-pointer focus:outline-none focus-visible:bg-s3/60"
                    >
                      <span className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0 transition-colors
                                        ${sel ? 'bg-brand-fill text-brand-fill-text' : 'border-[1.5px] border-line-strong'}`}>
                        {sel && <Check size={12} strokeWidth={3} aria-hidden />}
                      </span>
                      <span className={`flex-1 min-w-0 truncate text-[14px] ${sel ? 'text-t1 font-medium' : 'text-t2'}`}>
                        {l.name}
                      </span>
                      <span className="text-[13px] text-t4 tabular-nums shrink-0">
                        {l.totalCount.toLocaleString('pt-BR')}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {listasSel.size > 0 && (
              <p className="text-[12px] text-t4">Telefones já marcados como inválidos ficam de fora.</p>
            )}
          </div>
        )}

        {/* Ritmo e responsável — padrão bom, recolhido */}
        {ritmo ? (
          <div className="flex flex-col gap-5 animate-in fade-in duration-150">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="camp-tent" className="rotulo-campo">Máximo de tentativas</label>
                <input
                  id="camp-tent"
                  type="number" min={1} max={10}
                  value={maxTent}
                  onChange={e => setMaxTent(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  className="w-full px-3.5 py-2.5 min-h-[44px] tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="camp-reserva" className="rotulo-campo">Reserva (minutos)</label>
                <input
                  id="camp-reserva"
                  type="number" min={5} max={60}
                  value={reserva}
                  onChange={e => setReserva(Math.max(5, Math.min(60, Number(e.target.value) || 15)))}
                  className="w-full px-3.5 py-2.5 min-h-[44px] tabular-nums"
                />
              </div>
            </div>
            <p className="text-[12.5px] text-t4 -mt-2 leading-relaxed">
              Entre tentativas: {descreveCadencia(campaign?.retryHours ?? CADENCIA_PADRAO)}, sempre na
              janela útil. Depois da última, o lead encerra como não localizado. A reserva impede que
              dois corretores liguem para o mesmo número ao mesmo tempo.
            </p>

            {isAdmin && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="camp-dono" className="rotulo-campo">Responsável</label>
                <select
                  id="camp-dono"
                  value={dono}
                  onChange={e => setDono(e.target.value)}
                  className="campo w-full"
                >
                  <option value="">Sem responsável</option>
                  {allProfiles.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="text-[12px] text-t4">Administra a campanha. A fila é da equipe toda.</p>
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setRitmo(true)}
            className="self-start text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer">
            + Ritmo e responsável
            <span className="text-t4 font-normal"> · {maxTent} tentativas, reserva {reserva} min</span>
          </button>
        )}
      </form>
    </SidePanel>
  )
}
