import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { LeadConfigEntry, LeadConfigType } from '../../types'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { useAuthStore } from '../../store/useAuthStore'
import { CampaignRoutingSettings } from './CampaignRoutingSettings'
import { SlaRodizioSettings } from './SlaRodizioSettings'
import { MetaConversoesSettings } from './MetaConversoesSettings'
import { CAMPO, Interruptor, SecaoConfig } from './SecaoConfig'
import toast from 'react-hot-toast'

/**
 * Leads › Configurações — refeita em 15/11/2026.
 *
 * Era uma página só, com cinco blocos empilhados e cada um num estilo: para
 * mexer no rodízio rolava-se por cima das listas, e para ver o retorno ao Meta
 * passava-se por todas as campanhas. Agora é uma seção por vez, escolhida no
 * menu ao lado (no celular, uma faixa no topo):
 *
 *   Rodízio          — prazo de 1º contato e agenda           (admin)
 *   Campanhas        — quem recebe os leads de cada formulário (admin)
 *   Retorno ao Meta  — eventos enviados à API de Conversões    (admin)
 *   Motivos e origens — as listas que o funil usa              (todos)
 *
 * Banco primeiro em tudo: nada muda na tela antes de o banco confirmar.
 */

type Secao = 'rodizio' | 'campanhas' | 'meta' | 'listas'

const SECOES: { value: Secao; label: string; nota: string; admin: boolean }[] = [
  { value: 'rodizio',   label: 'Rodízio',           nota: 'Prazo de 1º contato', admin: true  },
  { value: 'campanhas', label: 'Campanhas',         nota: 'Quem recebe os leads', admin: true  },
  { value: 'meta',      label: 'Retorno ao Meta',   nota: 'Eventos enviados',     admin: true  },
  { value: 'listas',    label: 'Motivos e origens', nota: 'Listas do funil',      admin: false },
]

