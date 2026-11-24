import { useEffect, useState } from 'react'
import { AlertTriangle, Landmark, Plus, RefreshCw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { SidePanel } from '../../components/ui/SidePanel'
import { Button } from '../../components/ui/Button'
import { SecaoTitulo } from '../../components/shared/visual'
import { useAuthStore } from '../../store/useAuthStore'
import {
  BancoRow, diasDesde, financiamentoDb, useParametrosFinanciamento,
} from '../../modules/simulador/financiamento/dados'
import type { Indexador } from '../../modules/simulador/financiamento/calc'

/**
 * Admin › Bancos e taxas (24/11/2026) — a fonte oficial do Simulador de
 * financiamento.
 *
 * Banco não publica taxa de balcão: quem preenche é o admin. Ao lado vai a taxa
 * MÉDIA praticada que o Banco Central publica (com 1 a 2 meses de atraso) — só
 * referência, com o botão "usar essa taxa".
 */

/** Modalidade do BCB que corresponde ao indexador do banco (taxas de mercado = balcão). */
const MODALIDADE: Record<Indexador, string> = {
  TR: 'Financiamento imobiliário com taxas de mercado - Pós-fixado referenciado em TR',
  IPCA: 'Financiamento imobiliário com taxas de mercado - Pós-fixado referenciado em IPCA',
  fixa: 'Financiamento imobiliário com taxas de mercado - Prefixado',
}

type TaxaBcb = { cnpj8: string; ano_mes: string; modalidade: string; taxa_ano: number }

const pct = (v: number | null | undefined) => v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
const mesCurto = (anoMes: string) => {
  const [a, m] = anoMes.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/').replace(' de ', '/')
}
const dataHora = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

function referenciaBcb(taxas: TaxaBcb[], b: Pick<BancoRow, 'cnpj8' | 'indexador'>): TaxaBcb | undefined {
  return taxas.find(t => t.cnpj8 === b.cnpj8 && t.modalidade === MODALIDADE[b.indexador])
}

export function BancosETaxas() {
  const { bancos, situacao, carregado, erro, carregar } = useParametrosFinanciamento()
  const profiles = useAuthStore(s => s.allProfiles ?? [])
  const [taxas, setTaxas] = useState<TaxaBcb[]>([])
  const [editando, setEditando] = useState<BancoRow | null>(null)
  const [buscando, setBuscando] = useState(false)

  useEffect(() => { void carregar(true) }, [carregar])
  useEffect(() => { financiamentoDb.taxasBcb().then(setTaxas).catch(() => setTaxas([])) }, [])

  const nomeDe = (id: string | null) => profiles.find(p => p.id === id)?.name ?? null
  const sgs = situacao.find(s => s.fonte === 'sgs')
  const olinda = situacao.find(s => s.fonte === 'olinda')
  const falhou = !!(sgs?.erro || olinda?.erro)

  async function buscarAgora() {
    setBuscando(true)
    try {
      await financiamentoDb.buscarAgora()
      toast.success('Busca no Banco Central disparada — os números chegam em alguns segundos')
      // A Edge Function roda fora daqui; relê depois de dar tempo a ela.
      setTimeout(() => {
        void carregar(true)
        financiamentoDb.taxasBcb().then(setTaxas).catch(() => {})
        setBuscando(false)
      }, 8000)
    } catch { setBuscando(false) }
  }

  return (
    <section>
      <SecaoTitulo icon={Landmark} tom="info" descricao="Taxas e regras que o Simulador de financiamento usa">
        Bancos e taxas
      </SecaoTitulo>

      {erro && <p className="mt-3 text-[13px] text-error" role="alert">Não foi possível ler os bancos: {erro}</p>}

      {carregado && (
        <div className="flex flex-col gap-2 mt-3">
          {bancos.map(b => {
            const ref = referenciaBcb(taxas, b)
            const dias = diasDesde(b.atualizado_em)
            return (
              <button key={b.id} type="button" onClick={() => setEditando(b)}
                      className="lista-linha w-full text-left flex items-center gap-3 px-4 py-3 cursor-pointer
                                 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.ativo ? 'bg-success' : 'bg-t5'}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-t1">
                    {b.nome}{b.padrao && <span className="ml-2 text-[11.5px] font-semibold text-brand-text">padrão da ficha</span>}
                  </span>
                  <span className="block text-[12px] text-t4">
                    {b.ativo ? 'Ativo' : 'Desligado'}
                    {b.atualizado_em && <> · atualizado em {dataHora(b.atualizado_em)}{nomeDe(b.atualizado_por) && ` por ${nomeDe(b.atualizado_por)}`}</>}
                    {b.taxa_origem === 'bcb_media' && <span className="text-brand-text font-semibold"> · média BCB, provisória</span>}
                    {b.ativo && b.taxa_origem === 'balcao' && dias != null && dias > 30 && <span className="text-warning"> · há {dias} dias</span>}
                  </span>
                </span>
                <span className="text-right flex-shrink-0">
                  <span className="block text-[14px] font-bold text-t1 tabular-nums">{b.taxa_sfh == null ? 'sem taxa' : `${pct(b.taxa_sfh)} a.a.`}</span>
                  <span className="block text-[11.5px] text-t4 tabular-nums">
                    {ref ? `BCB ${mesCurto(ref.ano_mes)}: ${pct(ref.taxa_ano)}` : 'BCB sem dado'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Busca no Banco Central ── */}
      <div className="mt-5 rounded-[20px] border border-line bg-surface p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[14px] font-semibold text-t1">Taxas médias do Banco Central</p>
            <p className={`text-[12px] mt-1 ${falhou ? 'text-warning' : 'text-t4'}`}>
              {falhou
                ? <span className="inline-flex items-start gap-1"><AlertTriangle size={13} className="mt-0.5" aria-hidden />Última busca no BCB falhou ({dataHora(sgs?.tentado_em ?? olinda?.tentado_em ?? null)}): {sgs?.erro || olinda?.erro}. Seguimos com o último valor salvo.</span>
                : `Banco Central lido em ${dataHora(sgs?.ok_em ?? null)} · todo dia às 7h10`}
            </p>
          </div>
          <Button variant="secondary" onClick={() => void buscarAgora()} disabled={buscando} className="gap-2">
            <RefreshCw size={14} className={buscando ? 'animate-spin' : ''} aria-hidden /> Buscar agora
          </Button>
        </div>
      </div>

      <EditarBanco banco={editando} taxas={taxas} onFechar={() => setEditando(null)}
                   onSalvo={() => { setEditando(null); void carregar(true) }} />
    </section>
  )
}

function CampoNum({ rotulo, valor, onChange, sufixo, ajuda }: {
  rotulo: string; valor: number | null; onChange: (v: number | null) => void; sufixo?: string; ajuda?: string
}) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor).replace('.', ','))
  useEffect(() => { setTexto(valor == null ? '' : String(valor).replace('.', ',')) }, [valor])
  return (
    <label className="flex flex-col gap-1.5">
      <span className="rotulo-campo">{rotulo}</span>
      <span className="relative flex items-center">
        <input inputMode="decimal" value={texto}
               onChange={e => {
                 const t = e.target.value.replace(/[^\d,.]/g, '')
                 setTexto(t)
                 const n = parseFloat(t.replace(',', '.'))
                 onChange(t === '' || Number.isNaN(n) ? null : n)
               }}
               className="campo w-full h-10 pl-3 pr-14 tabular-nums" />
        {sufixo && <span className="absolute right-3 text-[12px] text-t4 pointer-events-none">{sufixo}</span>}
      </span>
      {ajuda && <span className="text-[11.5px] text-t4">{ajuda}</span>}
    </label>
  )
}

function EditarBanco({ banco, taxas, onFechar, onSalvo }: {
  banco: BancoRow | null; taxas: TaxaBcb[]; onFechar: () => void; onSalvo: () => void
}) {
  const [b, setB] = useState<BancoRow | null>(banco)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { setB(banco) }, [banco])
  if (!b) return <SidePanel isOpen={false} onClose={onFechar} title="">{null}</SidePanel>

  const muda = (p: Partial<BancoRow>) => setB(prev => prev ? { ...prev, ...p } : prev)
  const ref = referenciaBcb(taxas, b)
  const completo = b.taxa_sfh != null && b.cota_sac != null && b.cota_price != null && b.prazo_maximo != null
  const sujo = JSON.stringify(b) !== JSON.stringify(banco)

  async function salvar() {
    if (!b) return
    if (b.ativo && !completo) { toast.error('Para ligar o banco, preencha taxa SFH, cotas e prazo máximo'); return }
    setSalvando(true)
    try { await financiamentoDb.salvarBanco(b); toast.success(`${b.nome} salvo`); onSalvo() }
    catch { /* aviso já dado */ } finally { setSalvando(false) }
  }

  return (
    <SidePanel isOpen={!!banco} onClose={onFechar} title={b.nome} subtitle="Parâmetros do financiamento"
               size="md" confirmarSaida={sujo}
               footer={
                 <div className="flex gap-3">
                   <Button variant="secondary" className="flex-1" onClick={onFechar}>Cancelar</Button>
                   <Button className="flex-1" onClick={() => void salvar()} disabled={salvando || !sujo}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
                 </div>
               }>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-[13.5px] text-t1 cursor-pointer">
            <input type="checkbox" checked={b.ativo} onChange={e => muda({ ativo: e.target.checked })} /> Banco ativo na calculadora
          </label>
          <label className="inline-flex items-center gap-2 text-[13.5px] text-t1 cursor-pointer">
            <input type="checkbox" checked={b.padrao} onChange={e => muda({ padrao: e.target.checked })} /> Padrão da ficha do lead
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            {/* Digitar a taxa = taxa de balcão (para de seguir a média do BCB). */}
            <CampoNum rotulo="Taxa SFH (balcão)" sufixo="% a.a." valor={b.taxa_sfh} onChange={v => muda({ taxa_sfh: v, taxa_origem: 'balcao' })} />
            {ref && (
              <p className="text-[11.5px] text-t4 tabular-nums">
                Média BCB {mesCurto(ref.ano_mes)}: {pct(ref.taxa_ano)}{' '}
                <button type="button" onClick={() => muda({ taxa_sfh: ref.taxa_ano, taxa_origem: 'balcao' })}
                        className="font-semibold text-t1 underline underline-offset-2 cursor-pointer">usar essa taxa</button>
              </p>
            )}
            {ref && (
              <label className="inline-flex items-start gap-2 text-[12.5px] text-t2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={b.taxa_origem === 'bcb_media'}
                       onChange={ev => muda(ev.target.checked
                         ? { taxa_origem: 'bcb_media', taxa_sfh: ref.taxa_ano, taxa_media_mes: ref.ano_mes }
                         : { taxa_origem: 'balcao' })} />
                Seguir a média do BCB todo mês (provisório, até ter a taxa de balcão)
              </label>
            )}
          </div>
          <CampoNum rotulo="Taxa SFI (acima de R$ 2,25 mi)" sufixo="% a.a." valor={b.taxa_sfi} onChange={v => muda({ taxa_sfi: v })} />
          <label className="flex flex-col gap-1.5">
            <span className="rotulo-campo">Indexador</span>
            <select value={b.indexador} onChange={e => muda({ indexador: e.target.value as Indexador })} className="campo h-10 px-3">
              <option value="TR">TR</option><option value="IPCA">IPCA</option><option value="fixa">Taxa fixa</option>
            </select>
          </label>
          <CampoNum rotulo="Prazo máximo" sufixo="meses" valor={b.prazo_maximo} onChange={v => muda({ prazo_maximo: v == null ? null : Math.round(v) })} />
          <CampoNum rotulo="Cota SAC" sufixo="%" valor={b.cota_sac} onChange={v => muda({ cota_sac: v })} />
          <CampoNum rotulo="Cota Price" sufixo="%" valor={b.cota_price} onChange={v => muda({ cota_price: v })} />
          <CampoNum rotulo="Idade + prazo até" sufixo="meses" valor={b.idade_maxima_meses}
                    onChange={v => muda({ idade_maxima_meses: v == null ? 966 : Math.round(v) })} ajuda="966 = 80 anos e 6 meses" />
          <CampoNum rotulo="Comprometimento da renda" sufixo="%" valor={b.comprometimento} onChange={v => muda({ comprometimento: v ?? 30 })} />
          <CampoNum rotulo="DFI (seguro do imóvel)" sufixo="% a.m." valor={b.dfi} onChange={v => muda({ dfi: v ?? 0 })} />
          <CampoNum rotulo="Tarifa de administração" sufixo="R$/mês" valor={b.tarifa} onChange={v => muda({ tarifa: v ?? 0 })} />
        </div>

        <div>
          <p className="rotulo-campo mb-2">MIP (seguro de vida) por idade · % ao mês sobre o financiado</p>
          <div className="flex flex-col gap-2">
            {b.mip.map((f, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1"><CampoNum rotulo={i === 0 ? 'Até a idade' : ''} sufixo="anos" valor={f.idadeAte}
                  onChange={v => muda({ mip: b.mip.map((x, j) => j === i ? { ...x, idadeAte: v ?? 0 } : x) })} /></div>
                <div className="flex-1"><CampoNum rotulo={i === 0 ? 'Coeficiente' : ''} sufixo="%" valor={f.coef}
                  onChange={v => muda({ mip: b.mip.map((x, j) => j === i ? { ...x, coef: v ?? 0 } : x) })} /></div>
                <button type="button" aria-label="Tirar a faixa" onClick={() => muda({ mip: b.mip.filter((_, j) => j !== i) })}
                        className="w-10 h-10 inline-flex items-center justify-center rounded-[10px] text-t4 hover:text-error hover:bg-s2 cursor-pointer">
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => muda({ mip: [...b.mip, { idadeAte: 80, coef: 0 }] })}
                    className="self-start inline-flex items-center gap-1 text-[12.5px] font-semibold text-t2 hover:text-t1 cursor-pointer">
              <Plus size={13} aria-hidden /> faixa de idade
            </button>
            <p className="text-[11.5px] text-t4">Sem idade informada, a calculadora usa o maior coeficiente da tabela (pior cenário).</p>
          </div>
        </div>
      </div>
    </SidePanel>
  )
}
