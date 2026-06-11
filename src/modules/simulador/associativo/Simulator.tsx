import { useState, useRef, useCallback } from 'react'
import { Download, AlertCircle, TrendingDown, Info } from 'lucide-react'
import { toPng } from 'html-to-image'
import toast from 'react-hot-toast'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Button } from '../../../components/ui/Button'
import { SharedFields } from '../shared/types'
import { Section, CurrencyInput, DerivedBox, IdentificacaoSection, fmtBRL } from '../shared/components'
import {
  calcularAssociativo, AssociativoInput, Indice, Sistema, MesAno,
  INDICE_LABELS, mesAnoLabel,
} from './calc'
import { AssociativoCard } from './Card'
import { AssociativoCardCompleto } from './CardCompleto'

// Modo Associativo: composição do pagamento na obra (entrada + parcelas +
// balões anuais), linha do tempo com assinatura do financiamento e entrega,
// taxa de obra evolutiva e financiamento estimado na entrega.

type BlocoModo = 'valor' | 'pct'

/** "YYYY-MM" do mês atual + delta meses */
function mesAnoDaqui(deltaMeses: number): MesAno {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + deltaMeses)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface Cfg {
  entradaQtd: number; entradaModo: BlocoModo; entradaValor: number; entradaPct: number
  parcelasQtd: number; parcelasModo: BlocoModo; parcelaValor: number; parcelasPct: number
  balaoQtd: number; balaoModo: BlocoModo; balaoValor: number; balaoPct: number
  indice: Indice; taxaIndiceAnual: number; aplicarCorrecao: boolean
  inicioParcelas: MesAno; financiamento: MesAno; entrega: MesAno
  jurosObraMensal: number; taxaAdm: number; seguro: number; pctObraAssinatura: number
  taxaBancoAnual: number; prazoMeses: number; sistema: Sistema
}

const DEFAULT: Cfg = {
  entradaQtd: 1,  entradaModo: 'pct',  entradaValor: 0, entradaPct: 12,
  parcelasQtd: 36, parcelasModo: 'pct', parcelaValor: 0, parcelasPct: 8,
  balaoQtd: 3,    balaoModo: 'pct',    balaoValor: 0,  balaoPct: 5,
  indice: 'incc', taxaIndiceAnual: 5, aplicarCorrecao: true,
  inicioParcelas: mesAnoDaqui(1), financiamento: mesAnoDaqui(13), entrega: mesAnoDaqui(37),
  jurosObraMensal: 0.83, taxaAdm: 25, seguro: 79, pctObraAssinatura: 0,
  taxaBancoAnual: 10, prazoMeses: 420, sistema: 'price',
}

// ── Bloco híbrido %↔R$ (entrada / parcelas / balões) ──────────────────────────

