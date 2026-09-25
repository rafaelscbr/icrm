import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Copy, Check, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../../../components/ui/Button'
import { useRovingTabs } from '../../../components/shared/Abas'
import { formatPhone, whatsappUrl, whatsappTextoUrl } from '../../../lib/formatters'

/**
 * Mensagem de WhatsApp do simulador — o fluxo em texto, pronto para mandar.
 *
 * A imagem é o que o cliente guarda; o texto é o que ele lê na notificação e
 * responde. Os dois saem dos mesmos números, na mesma hora: não existe
 * "atualizar o texto", ele acompanha o formulário como a imagem acompanha.
 */

// ── Alternador de visão (Imagem / Texto) ─────────────────────────────────────

export interface OpcaoVisao<T extends string> { value: T; label: string; icon: LucideIcon }

/**
 * Neutro de propósito: o ouro da tela já está nas abas de modo, no topo. Dois
 * conjuntos dourados lado a lado deixariam de dizer qual é o principal.
 */
export function AlternadorVisao<T extends string>({ opcoes, valor, onChange, rotulo }: {
  opcoes: OpcaoVisao<T>[]
  valor: T
  onChange: (v: T) => void
  rotulo: string
}) {
  const aba = useRovingTabs(opcoes.map(o => o.value), valor, onChange)
  return (
    <div role="tablist" aria-label={rotulo} className="flex rounded-[12px] border border-line bg-s2/60 p-0.5">
      {opcoes.map((o, i) => {
        const ativo = o.value === valor
        return (
          <button
            key={o.value}
            type="button"
            {...aba(i)}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 px-3 min-h-[36px] rounded-[10px] text-xs font-semibold transition-all
              focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
              ${ativo ? 'bg-surface text-t1 shadow-card' : 'text-t3 hover:text-t1'}`}
          >
            <o.icon size={13} strokeWidth={1.6} aria-hidden />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Balão com a formatação do WhatsApp ───────────────────────────────────────

/** *negrito* e _itálico_, como o WhatsApp mostra. Sem aninhamento — não usamos. */
function formatarLinha(linha: string): ReactNode[] {
  const partes = linha.split(/(\*[^*\n]+\*|_[^_\n]+_)/g)
  return partes.map((p, i) => {
    if (p.length > 2 && p.startsWith('*') && p.endsWith('*')) return <strong key={i} className="font-semibold text-t1">{p.slice(1, -1)}</strong>
    if (p.length > 2 && p.startsWith('_') && p.endsWith('_')) return <em key={i} className="text-t3">{p.slice(1, -1)}</em>
    return p
  })
}

export function BalaoMensagem({ texto }: { texto: string }) {
  return (
    <div className="w-full rounded-[14px] border border-line surface-premium shadow-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-line">
        <MessageCircle size={14} strokeWidth={1.6} className="text-success" aria-hidden />
        <span className="font-label text-[11px] uppercase tracking-[0.14em] text-t3">Mensagem pronta</span>
        <span className="ml-auto text-[11px] text-t4">acompanha o formulário</span>
      </div>
      {/* Mesmo texto que vai para o WhatsApp, com a formatação que ele aplica.
          Rola por dentro para a coluna não ficar mais alta que a tela. */}
      <div className="px-4 py-3.5 max-h-[60vh] overflow-y-auto text-[14px] leading-relaxed text-t2 whitespace-pre-wrap break-words">
        {texto.split('\n').map((linha, i) => (
          <div key={i} className={linha === '' ? 'h-3' : ''}>{formatarLinha(linha)}</div>
        ))}
      </div>
    </div>
  )
}

// ── Ações: copiar e abrir no WhatsApp ────────────────────────────────────────

/** Telefone só vale com DDD + número (10 ou 11 dígitos, com ou sem 55). */
export function telefoneValido(telefone: string): boolean {
  const d = telefone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  return d.length === 10 || d.length === 11
}

export function useAcoesMensagem(texto: string, telefone: string) {
  const [copiado, setCopiado] = useState(false)
  const comNumero = telefoneValido(telefone)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
      toast.success('Texto copiado — é só colar na conversa')
    } catch {
      // Sem permissão de área de transferência (navegador antigo, http).
      // O texto está na tela: dá para selecionar e copiar à mão.
      toast.error('Não foi possível copiar. Selecione o texto na aba Texto e copie manualmente.')
    }
  }

  function abrir() {
    window.open(comNumero ? whatsappUrl(telefone, texto) : whatsappTextoUrl(texto), '_blank', 'noopener')
  }

  return { copiado, comNumero, copiar, abrir }
}

export function BotaoCopiar({ copiado, onClick, disabled, destaque = false }: {
  copiado: boolean; onClick: () => void; disabled?: boolean; destaque?: boolean
}) {
  return (
    <Button variant="secondary" size={destaque ? 'lg' : 'md'} onClick={onClick} disabled={disabled} className="w-full">
      {copiado ? <Check size={15} strokeWidth={2} className="text-success" aria-hidden /> : <Copy size={15} strokeWidth={1.6} aria-hidden />}
      {copiado ? 'Copiado' : 'Copiar texto'}
    </Button>
  )
}

export function BotaoWhatsApp({ comNumero, telefone, onClick, disabled, destaque = false }: {
  comNumero: boolean; telefone: string; onClick: () => void; disabled?: boolean; destaque?: boolean
}) {
  return (
    <Button
      variant="success"
      size={destaque ? 'lg' : 'md'}
      onClick={onClick}
      disabled={disabled}
      className="w-full"
      title={comNumero
        ? `Abre a conversa com ${formatPhone(telefone)} com o texto pronto — você revisa e envia`
        : 'Sem o número do cliente: o WhatsApp abre e pede para escolher a conversa'}
    >
      <MessageCircle size={15} strokeWidth={1.6} aria-hidden />
      {comNumero ? 'Enviar no WhatsApp' : 'Escolher conversa no WhatsApp'}
    </Button>
  )
}
