import { useState, useRef, useCallback, Ref, ReactNode } from 'react'
import { Download, AlertCircle, Image as ImageIcon, MessageSquareText } from 'lucide-react'
import { toPng } from 'html-to-image'
import toast from 'react-hot-toast'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Button } from '../../../components/ui/Button'
import { PagamentoBase, ReforcoPeriodo, SharedFields } from './types'
import {
  AlternadorVisao, BalaoMensagem, BotaoCopiar, BotaoWhatsApp, useAcoesMensagem, telefoneValido,
} from './MensagemWhatsApp'

// ── Formatação ────────────────────────────────────────────────────────────────

export function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

// ── Átomos de formulário ──────────────────────────────────────────────────────

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl border border-line p-5 space-y-4">
      <h2 className="text-t3 text-xs font-semibold uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  )
}

// Input monetário com máscara R$ — digita só números, formata como centavos.
// Ex: digitar "758458461" exibe "R$ 758.584,61" e entrega 758584.61.
export function CurrencyInput({ label, value, onChange, disabled }: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const display = value
    ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : ''

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '')
    onChange(digits ? parseInt(digits, 10) / 100 : 0)
  }

  return (
    <Input
      label={label}
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      placeholder="R$ 0,00"
      disabled={disabled}
    />
  )
}

