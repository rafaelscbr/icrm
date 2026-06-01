import { useState, useEffect } from 'react'
import { Plus, Trash2, MessageSquare, Info, GripVertical, Check, Loader2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Campaign } from '../../types'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import toast from 'react-hot-toast'

interface EditMessagesModalProps {
  isOpen:   boolean
  onClose:  () => void
  campaign: Campaign
}

export function EditMessagesModal({ isOpen, onClose, campaign }: EditMessagesModalProps) {
  const { update } = useCampaignsStore()

  const [main,     setMain]     = useState('')
  const [extras,   setExtras]   = useState<string[]>([])
  const [saving,   setSaving]   = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  // Todas as mensagens em uma lista unificada para facilitar reordenação
  const all = [main, ...extras]

  useEffect(() => {
    if (!isOpen) return
    setMain(campaign.message ?? '')
    setExtras(campaign.messages ?? [])
    setSaving(false)
  }, [isOpen, campaign])

  function handleChange(index: number, value: string) {
    if (index === 0) {
      setMain(value)
    } else {
      setExtras(prev => prev.map((m, i) => i === index - 1 ? value : m))
    }
  }

  function handleAdd() {
    setExtras(prev => [...prev, ''])
    // Foca no novo textarea após render
    setTimeout(() => {
      const areas = document.querySelectorAll('[data-msg-textarea]')
      const last = areas[areas.length - 1] as HTMLTextAreaElement | null
      last?.focus()
    }, 50)
  }

  function handleRemove(index: number) {
    if (index === 0) return // não remove a principal
    setExtras(prev => prev.filter((_, i) => i !== index - 1))
  }

  // Drag-and-drop simples (exceto a Mensagem 1 que fica sempre na posição 0)
  function handleDragStart(index: number) {
    if (index === 0) return
    setDragging(index)
  }

  function handleDrop(targetIndex: number) {
    if (dragging === null || dragging === targetIndex || targetIndex === 0) {
      setDragging(null)
      setDragOver(null)
      return
    }
    const newAll = [...all]
    const [moved] = newAll.splice(dragging, 1)
    newAll.splice(targetIndex, 0, moved)
    setMain(newAll[0])
    setExtras(newAll.slice(1))
    setDragging(null)
    setDragOver(null)
  }

  async function handleSave() {
    if (!main.trim()) { toast.error('A Mensagem 1 é obrigatória'); return }
    setSaving(true)
    try {
      const cleanExtras = extras.filter(m => m.trim())
      update(campaign.id, {
        message:  main.trim(),
        messages: cleanExtras.length > 0 ? cleanExtras : undefined,
      })
      toast.success('Mensagens atualizadas!')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const totalCount = 1 + extras.filter(m => m.trim()).length
  const charWarning = (msg: string) => msg.length > 1000

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <p className="text-xs text-t4 hidden sm:block">
            <span className="font-semibold text-t2">{totalCount}</span> template{totalCount !== 1 ? 's' : ''} · o sistema rotaciona automaticamente
          </p>
          <div className="flex gap-2 ml-auto">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 size={13} className="animate-spin" /> Salvando…</> : <><Check size={13} /> Salvar mensagens</>}
            </Button>
          </div>
        </div>
      }
    >
      {/* Header do modal */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-2xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <MessageSquare size={20} className="text-green-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-t1 font-heading">Editar templates de mensagem</h2>
          <p className="text-xs text-t4 mt-0.5">{campaign.name}</p>
        </div>
      </div>

      {/* Aviso de rotação */}
      <div className="flex items-start gap-2 bg-brand/8 border border-brand/20 rounded-xl px-3 py-2.5 mb-5">
        <Info size={13} className="text-brand flex-shrink-0 mt-0.5" />
        <p className="text-xs text-brand/90 leading-relaxed">
          Use <code className="bg-s3/70 px-1.5 py-0.5 rounded text-[11px]">{'{nome}'}</code> para personalizar com o primeiro nome do lead.
          Ter múltiplos templates reduz o risco de bloqueio no WhatsApp.
        </p>
      </div>

      {/* Lista de mensagens */}
      <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
        {all.map((msg, index) => {
          const isMain  = index === 0
          const isDrag  = dragging === index
          const isOver  = dragOver === index && !isMain
          const warning = charWarning(msg)

          return (
            <div
              key={index}
              draggable={!isMain}
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => { e.preventDefault(); if (!isMain) setDragOver(index) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(index)}
              className={`relative rounded-2xl border transition-all duration-150
                ${isDrag ? 'opacity-40 scale-[0.98]' : ''}
                ${isOver ? 'border-brand/40 bg-brand/5 ring-1 ring-brand/20' : 'border-line bg-surface'}
              `}
            >
              {/* Header da mensagem */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  {/* Numeração colorida */}
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0
                    ${isMain ? 'bg-brand text-[#0F1730]' : 'bg-s3/70 text-t3'}`}>
                    {index + 1}
                  </div>
                  <span className="text-xs font-semibold text-t2">
                    {isMain ? 'Mensagem principal' : `Variação ${index}`}
                  </span>
                  {isMain && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand/15 text-brand font-medium">
                      Obrigatória
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {/* Contador de caracteres */}
                  <span className={`text-[10px] tabular-nums ${warning ? 'text-amber-400' : 'text-t5'}`}>
                    {msg.length}{warning ? ' ⚠️' : ''}
                  </span>
                  {/* Handle de drag (exceto msg principal) */}
                  {!isMain && (
                    <div className="cursor-grab active:cursor-grabbing text-t5 hover:text-t3 p-1 transition-colors">
                      <GripVertical size={14} />
                    </div>
                  )}
                  {/* Botão de remover (exceto msg principal) */}
                  {!isMain && (
                    <button
                      onClick={() => handleRemove(index)}
                      className="p-1 rounded-lg hover:bg-red-500/10 text-t5 hover:text-red-400 transition-colors cursor-pointer"
                      title="Remover esta variação"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Textarea */}
              <div className="px-4 pb-4">
                <textarea
                  data-msg-textarea
                  value={msg}
                  onChange={e => handleChange(index, e.target.value)}
                  rows={4}
                  placeholder={isMain
                    ? 'Olá, {nome}! Tudo bem? Sou corretor de imóveis e tenho uma oportunidade incrível…'
                    : `Oi, {nome}! Como vai? Separei uma opção especial pensando no seu perfil…`
                  }
                  className={`w-full bg-s2/50 rounded-xl px-3 py-3 text-sm text-t1 placeholder:text-t5
                    focus:outline-none focus:ring-2 resize-none transition-all leading-relaxed
                    ${isMain
                      ? 'border border-brand/25 focus:ring-brand/30'
                      : 'border border-line focus:ring-brand/25'
                    }`}
                />
                {warning && (
                  <p className="text-[11px] text-amber-400 mt-1.5">
                    Mensagens muito longas podem ser cortadas pelo WhatsApp.
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Botão adicionar variação */}
      <button
        onClick={handleAdd}
        className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-line hover:border-brand/40 hover:bg-brand/5 text-t4 hover:text-brand text-sm transition-all cursor-pointer group"
      >
        <Plus size={15} className="group-hover:scale-110 transition-transform" />
        Adicionar variação de mensagem
      </button>
    </Modal>
  )
}
