import { useState, useRef, useCallback, Ref, ReactNode } from 'react'
import { Download, AlertCircle, Image as ImageIcon, MessageSquareText, Plus, Trash2 } from 'lucide-react'
import { toPng } from 'html-to-image'
import toast from 'react-hot-toast'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Button } from '../../../components/ui/Button'
import { PagamentoBase, ReforcoAvulso, ReforcoModo, ReforcoPeriodo, SharedFields } from './types'
import { MESES_NOME, novoReforco, totalReforcos } from './reforcos'
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
          <ToggleModo<EntradaModo>
            valor={entradaModo}
            onChange={setEntradaModo}
            opcoes={[
              { modo: 'valor', label: 'R$ fixo' },
              { modo: 'pct',   label: '% do total' },
            ]}
          />
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
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-t3 text-xs font-medium">Reforço</p>
          <ToggleModo<ReforcoModo>
            valor={base.reforcoModo ?? 'periodico'}
            onChange={modo => {
              // Ao passar para individual pela primeira vez, a lista parte do
              // fluxo periódico já digitado: o corretor ajusta em vez de redigitar.
              if (modo === 'individual' && !(base.reforcosAvulsos?.length)) {
                onChange({ reforcoModo: modo, reforcosAvulsos: reforcosDoPeriodico(base) })
              } else {
                onChange({ reforcoModo: modo })
              }
            }}
            opcoes={[
              { modo: 'periodico',  label: 'Periódico' },
              { modo: 'individual', label: 'Individual' },
            ]}
          />
        </div>

        {base.reforcoModo === 'individual' ? (
          <ReforcosIndividuais
            lista={base.reforcosAvulsos ?? []}
            onLista={reforcosAvulsos => onChange({ reforcosAvulsos })}
            total={totalReforcos(base)}
          />
        ) : (
          <>
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
          </>
        )}
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

// ── Alternador de modo (Entrada R$/%, Reforço periódico/individual) ─────────

export function ToggleModo<T extends string>({ valor, onChange, opcoes }: {
  valor: T
  onChange: (m: T) => void
  opcoes: readonly { modo: T; label: string }[]
}) {
  return (
    <div className="flex rounded-lg border border-line overflow-hidden">
      {opcoes.map(({ modo, label }) => (
        <button
          key={modo}
          type="button"
          aria-pressed={valor === modo}
          onClick={() => onChange(modo)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            valor === modo
              ? 'bg-brand/15 text-brand'
              : 'bg-surface text-t3 hover:text-t1'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Reforços individuais: cada um com valor e mês/ano próprios ───────────────

/** Converte o fluxo periódico (N × valor, a cada 6 ou 12 meses) em lista editável. */
function reforcosDoPeriodico(base: PagamentoBase): ReforcoAvulso[] {
  if (base.reforcoQtd <= 0) return [novoReforco()]
  const passo = base.reforcoPeriodo === 'anual' ? 12 : 6
  const primeiro = novoReforco()
  const inicio = primeiro.ano * 12 + (primeiro.mes - 1) + (passo - 1)
  return Array.from({ length: Math.min(base.reforcoQtd, 60) }, (_, i) => {
    const idx = inicio + i * passo
    return { ...novoReforco(), valor: base.reforcoValor, mes: (idx % 12) + 1, ano: Math.floor(idx / 12) }
  })
}

export function ReforcosIndividuais({
  lista, onLista, total, nome = { singular: 'Reforço', plural: 'reforços' }, passoMeses = 6,
}: {
  lista: ReforcoAvulso[]
  onLista: (l: ReforcoAvulso[]) => void
  total: number
  /** "Reforço"/"reforços" no Pós-chaves e Direto; "Balão"/"balões" no Associativo */
  nome?: { singular: string; plural: string }
  /** intervalo sugerido ao adicionar um novo depois do último */
  passoMeses?: number
}) {
  const singularMin = nome.singular.toLowerCase()
  const anoAtual = new Date().getFullYear()
  const anos = Array.from({ length: 16 }, (_, i) => anoAtual + i)

  const atualizar = (id: string, patch: Partial<ReforcoAvulso>) =>
    onLista(lista.map(r => (r.id === id ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-3">
      {lista.length === 0 && (
        <p className="text-xs text-t4">Nenhum {singularMin}. Use o botão abaixo para adicionar.</p>
      )}

      {lista.map((r, i) => (
        <div key={r.id} className="rounded-[14px] border border-line bg-s2 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="font-label text-[11px] font-bold text-t3 uppercase tracking-[0.14em]">
              {nome.singular} {i + 1}
            </p>
            <button
              type="button"
              onClick={() => onLista(lista.filter(x => x.id !== r.id))}
              aria-label={`Remover ${singularMin} ${i + 1}`}
              title={`Remover ${singularMin}`}
              className="w-8 h-8 -mr-1 flex items-center justify-center rounded-lg text-t4 hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="grid grid-cols-[1fr_96px] sm:grid-cols-[1fr_96px_1.3fr] gap-3">
            <Select
              label="Mês"
              value={r.mes}
              onChange={e => atualizar(r.id, { mes: Number(e.target.value) })}
            >
              {MESES_NOME.map((nome, m) => (
                <option key={nome} value={m + 1}>{nome}</option>
              ))}
            </Select>
            <Select
              label="Ano"
              value={r.ano}
              onChange={e => atualizar(r.id, { ano: Number(e.target.value) })}
            >
              {(anos.includes(r.ano) ? anos : [r.ano, ...anos]).map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
            <div className="col-span-2 sm:col-span-1">
              <CurrencyInput
                label="Valor"
                value={r.valor}
                onChange={v => atualizar(r.id, { valor: v })}
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() => onLista([...lista, novoReforco(lista[lista.length - 1], passoMeses)])}
        className="w-full"
      >
        <Plus size={15} />
        Adicionar {singularMin}
      </Button>

      {lista.length > 0 && (
        <div className="flex items-center justify-between text-xs text-t3 px-1">
          <span>{lista.length} {lista.length === 1 ? singularMin : nome.plural}</span>
          <span>Total: <span className="font-semibold text-brand">{fmtBRL(total)}</span></span>
        </div>
      )}
    </div>
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