export function DerivedBox({ label, value, accent = false, icon }: {
  label: string; value: string; accent?: boolean; icon?: ReactNode
}) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${accent ? 'bg-brand/10 border-brand/25' : 'bg-s2 border-line'}`}>
      <p className="text-t3 text-xs mb-1 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className={`font-bold text-sm ${accent ? 'text-brand' : 'text-t1'}`}>{value}</p>
    </div>
  )
}

// ── Seção de identificação (compartilhada entre modos) ────────────────────────

/** Máscara progressiva: "47999" → "(47) 999", até "(47) 99999-9999". */
export function mascaraTelefone(digitos: string): string {
  const d = digitos.slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function IdentificacaoSection({ shared, onShared }: {
  shared: SharedFields
  onShared: (patch: Partial<SharedFields>) => void
}) {
  const incompleto = shared.telefone.length > 0 && !telefoneValido(shared.telefone)
  return (
    <Section title="Identificação">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Input
            label="Empreendimento / Unidade"
            value={shared.empreendimento}
            onChange={e => onShared({ empreendimento: e.target.value })}
            placeholder="Ex: Porto Velas 3D"
          />
        </div>
        <Input
          label="Nome do cliente (opcional)"
          value={shared.cliente}
          onChange={e => onShared({ cliente: e.target.value })}
          placeholder="Ex: João da Silva"
          autoComplete="off"
        />
        <Input
          label="WhatsApp do cliente (opcional)"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={mascaraTelefone(shared.telefone)}
          onChange={e => {
            // Colar "+55 47 9..." também funciona: o 55 do país sai antes da máscara.
            let d = e.target.value.replace(/\D/g, '')
            if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
            onShared({ telefone: d.slice(0, 11) })
          }}
          placeholder="(47) 99999-9999"
          error={incompleto ? 'Faltam dígitos: DDD + número' : undefined}
          hint="Com o número, o botão abre a conversa do cliente direto"
        />
      </div>
    </Section>
  )
}

// ── Seção de pagamento (entrada + reforço + parcelas) — idêntica entre modos ──

export type EntradaModo = 'valor' | 'pct'

interface PagamentoSectionProps {
  title: string
  base: PagamentoBase
  onChange: (patch: Partial<PagamentoBase>) => void
  valorTotal: number
  entradaModo: EntradaModo
  setEntradaModo: (m: EntradaModo) => void
  entradaPct: number
  setEntradaPct: (v: number) => void
  entradaValorEfetivo: number
  parcelaValor: number
  valido: boolean
  erro?: string
}

export function PagamentoSection({
  title, base, onChange, valorTotal,
  entradaModo, setEntradaModo, entradaPct, setEntradaPct, entradaValorEfetivo,
  parcelaValor, valido, erro,
}: PagamentoSectionProps) {
  const num = (field: keyof PagamentoBase) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    onChange({ [field]: isNaN(v) ? 0 : v })
  }

  return (
    <Section title={title}>

      {/* Entrada */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-t3 text-xs font-medium">Entrada</p>
          {/* Toggle R$ fixo / % do total */}
          <div className="flex rounded-lg border border-line overflow-hidden">
            {([
              { modo: 'valor', label: 'R$ fixo' },
              { modo: 'pct',   label: '% do total' },
            ] as const).map(({ modo, label }) => (
              <button
                key={modo}
                type="button"
                onClick={() => setEntradaModo(modo)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  entradaModo === modo
                    ? 'bg-brand/15 text-brand'
                    : 'bg-surface text-t3 hover:text-t1'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Input
            label="Quantidade"
            type="number"
            step="1"
            min="1"
            value={base.entradaQtd || ''}
            onChange={num('entradaQtd')}
          />
          {entradaModo === 'valor' ? (
            <CurrencyInput
              label="Valor por entrada"
              value={base.entradaValor}
              onChange={v => onChange({ entradaValor: v })}
            />
          ) : (
            <Input
              label="Porcentagem do valor total (%)"
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={entradaPct || ''}
              onChange={e => {
                const v = parseFloat(e.target.value)
                setEntradaPct(isNaN(v) ? 0 : v)
              }}
            />
          )}
        </div>
        {entradaModo === 'pct' && (
          <div className="mt-2 flex items-center gap-2 text-xs text-t3">
            <span>{entradaPct}% de {fmtBRL(valorTotal)} =</span>
            <span className="font-semibold text-brand">{fmtBRL(entradaValorEfetivo)}</span>
            {base.entradaQtd > 1 && <span>por entrada</span>}
          </div>
        )}
      </div>

      <div className="w-full h-px bg-line" />

      {/* Reforço */}
      <div>
        <p className="text-t3 text-xs font-medium mb-2.5">Reforço</p>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Input
            label="Quantidade"
            type="number"
            step="1"
            min="0"
            value={base.reforcoQtd}
            onChange={num('reforcoQtd')}
          />
          <CurrencyInput
            label="Valor por reforço"
            value={base.reforcoValor}
            onChange={v => onChange({ reforcoValor: v })}
            disabled={base.reforcoQtd === 0}
          />
        </div>
        <div className="mt-3">
          <Select
            label="Periodicidade do reforço"
            value={base.reforcoPeriodo}
            onChange={e => onChange({ reforcoPeriodo: e.target.value as ReforcoPeriodo })}
            disabled={base.reforcoQtd === 0}
          >
            <option value="semestral">Semestral</option>
            <option value="anual">Anual</option>
          </Select>
        </div>
      </div>

      <div className="w-full h-px bg-line" />

      {/* Parcelas */}
      <div>
        <p className="text-t3 text-xs font-medium mb-2.5">Parcelas mensais</p>
        <div className="grid grid-cols-[110px_1fr] gap-3 items-start">
          <Input
            label="Quantidade"
            type="number"
            step="1"
            min="1"
            value={base.parcelasQtd || ''}
            onChange={num('parcelasQtd')}
          />
          <div className="flex flex-col gap-1.5">
            {/* Não é campo: é um valor derivado, só de leitura. `label` prometia
                um controle que não existe. */}
            <p className="text-xs font-medium text-t2">Valor calculado</p>
            <div className={`w-full rounded-lg px-3 py-2.5 min-h-[42px] text-sm flex items-center justify-between border transition-all ${
              valido
                ? 'bg-success-bg border-success-line text-success'
                : 'bg-s2 border-line text-t3'
            }`}>
              <span className="font-bold text-base tracking-tight">
                {valido ? fmtBRL(parcelaValor) : '—'}
              </span>
              <span className="text-xs opacity-60 ml-2">por mês</span>
            </div>
          </div>
        </div>
      </div>

      {/* Aviso de erro */}
      {!valido && erro && (
        <div className="flex items-center gap-2.5 text-sm rounded-xl px-4 py-3 bg-warning-bg border border-warning-line text-warning">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}
    </Section>
  )
}

// ── Coluna de preview + export (compartilhada entre modos) ────────────────────

type VisaoPreview = 'imagem' | 'texto'

/**
 * A proposta sai de duas formas, dos mesmos números: a IMAGEM, que o cliente
 * guarda, e o TEXTO, que ele lê na notificação. A coluna mostra uma de cada
 * vez — as duas juntas passariam da altura da tela e a coluna fixa deixaria
 * os botões fora de alcance —, mas copiar e abrir o WhatsApp ficam a um toque
 * nas duas visões.
 */
export function PreviewColumn({ valido, slugBase, renderCard, mensagem, telefone }: {
  valido: boolean
  slugBase: string
  renderCard: (ref: Ref<HTMLDivElement>) => ReactNode
  mensagem: string
  telefone: string
}) {
  const [visao, setVisao] = useState<VisaoPreview>('imagem')
  const [exporting, setExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const acoes = useAcoesMensagem(mensagem, telefone)

  const handleExport = useCallback(async () => {
    if (!cardRef.current || !valido) return
    setExporting(true)
    try {
      const slug = slugBase.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-') || 'simulacao'
      const url  = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true })
      const a    = document.createElement('a')
      a.download = `fluxo-${slug}.png`
      a.href = url
      a.click()
      toast.success('Proposta baixada com sucesso!')
    } catch {
      toast.error('Erro ao gerar imagem. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }, [valido, slugBase])

  return (
    <div className="flex flex-col items-center gap-4 xl:sticky xl:top-6">
      <div className="flex items-center justify-between gap-3 w-full">
        <p className="text-t3 text-xs uppercase tracking-widest">Proposta</p>
        <AlternadorVisao
          rotulo="Formato da proposta"
          valor={visao}
          onChange={setVisao}
          opcoes={[
            { value: 'imagem', label: 'Imagem', icon: ImageIcon },
            { value: 'texto',  label: 'Texto WhatsApp', icon: MessageSquareText },
          ]}
        />
      </div>

      {visao === 'imagem' ? (
        <div className="flex justify-center">
          {renderCard(cardRef)}
        </div>
      ) : valido ? (
        <BalaoMensagem texto={mensagem} />
      ) : (
        <SemMensagem />
      )}

      {visao === 'imagem' ? (
        <>
          <Button
            variant="primary"
            size="lg"
            onClick={handleExport}
            disabled={!valido || exporting}
            className="w-full"
          >
            <Download size={16} />
            {exporting ? 'Gerando imagem…' : 'Baixar proposta (PNG)'}
          </Button>
          <div className="grid grid-cols-2 gap-2 w-full">
            <BotaoCopiar copiado={acoes.copiado} onClick={acoes.copiar} disabled={!valido} />
            <BotaoWhatsApp comNumero={acoes.comNumero} telefone={telefone} onClick={acoes.abrir} disabled={!valido} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
          <BotaoWhatsApp comNumero={acoes.comNumero} telefone={telefone} onClick={acoes.abrir} disabled={!valido} destaque />
          <BotaoCopiar copiado={acoes.copiado} onClick={acoes.copiar} disabled={!valido} destaque />
        </div>
      )}

      <p className="text-t4 text-xs text-center leading-relaxed">
        O WhatsApp abre com o texto na caixa de mensagem — você revisa e envia.
        Para mandar a imagem junto, baixe o PNG e anexe na mesma conversa.
      </p>
    </div>
  )
}

/** Enquanto a conta não fecha, não há mensagem — mandar número errado é pior que não mandar. */
export function SemMensagem() {
  return (
    <div className="w-full flex items-center gap-2.5 text-sm rounded-[14px] px-4 py-6 bg-s2 border border-line text-t3">
      <AlertCircle size={15} className="flex-shrink-0" aria-hidden />
      <span>Ajuste os valores do formulário: a mensagem aparece assim que a conta fechar.</span>
    </div>
  )
}