function ModoToggle({ modo, onModo }: { modo: BlocoModo; onModo: (m: BlocoModo) => void }) {
  return (
    <div className="flex rounded-lg border border-line overflow-hidden">
      {([
        { m: 'valor' as const, label: 'R$ fixo' },
        { m: 'pct' as const,   label: '% do total' },
      ]).map(({ m, label }) => (
        <button
          key={m}
          type="button"
          onClick={() => onModo(m)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            modo === m ? 'bg-brand/15 text-brand' : 'bg-surface text-t3 hover:text-t1'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function BlocoHibrido({
  label, unidade, qtd, onQtd, qtdMin = 0, modo, onModo, valor, onValor, pct, onPct,
  valorTotal, valorEfetivo, extra,
}: {
  label: string
  unidade: string
  qtd: number
  onQtd: (v: number) => void
  qtdMin?: number
  modo: BlocoModo
  onModo: (m: BlocoModo) => void
  valor: number
  onValor: (v: number) => void
  pct: number
  onPct: (v: number) => void
  valorTotal: number
  valorEfetivo: number
  extra?: React.ReactNode
}) {
  const desabilitado = qtd === 0
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-t3 text-xs font-medium">{label}</p>
        <ModoToggle modo={modo} onModo={onModo} />
      </div>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <Input
          label="Quantidade"
          type="number"
          step="1"
          min={qtdMin}
          value={qtd || (qtdMin === 0 ? '0' : '')}
          onChange={e => {
            const v = parseInt(e.target.value, 10)
            onQtd(isNaN(v) ? 0 : v)
          }}
        />
        {modo === 'valor' ? (
          <CurrencyInput
            label={`Valor ${unidade}`}
            value={valor}
            onChange={onValor}
            disabled={desabilitado}
          />
        ) : (
          <Input
            label="Porcentagem do valor total (%)"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={pct || ''}
            disabled={desabilitado}
            onChange={e => {
              const v = parseFloat(e.target.value)
              onPct(isNaN(v) ? 0 : v)
            }}
          />
        )}
      </div>
      {modo === 'pct' && qtd > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-t3 flex-wrap">
          <span>{pct.toLocaleString('pt-BR')}% de {fmtBRL(valorTotal)} =</span>
          <span className="font-semibold text-brand">{fmtBRL(valorEfetivo)}</span>
          <span>{unidade}</span>
        </div>
      )}
      {extra}
    </div>
  )
}

// ── Preview com toggle Resumo / Completo ──────────────────────────────────────

type Visao = 'resumo' | 'completo'

function PreviewAssociativo({ valido, slugBase, renderResumo, renderCompleto }: {
  valido: boolean
  slugBase: string
  renderResumo: (ref: React.Ref<HTMLDivElement>) => React.ReactNode
  renderCompleto: (ref: React.Ref<HTMLDivElement>) => React.ReactNode
}) {
  const [visao, setVisao] = useState<Visao>('resumo')
  const [exporting, setExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleExport = useCallback(async () => {
    if (!cardRef.current || !valido) return
    setExporting(true)
    try {
      const slug = slugBase.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-') || 'simulacao'
      const url  = await toPng(cardRef.current, { pixelRatio: visao === 'resumo' ? 3 : 2, cacheBust: true })
      const a    = document.createElement('a')
      a.download = `associativo-${visao}-${slug}.png`
      a.href = url
      a.click()
      toast.success('Proposta baixada com sucesso!')
    } catch {
      toast.error('Erro ao gerar imagem. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }, [valido, slugBase, visao])

  return (
    <div className="flex flex-col items-center gap-4 xl:sticky xl:top-6">
      <div className="flex items-center justify-between w-full">
        <p className="text-t3 text-xs uppercase tracking-widest">Preview da proposta</p>
        {/* Toggle resumo/completo */}
        <div className="flex rounded-lg border border-line overflow-hidden">
          {([
            { v: 'resumo' as const,   label: 'Resumo' },
            { v: 'completo' as const, label: 'Mês a mês' },
          ]).map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisao(v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                visao === v ? 'bg-brand/15 text-brand' : 'bg-surface text-t3 hover:text-t1'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center w-full">
        {visao === 'resumo'
          ? renderResumo(cardRef)
          : <div style={{ zoom: 0.72 }}>{renderCompleto(cardRef)}</div>}
      </div>

      <Button
        variant="primary"
        size="lg"
        onClick={handleExport}
        disabled={!valido || exporting}
        className="w-full"
      >
        <Download size={16} />
        {exporting
          ? 'Gerando imagem…'
          : visao === 'resumo' ? 'Baixar resumo (PNG)' : 'Baixar mês a mês (PNG)'}
      </Button>

      <p className="text-t4 text-xs text-center leading-relaxed">
        O resumo é para enviar ao cliente no WhatsApp. O mês a mês é o material completo
        para você abrir e explicar em uma vídeo chamada.
      </p>
    </div>
  )
}

// ── Simulador ─────────────────────────────────────────────────────────────────

interface Props {
  shared: SharedFields
  onShared: (patch: Partial<SharedFields>) => void
  corretor: string
}

export function AssociativoSimulator({ shared, onShared, corretor }: Props) {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT)
  const up = (patch: Partial<Cfg>) => setCfg(prev => ({ ...prev, ...patch }))

  const num = (field: keyof Cfg) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    up({ [field]: isNaN(v) ? 0 : v })
  }

  // Valores efetivos: em modo %, a porcentagem é do bloco inteiro sobre o
  // valor total, dividida pela quantidade
  const efetivo = (modo: BlocoModo, valor: number, pct: number, qtd: number) =>
    modo === 'pct' ? (shared.valorTotal * pct / 100) / Math.max(qtd, 1) : valor

  const entradaValorEf = efetivo(cfg.entradaModo, cfg.entradaValor, cfg.entradaPct, cfg.entradaQtd)
  const parcelaValorEf = efetivo(cfg.parcelasModo, cfg.parcelaValor, cfg.parcelasPct, cfg.parcelasQtd)
  const balaoValorEf   = efetivo(cfg.balaoModo, cfg.balaoValor, cfg.balaoPct, cfg.balaoQtd)

  const input: AssociativoInput = {
    valorTotal: shared.valorTotal,
    entradaQtd: cfg.entradaQtd,   entradaValor: entradaValorEf,
    parcelasQtd: cfg.parcelasQtd, parcelaValor: parcelaValorEf,
    balaoQtd: cfg.balaoQtd,       balaoValor: balaoValorEf,
    indice: cfg.indice, taxaIndiceAnual: cfg.taxaIndiceAnual, aplicarCorrecao: cfg.aplicarCorrecao,
    inicioParcelas: cfg.inicioParcelas, financiamento: cfg.financiamento, entrega: cfg.entrega,
    jurosObraMensal: cfg.jurosObraMensal, taxaAdm: cfg.taxaAdm, seguro: cfg.seguro,
    pctObraAssinatura: cfg.pctObraAssinatura,
    taxaBancoAnual: cfg.taxaBancoAnual, prazoMeses: cfg.prazoMeses, sistema: cfg.sistema,
  }
  const result = calcularAssociativo(input)
  const indice = INDICE_LABELS[cfg.indice]

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_500px] gap-8 items-start max-w-6xl mx-auto">

      {/* ── Formulário ── */}
      <div className="space-y-5">
        <IdentificacaoSection shared={shared} onShared={onShared} />

        {/* Composição do pagamento */}
        <Section title="Composição do pagamento na obra">
          <CurrencyInput
            label="Valor total do imóvel"
            value={shared.valorTotal}
            onChange={v => onShared({ valorTotal: v })}
          />

          <div className="w-full h-px bg-line" />

          <BlocoHibrido
            label="Entrada (ato)"
            unidade="por entrada"
            qtd={cfg.entradaQtd} onQtd={v => up({ entradaQtd: v })} qtdMin={1}
            modo={cfg.entradaModo} onModo={m => up({ entradaModo: m })}
            valor={cfg.entradaValor} onValor={v => up({ entradaValor: v })}
            pct={cfg.entradaPct} onPct={v => up({ entradaPct: v })}
            valorTotal={shared.valorTotal} valorEfetivo={entradaValorEf}
          />

          <div className="w-full h-px bg-line" />

          <BlocoHibrido
            label="Parcelas mensais de obra"
            unidade="por parcela"
            qtd={cfg.parcelasQtd} onQtd={v => up({ parcelasQtd: v })} qtdMin={1}
            modo={cfg.parcelasModo} onModo={m => up({ parcelasModo: m })}
            valor={cfg.parcelaValor} onValor={v => up({ parcelaValor: v })}
            pct={cfg.parcelasPct} onPct={v => up({ parcelasPct: v })}
            valorTotal={shared.valorTotal} valorEfetivo={parcelaValorEf}
          />

          <div className="w-full h-px bg-line" />

          <BlocoHibrido
            label="Balões anuais"
            unidade="por balão"
            qtd={cfg.balaoQtd} onQtd={v => up({ balaoQtd: v })}
            modo={cfg.balaoModo} onModo={m => up({ balaoModo: m })}
            valor={cfg.balaoValor} onValor={v => up({ balaoValor: v })}
            pct={cfg.balaoPct} onPct={v => up({ balaoPct: v })}
            valorTotal={shared.valorTotal} valorEfetivo={balaoValorEf}
          />

          <div className="grid grid-cols-2 gap-3 mt-1">
            <DerivedBox
              label={`Pago na obra (${result.pagoNaObraPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}
              value={fmtBRL(result.pagoNaObra)}
              accent
            />
            <DerivedBox
              label={`Saldo a financiar (${result.saldoFinanciarPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}
              value={fmtBRL(result.saldoFinanciar)}
              icon={<TrendingDown size={13} className="text-t3" />}
            />
          </div>
        </Section>

        {/* Linha do tempo */}
        <Section title="Linha do tempo">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="1ª parcela"
              type="month"
              value={cfg.inicioParcelas}
              onChange={e => up({ inicioParcelas: e.target.value })}
            />
            <Input
              label="Assinatura do financiamento"
              type="month"
              value={cfg.financiamento}
              onChange={e => up({ financiamento: e.target.value })}
            />
            <Input
              label="Entrega da obra"
              type="month"
              value={cfg.entrega}
              onChange={e => up({ entrega: e.target.value })}
            />
          </div>
          <div className="flex items-start gap-2 text-xs text-t3">
            <Info size={13} strokeWidth={1.6} className="flex-shrink-0 mt-px" />
            <span>
              A taxa de obra começa no mês seguinte à assinatura ({mesAnoLabel(cfg.financiamento)}) e
              termina na entrega ({mesAnoLabel(cfg.entrega)}).
            </span>
          </div>
        </Section>

        {/* Correção monetária */}
        <Section title="Correção monetária">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Índice"
              value={cfg.indice}
              onChange={e => up({ indice: e.target.value as Indice })}
            >
              <option value="incc">INCC</option>
              <option value="cub">CUB</option>
            </Select>
            <Input
              label={`${indice} projetado (% a.a.)`}
              type="number"
              step="0.1"
              min="0"
              value={cfg.taxaIndiceAnual || ''}
              onChange={num('taxaIndiceAnual')}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-t2">Exibição dos valores</label>
              <div className="flex rounded-lg border border-line overflow-hidden min-h-[42px]">
                {([
                  { v: true,  label: 'Projetar correção' },
                  { v: false, label: 'Só valores base' },
                ]).map(({ v, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => up({ aplicarCorrecao: v })}
                    className={`flex-1 px-2 text-xs font-medium transition-colors cursor-pointer ${
                      cfg.aplicarCorrecao === v ? 'bg-brand/15 text-brand' : 'bg-surface text-t3 hover:text-t1'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {cfg.aplicarCorrecao && result.valido && (
            <p className="text-xs text-t3">
              Parcela base de <span className="font-semibold text-t1">{fmtBRL(parcelaValorEf)}</span> projetada
              com {indice}: 1ª de <span className="font-semibold text-t1">{fmtBRL(result.primeiraParcelaCorrigida)}</span>,
              última de <span className="font-semibold text-t1">{fmtBRL(result.ultimaParcelaCorrigida)}</span>.
            </p>
          )}
        </Section>

        {/* Taxa de obra */}
        <Section title="Taxa de obra">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Input
              label="Juros (% a.m.)"
              type="number"
              step="0.01"
              min="0"
              value={cfg.jurosObraMensal || ''}
              onChange={num('jurosObraMensal')}
            />
            <CurrencyInput
              label="Taxa adm (R$/mês)"
              value={cfg.taxaAdm}
              onChange={v => up({ taxaAdm: v })}
            />
            <CurrencyInput
              label="Seguro (R$/mês)"
              value={cfg.seguro}
              onChange={v => up({ seguro: v })}
            />
            <Input
              label="Obra concluída na assinatura (%)"
              type="number"
              step="1"
              min="0"
              max="100"
              value={cfg.pctObraAssinatura || '0'}
              onChange={num('pctObraAssinatura')}
            />
          </div>
          {result.valido && (
            <DerivedBox
              label={`Estimativa · ${result.mesesTaxaObra} meses, evolução linear da obra`}
              value={`de ${fmtBRL(result.taxaObraPrimeira)} a ${fmtBRL(result.taxaObraUltima)} na entrega`}
              accent
            />
          )}
        </Section>

        {/* Financiamento na entrega */}
        <Section title="Financiamento na entrega">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Taxa do banco (% a.a.)"
              type="number"
              step="0.1"
              min="0"
              value={cfg.taxaBancoAnual || ''}
              onChange={num('taxaBancoAnual')}
            />
            <Input
              label="Prazo (meses)"
              type="number"
              step="12"
              min="12"
              value={cfg.prazoMeses || ''}
              onChange={num('prazoMeses')}
            />
            <Select
              label="Sistema"
              value={cfg.sistema}
              onChange={e => up({ sistema: e.target.value as Sistema })}
            >
              <option value="price">PRICE (parcela fixa)</option>
              <option value="sac">SAC (decrescente)</option>
            </Select>
          </div>
          {result.valido && (
            <DerivedBox
              label={cfg.sistema === 'price' ? 'Parcela estimada (fixa)' : '1ª parcela estimada (decrescente)'}
              value={`≈ ${fmtBRL(result.parcelaFinanciamento)} · sobre o saldo de hoje`}
            />
          )}
        </Section>

        {/* Erro e avisos */}
        {!result.valido && result.erro && (
          <div className="flex items-center gap-2.5 text-sm rounded-xl px-4 py-3 bg-warning-bg border border-warning-line text-warning">
            <AlertCircle size={15} className="flex-shrink-0" />
            <span>{result.erro}</span>
          </div>
        )}
        {result.valido && result.avisos.map(aviso => (
          <div key={aviso} className="flex items-center gap-2.5 text-xs rounded-xl px-4 py-2.5 bg-s2 border border-line text-t3">
            <Info size={13} strokeWidth={1.6} className="flex-shrink-0" />
            <span>{aviso}</span>
          </div>
        ))}
      </div>

      {/* ── Preview + Export ── */}
      <PreviewAssociativo
        valido={result.valido}
        slugBase={shared.empreendimento}
        renderResumo={ref => (
          <AssociativoCard
            ref={ref}
            input={input}
            result={result}
            empreendimento={shared.empreendimento}
            cliente={shared.cliente}
            corretor={corretor}
          />
        )}
        renderCompleto={ref => (
          <AssociativoCardCompleto
            ref={ref}
            input={input}
            result={result}
            empreendimento={shared.empreendimento}
            cliente={shared.cliente}
            corretor={corretor}
          />
        )}
      />
    </div>
  )
}