export function LeadSettings() {
  const { isAdmin } = useAuthStore()
  const secoes = SECOES.filter(s => isAdmin || !s.admin)
  const [secao, setSecao] = useState<Secao>(secoes[0].value)
  const atual = secoes.some(s => s.value === secao) ? secao : secoes[0].value

  return (
    <div className="flex flex-col lg:flex-row gap-x-12 gap-y-5 pb-10">
      {secoes.length > 1 && (
        <nav aria-label="Seções das configurações" className="lg:w-[220px] lg:flex-shrink-0">
          <ul className="flex lg:flex-col gap-1 overflow-x-auto rolagem-limpa -mx-1 px-1 lg:mx-0 lg:px-0 lg:sticky lg:top-[84px]">
            {secoes.map(s => {
              const ativo = s.value === atual
              return (
                <li key={s.value} className="flex-shrink-0">
                  <button type="button" onClick={() => setSecao(s.value)} aria-current={ativo ? 'page' : undefined}
                    className={`w-full text-left rounded-[12px] px-3.5 py-2.5 min-h-[44px] cursor-pointer transition-colors
                                focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                                ${ativo ? 'bg-surface shadow-card text-t1' : 'text-t3 hover:text-t1 hover:bg-s2'}`}>
                    <span className="block text-[14px] font-semibold whitespace-nowrap">{s.label}</span>
                    <span className="hidden lg:block text-[12.5px] text-t4 mt-0.5">{s.nota}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      <div className="min-w-0 flex-1 max-w-[920px]">
        {atual === 'rodizio'   && <SlaRodizioSettings />}
        {atual === 'campanhas' && <CampaignRoutingSettings />}
        {atual === 'meta'      && <MetaConversoesSettings />}
        {atual === 'listas'    && <Listas />}
      </div>
    </div>
  )
}

// ─── Motivos de descarte e origens ────────────────────────────────────────────

function Listas() {
  const { load, dbAvailable, dbChecked, syncing } = useLeadConfigStore()
  const items = useLeadConfigStore(s => s.items)
  useEffect(() => { void load() }, [load])

  return (
    <SecaoConfig
      id="config-listas-titulo"
      titulo="Motivos e *origens*"
      descricao="As opções que aparecem ao descartar um lead e ao informar de onde ele veio. Desligar esconde a opção sem apagar o que já foi registrado."
    >
      {syncing && (
        <p className="flex items-center gap-2 text-[13px] text-t3 mb-4" role="status">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Lendo as listas do banco…
        </p>
      )}
      {dbChecked && !dbAvailable && (
        <div className="flex items-start gap-3 rounded-[14px] border border-error-line bg-error-bg px-4 py-3.5 mb-4" role="alert">
          <AlertTriangle size={16} strokeWidth={1.8} className="text-error flex-shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-error">Não foi possível ler as listas do banco</p>
            <p className="text-[13px] text-t2 mt-0.5">
              O que aparece abaixo é o padrão do sistema, e pode não ser o que está valendo. A edição fica bloqueada; recarregue a página para tentar de novo.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <ListaConfig
          type="discard_reason" titulo="Motivos de descarte" singular="motivo" exemplo="Ex.: Comprou com outro corretor"
          itens={items.filter(i => i.type === 'discard_reason')} podeEditar={dbAvailable}
          avisoRemover="Os leads já descartados com este motivo continuam com ele."
        />
        <ListaConfig
          type="origin" titulo="Origens de lead" singular="origem" exemplo="Ex.: Google Ads"
          itens={items.filter(i => i.type === 'origin')} podeEditar={dbAvailable}
          avisoRemover="Os leads que já têm esta origem continuam com ela."
        />
      </div>
    </SecaoConfig>
  )
}

function slugify(texto: string): string {
  return texto.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function ListaConfig({ type, titulo, singular, exemplo, itens, podeEditar, avisoRemover }: {
  type: LeadConfigType
  titulo: string
  singular: string
  exemplo: string
  itens: LeadConfigEntry[]
  podeEditar: boolean
  avisoRemover: string
}) {
  const { add, update, remove } = useLeadConfigStore()
  const [editId, setEditId] = useState<string | null>(null)
  const [delId, setDelId] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Ativos primeiro, na ordem configurada; os desligados ficam no fim, apagados.
  const linhas = [...itens].sort((a, b) => Number(b.active) - Number(a.active) || a.displayOrder - b.displayOrder)
  const ativos = itens.filter(i => i.active).length

  async function comOcupado(id: string, fn: () => Promise<void>) {
    setOcupado(id)
    try { await fn() } catch { /* erro já avisado pelo store */ } finally { setOcupado(null) }
  }

  const adicionar = (label: string, emoji: string) => comOcupado('novo', async () => {
    let slug = slugify(label)
    if (!slug) { toast.error('Use ao menos uma letra ou número no nome'); return }
    while (itens.some(i => i.slug === slug)) slug += '_2'
    await add(type, { slug, label, emoji: emoji || undefined, color: undefined })
    setNovo(false)
    toast.success(`${singular[0].toUpperCase()}${singular.slice(1)} adicionad${singular === 'origem' ? 'a' : 'o'}`)
  })

  const salvar = (item: LeadConfigEntry, label: string, emoji: string) => comOcupado(item.id, async () => {
    await update(item.id, { label, emoji: emoji || undefined })
    setEditId(null)
    toast.success('Alteração salva')
  })

  const alternar = (item: LeadConfigEntry) => comOcupado(item.id, async () => {
    await update(item.id, { active: !item.active })
  })

  const apagar = (item: LeadConfigEntry) => comOcupado(item.id, async () => {
    await remove(item.id)
    setDelId(null)
    toast.success(`“${item.label}” removido`)
  })

  return (
    <div className="bento overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3">
        <h4 className="text-[15px] font-semibold text-t1">{titulo}</h4>
        <span className="text-[12.5px] text-t4 tabular-nums">{ativos} {ativos === 1 ? 'ativo' : 'ativos'}</span>
      </div>

      <ul className="divide-y divide-line border-t border-line">
        {linhas.map(item => (
          <li key={item.id}>
            {editId === item.id ? (
              <FormLinha inicial={item} exemplo={exemplo} salvando={ocupado === item.id}
                onSalvar={(l, e) => void salvar(item, l, e)} onCancelar={() => setEditId(null)} />
            ) : delId === item.id ? (
              <div className="px-5 py-3" role="alertdialog" aria-label={`Remover ${item.label}`}>
                <p className="text-[14px] text-t1">Remover <strong className="font-semibold">{item.label}</strong>?</p>
                <p className="text-[12.5px] text-t3 mt-0.5">{avisoRemover}</p>
                <div className="flex items-center gap-2 mt-3">
                  <button type="button" onClick={() => void apagar(item)} disabled={ocupado === item.id}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-error text-white text-[13.5px] font-semibold cursor-pointer disabled:opacity-50">
                    {ocupado === item.id && <Loader2 size={13} className="animate-spin" aria-hidden />} Remover
                  </button>
                  <button type="button" onClick={() => setDelId(null)}
                    className="h-9 px-3.5 rounded-[10px] text-[13.5px] font-medium text-t2 hover:bg-s2 cursor-pointer">
                    Manter
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 pl-5 pr-3 min-h-[52px]">
                <span className={`w-6 text-center text-[16px] flex-shrink-0 ${item.active ? '' : 'opacity-40'}`} aria-hidden>{item.emoji || '·'}</span>
                <span className={`min-w-0 flex-1 text-[14.5px] truncate ${item.active ? 'text-t1' : 'text-t4'}`}>{item.label}</span>
                {podeEditar && (
                  <>
                    <Interruptor
                      ligado={item.active} onChange={() => void alternar(item)} carregando={ocupado === item.id}
                      rotulo={`${item.label}: ${item.active ? 'aparece nas opções. Desligar' : 'escondido. Ligar'}`}
                    />
                    <button type="button" onClick={() => { setEditId(item.id); setNovo(false); setDelId(null) }}
                      className="folha-icone" aria-label={`Editar ${item.label}`} title="Editar">
                      <Pencil size={15} strokeWidth={1.8} aria-hidden />
                    </button>
                    <button type="button" onClick={() => { setDelId(item.id); setEditId(null) }}
                      className="folha-icone hover:!text-error" aria-label={`Remover ${item.label}`} title="Remover">
                      <Trash2 size={15} strokeWidth={1.8} aria-hidden />
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
        {linhas.length === 0 && (
          <li className="px-5 py-6 text-[14px] text-t3">Nenhum{singular === 'origem' ? 'a' : ''} {singular} cadastrad{singular === 'origem' ? 'a' : 'o'}.</li>
        )}
      </ul>

      {podeEditar && (
        <div className="border-t border-line">
          {novo ? (
            <FormLinha exemplo={exemplo} salvando={ocupado === 'novo'}
              onSalvar={(l, e) => void adicionar(l, e)} onCancelar={() => setNovo(false)} />
          ) : (
            <button type="button" onClick={() => { setNovo(true); setEditId(null); setDelId(null) }}
              className="w-full flex items-center gap-2 px-5 h-12 text-[14px] font-medium text-t2 hover:text-t1 hover:bg-s2 cursor-pointer
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40">
              <Plus size={16} strokeWidth={2} aria-hidden /> Adicionar {singular}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Edição na própria linha: emoji, nome, salvar. Enter salva, Esc cancela. */
function FormLinha({ inicial, exemplo, salvando, onSalvar, onCancelar }: {
  inicial?: LeadConfigEntry
  exemplo: string
  salvando: boolean
  onSalvar: (label: string, emoji: string) => void
  onCancelar: () => void
}) {
  const [label, setLabel] = useState(inicial?.label ?? '')
  const [emoji, setEmoji] = useState(inicial?.emoji ?? '')
  const pronto = label.trim().length > 0

  function enviar() {
    if (!pronto) { toast.error('Dê um nome'); return }
    onSalvar(label.trim(), emoji.trim())
  }

  return (
    <form
      className="flex items-center gap-2 flex-wrap px-5 py-2.5"
      onSubmit={e => { e.preventDefault(); enviar() }}
      onKeyDown={e => { if (e.key === 'Escape') onCancelar() }}
    >
      <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={4} placeholder="🙂"
        aria-label="Emoji (opcional)" className={`${CAMPO} w-12 px-0 text-center text-[16px]`} />
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- o campo abre por um clique em "Editar"/"Adicionar"; o foco segue a intenção */}
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder={exemplo} autoFocus
        aria-label="Nome" className={`${CAMPO} flex-1 min-w-[160px]`} />
      <button type="submit" disabled={salvando || !pronto}
        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover
                   text-[13.5px] font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed">
        {salvando && <Loader2 size={13} className="animate-spin" aria-hidden />}
        {salvando ? 'Salvando…' : inicial ? 'Salvar' : 'Adicionar'}
      </button>
      <button type="button" onClick={onCancelar}
        className="h-10 px-3 rounded-[10px] text-[13.5px] font-medium text-t2 hover:bg-s2 cursor-pointer">
        Cancelar
      </button>
    </form>
  )
}
