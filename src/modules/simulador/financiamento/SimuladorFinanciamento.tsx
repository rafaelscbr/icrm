import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, BadgeCheck, CalendarClock, Download, Landmark, Loader2, Plus, Save, Trash2, XCircle } from 'lucide-react'
import { toPng } from 'html-to-image'
import toast from 'react-hot-toast'
import { Grafico, eixoValor, CoresGrafico } from '../../../components/charts/Grafico'
import { Segmentado } from '../../../components/shared/visual'
import { Destaque } from '../../../components/shared/Destaque'
import {
  compararBancos, evolucaoParcela, IndiceObra, mesesAte, ParametrosBanco, simular, Sistema,
} from './calc'
import { acumuladoDaSerie, bancoParaCalculo, diasDesde, SERIE_DO_INDICE, useParametrosFinanciamento } from './dados'
import { ESTADO_INICIAL, EstadoFinanciamento, RepasseDoFluxo, ResumoFinanciamento } from './estado'
import { Ajuda, brl, CampoDinheiro, CampoNumero, Contagem, Medidor, pct, Regua, RotuloCampo } from './pecas'
import { AVISO_LEGAL, ResumoCliente } from './ResumoCliente'

/**
 * Simulador de financiamento (24/11/2026) — fica ao lado do Simulador de fluxo.
 *
 * Responde ao corretor, na hora: quanto de renda bruta o cliente precisa, quanto
 * fica a parcela do banco, quanto o saldo vale nas chaves depois do INCC/CUB e
 * se a renda dele passa (e o que fazer se não passar).
 *
 * Só LÊ o Simulador de fluxo (`origem`). Campo que o corretor mexe aqui se solta
 * do fluxo e ganha o "usar o do fluxo" para voltar. Tudo recalcula a cada
 * mudança — não existe botão "calcular".
 */

const NOME_INDICE: Record<IndiceObra, string> = { incc: 'INCC', cub: 'CUB' }

const AJUDA = {
  renda:  { termo: 'Renda bruta', texto: 'o que a família ganha antes dos descontos. O banco deixa a parcela usar até 30% dela.' },
  sac:    { termo: 'SAC', texto: 'parcela começa mais alta e cai todo mês. É a que o banco usa para aprovar.' },
  price:  { termo: 'Price', texto: 'parcela igual do começo ao fim, mas paga mais juros no total.' },
  incc:   { termo: 'INCC / CUB', texto: 'índices do custo da obra. Corrigem o saldo devedor até a entrega das chaves.' },
  mip:    { termo: 'MIP', texto: 'seguro de vida do financiamento. Quanto mais velho o comprador, mais caro.' },
  dfi:    { termo: 'DFI', texto: 'seguro do imóvel contra danos físicos, cobrado junto da parcela.' },
  fgts:   { termo: 'FGTS', texto: 'saldo do FGTS usado nas chaves abate direto o valor financiado.' },
  prazo:  { termo: 'Prazo', texto: 'idade do mais velho + prazo não passa de 80 anos e 6 meses. A régua trava sozinha.' },
}

export function SimuladorFinanciamento({
  origem, inicial, onEstado, onSalvarNoLead, salvando, cliente, empreendimento, corretor, comTitulo = true,
}: {
  /** o que o Simulador de fluxo informa; null = modo sem financiamento */
  origem?: RepasseDoFluxo | null
  inicial?: EstadoFinanciamento
  /** avisa o hospedeiro (o simulador do lead) a cada mudança */
  onEstado?: (e: EstadoFinanciamento, resumo: ResumoFinanciamento | null) => void
  /** só aparece quando o simulador está ligado a um lead */
  onSalvarNoLead?: () => void
  salvando?: boolean
  cliente?: string
  empreendimento?: string
  corretor?: string
  /** na gaveta o título já está no cabeçalho dela */
  comTitulo?: boolean
}) {
  const { bancos: linhas, indices, carregado, carregando, erro, carregar } = useParametrosFinanciamento()
  useEffect(() => { void carregar() }, [carregar])

  const [e, setE] = useState<EstadoFinanciamento>(inicial ?? ESTADO_INICIAL)
  const muda = (patch: Partial<EstadoFinanciamento>) => setE(prev => ({ ...prev, ...patch }))
  const solta = (k: keyof EstadoFinanciamento) => setE(prev => { const n = { ...prev }; delete n[k]; return n })

  // ── Bancos ativos e o escolhido ──
  const bancos = useMemo(
    () => linhas.filter(b => b.ativo).map(bancoParaCalculo).filter((b): b is ParametrosBanco => !!b),
    [linhas],
  )
  const padrao = linhas.find(b => b.padrao && b.ativo)?.id
  const banco = bancos.find(b => b.id === e.bancoId) ?? bancos.find(b => b.id === padrao) ?? bancos[0]
  const linhaDoBanco = linhas.find(b => b.id === banco?.id)

  // ── Valores efetivos: o que o corretor mexeu > o que vem do fluxo > padrão ──
  const valorImovel = e.valorImovel ?? origem?.valorImovel ?? 0
  const pagoAteChaves = e.pagoAteChaves ?? origem?.pagoAteChaves ?? 0
  const mesesDoFluxo = origem?.entrega ? mesesAte(origem.entrega) : undefined
  const meses = e.meses ?? mesesDoFluxo ?? 0
  const indice: IndiceObra = e.indice ?? origem?.indice ?? 'incc'
  const media = acumuladoDaSerie(indices, SERIE_DO_INDICE[indice])
  const indiceAnual = e.indiceAnual ?? origem?.indiceAnual ?? media?.valor ?? 0
  const rendaCliente = e.rendas.reduce((s, v) => s + (v || 0), 0)

  const entrada = {
    valorImovel, pagoAteChaves, mesesAteEntrega: meses, indiceAnual,
    idade: e.idade ?? null, sistema: e.sistema, prazo: e.prazo ?? null,
    taxaAnual: e.taxaAnual ?? null, fgts: e.fgts, rendaCliente: rendaCliente || null,
  }
  const r = banco ? simular(entrada, banco) : null
  const outro: Sistema = e.sistema === 'sac' ? 'price' : 'sac'
  const rOutro = banco && r?.valido ? simular({ ...entrada, sistema: outro, rendaCliente: null }, banco) : null

  // ── Relato ao hospedeiro (o simulador do lead) ──
  const resumo: ResumoFinanciamento | null = r?.valido && banco ? {
    banco: banco.nome, sistema: e.sistema, prazo: r.prazo, taxaAnual: r.taxaAnual,
    saldoChaves: r.saldoChaves, financiado: r.financiado, parcelaTotal: r.parcelaTotal,
    rendaNecessaria: r.rendaNecessaria,
    ...(r.inverso ? { rendaCliente: r.inverso.rendaCliente, passa: r.inverso.passa } : {}),
  } : null
  const assinatura = JSON.stringify({ e, resumo })
  useEffect(() => {
    if (!onEstado) return
    const { e: est, resumo: res } = JSON.parse(assinatura) as { e: EstadoFinanciamento; resumo: ResumoFinanciamento | null }
    onEstado(est, res)
  }, [assinatura, onEstado])

  // ── Resumo pro cliente (PNG) ──
  const cartao = useRef<HTMLDivElement>(null)
  const [gerando, setGerando] = useState(false)
  const gerarResumo = useCallback(async () => {
    if (!cartao.current) return
    setGerando(true)
    try {
      const url = await toPng(cartao.current, { pixelRatio: 3, cacheBust: true })
      const a = document.createElement('a')
      const slug = (empreendimento || 'financiamento').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')
      a.download = `financiamento-${slug}.png`
      a.href = url
      a.click()
      toast.success('Resumo baixado — é só anexar no WhatsApp')
    } catch {
      toast.error('Não foi possível gerar a imagem. Tente de novo.')
    } finally {
      setGerando(false)
    }
  }, [empreendimento])

  // ── Estados de tela ──
  if (!carregado) {
    return (
      <div className="p-5 text-[13px] text-t3 flex items-center gap-2" role="status">
        {erro ? <><XCircle size={15} className="text-error" aria-hidden /> Não foi possível ler os parâmetros dos bancos: {erro}
          <button type="button" className="underline cursor-pointer" onClick={() => void carregar(true)}>tentar de novo</button></>
          : <><Loader2 size={15} className="animate-spin" aria-hidden /> {carregando ? 'Lendo os parâmetros dos bancos…' : ''}</>}
      </div>
    )
  }
  if (!banco) {
    return <p className="p-5 text-[13px] text-t3">Nenhum banco ativo com taxa cadastrada. O admin cadastra em Admin › Bancos e taxas.</p>
  }

  const diasTaxa = diasDesde(linhaDoBanco?.atualizado_em ?? null)
  const taxaVelha = diasTaxa != null && diasTaxa > 30
  const dataTaxa = linhaDoBanco?.atualizado_em
    ? new Date(linhaDoBanco.atualizado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null
  const comprometimentoMax = banco.comprometimento / 100
  const comparativo = r?.valido ? compararBancos({ ...entrada, rendaCliente: null }, bancos) : []
  const fim = new Date(); fim.setMonth(fim.getMonth() + meses + (r?.prazo ?? 0))
  const chaves = new Date(); chaves.setMonth(chaves.getMonth() + meses)
  const mesAno = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('. de ', '/').replace(' de ', '/')

  return (
    <div className="space-y-4">
      {/* ── Título e bancos ── */}
      <div className="space-y-3">
        {comTitulo && (
          <h2 className="font-display text-[19px] font-bold text-t1 tracking-[-0.02em]">
            Simulador de <Destaque>financiamento</Destaque>
          </h2>
        )}
        <div role="radiogroup" aria-label="Banco" className="flex flex-wrap gap-1.5">
          {bancos.map(b => {
            const ativo = b.id === banco.id
            return (
              <button key={b.id} type="button" role="radio" aria-checked={ativo}
                      onClick={() => muda({ bancoId: b.id, taxaAnual: null })}
                      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-semibold cursor-pointer transition-colors
                                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                                  ${ativo ? 'bg-[#0F2759] text-white' : 'bg-s2 text-t2 hover:bg-s3'}`}>
                {b.logoUrl
                  ? <img src={b.logoUrl} alt="" className="w-5 h-5 rounded object-contain bg-white" />
                  : <Landmark size={14} strokeWidth={1.8} aria-hidden />}
                {b.nome}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Destaque: renda necessária ── */}
      <section className="relative marinho marinho-bloco overflow-hidden p-5" aria-live="polite">
        {r?.valido ? (
          <>
            <p className="text-[12.5px] opacity-75 flex items-center gap-1">Renda bruta necessária <Ajuda {...AJUDA.renda} /></p>
            <p className="font-display text-[34px] font-extrabold leading-tight text-brand tracking-[-0.02em]">
              <Contagem valor={r.rendaNecessaria} />
            </p>
            <p className="text-[13.5px] mt-1">
              1ª parcela <strong className="tabular-nums"><Contagem valor={r.parcelaTotal} formatar={v => brl(v)} /></strong>
              <span className="opacity-70"> · {e.sistema === 'sac' ? 'SAC' : 'Price'} em {r.prazo} meses</span>
            </p>
            <p className="text-[12px] opacity-70 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{banco.nome} {pct(r.taxaAnual)} a.a. {r.sfi ? 'SFI' : 'SFH'}{banco.indexador !== 'fixa' ? ` + ${banco.indexador}` : ''}</span>
              {dataTaxa && e.taxaAnual == null && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-[rgba(255,255,255,0.12)]">
                  <CalendarClock size={11} aria-hidden /> taxa atualizada em {dataTaxa}
                </span>
              )}
              {e.taxaAnual != null && <span className="rounded-full px-2 py-0.5 bg-[rgba(255,255,255,0.12)]">taxa editada</span>}
            </p>
          </>
        ) : (
          <p className="text-[14px]">{r?.erro ?? 'Preencha o valor do imóvel.'}</p>
        )}
      </section>

      {taxaVelha && e.taxaAnual == null && (
        <p className="flex items-start gap-2 rounded-[12px] bg-warning-bg border border-warning-line text-warning text-[12.5px] px-3 py-2" role="status">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" aria-hidden />
          A taxa da {banco.nome} foi atualizada há {diasTaxa} dias. Confirme com o banco antes de passar ao cliente.
        </p>
      )}

      {r?.valido && r.avisos.map(a => (
        <p key={a} className="flex items-start gap-2 rounded-[12px] bg-warning-bg border border-warning-line text-warning text-[12.5px] px-3 py-2" role="alert">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" aria-hidden />
          <span>{a}{r.cotaEstourada && a.includes('cota') && <> Falta <strong className="tabular-nums">{brl(r.faltaEntradaCota)}</strong> de entrada nas chaves.</>}</span>
        </p>
      ))}

      {/* ── Modo inverso: renda do cliente ── */}
      {r?.valido && r.inverso && (
        <section className={`rounded-[20px] border p-4 ${r.inverso.passa ? 'border-success-line bg-success-bg' : 'border-error-line bg-error-bg'}`} aria-live="polite">
          <div className="flex items-center gap-3">
            <Medidor fracao={r.inverso.comprometimentoAtual} limite={comprometimentoMax} />
            <div className="min-w-0">
              <p className={`inline-flex items-center gap-1.5 text-[13px] font-bold ${r.inverso.passa ? 'text-success' : 'text-error'}`}>
                {r.inverso.passa ? <BadgeCheck size={15} aria-hidden /> : <XCircle size={15} aria-hidden />}
                {r.inverso.passa ? 'Aprovável' : 'Fora da regra'}
              </p>
              <p className="text-[13px] text-t2 mt-0.5">
                Compromete <strong className="tabular-nums">{pct(r.inverso.comprometimentoAtual * 100, 1)}</strong> da renda
                <span className="text-t4"> (limite {pct(banco.comprometimento, 0)})</span>
              </p>
              <p className="text-[12.5px] text-t3 mt-0.5 tabular-nums">
                Financia até {brl(r.inverso.saldoMaximo, 0)} · {r.inverso.diferenca >= 0 ? 'sobra' : 'falta'} {brl(Math.abs(r.inverso.diferenca), 0)}
              </p>
            </div>
          </div>
          {r.inverso.sugestoes.length > 0 && (
            <ul className="mt-3 space-y-1 text-[13px] text-t1">
              {r.inverso.sugestoes.map(s => <li key={s.tipo} className="flex gap-2"><span className="text-t4" aria-hidden>→</span>{s.texto}</li>)}
              <li className="text-[12px] text-t4 pl-5">Qualquer uma delas sozinha resolve.</li>
            </ul>
          )}
        </section>
      )}

      {/* ── Linha do tempo ── */}
      {r?.valido && (
        <ol className="grid grid-cols-3 gap-2 text-center" aria-label="Linha do tempo do saldo">
          {[
            { rotulo: 'Hoje', valor: r.saldoHoje, nota: 'saldo' },
            { rotulo: `Chaves · ${mesAno(chaves)}`, valor: r.saldoChaves, nota: meses > 0 && indiceAnual > 0 ? `+${NOME_INDICE[indice]}` : 'sem correção' },
            { rotulo: `Fim · ${mesAno(fim)}`, valor: 0, nota: 'quitado' },
          ].map((p, i) => (
            <li key={p.rotulo} className="relative rounded-[14px] bg-s2 px-2 py-2.5">
              {i > 0 && <span className="absolute -left-2 top-1/2 -translate-y-1/2 text-t4 text-[11px]" aria-hidden>›</span>}
              <p className="text-[11px] text-t4">{p.rotulo}</p>
              <p className="text-[13.5px] font-bold text-t1 tabular-nums"><Contagem valor={p.valor} /></p>
              <p className="text-[11px] text-t4">{p.nota}</p>
            </li>
          ))}
        </ol>
      )}

      {/* ── Campos ── */}
      <section className="space-y-4 rounded-[20px] border border-line bg-surface p-4">
        <CampoDinheiro
          rotulo="Valor do imóvel" valor={valorImovel} max={3_000_000} step={5000}
          onChange={v => muda({ valorImovel: v })}
          solto={e.valorImovel != null && origem != null} onVoltar={() => solta('valorImovel')}
        />
        <CampoDinheiro
          rotulo="Total pago até as chaves" valor={pagoAteChaves} max={valorImovel || 1_000_000} step={1000}
          onChange={v => muda({ pagoAteChaves: v })}
          solto={e.pagoAteChaves != null && origem != null} onVoltar={() => solta('pagoAteChaves')}
          nota={valorImovel > 0 ? `${pct((pagoAteChaves / valorImovel) * 100, 1)} do imóvel` : undefined}
        />
        <div className="space-y-1.5">
          <RotuloCampo solto={e.meses != null && mesesDoFluxo != null} onVoltar={() => solta('meses')}>
            Meses até a entrega <span className="text-t1 tabular-nums ml-1">{meses}</span>
          </RotuloCampo>
          <Regua min={0} max={60} step={1} value={meses} onChange={v => muda({ meses: v })} rotulo="Meses até a entrega" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="rotulo-campo inline-flex items-center gap-1">Correção até as chaves <Ajuda {...AJUDA.incc} /></span>
            <Segmentado rotulo="Índice de correção" valor={indice}
                        opcoes={[{ value: 'incc', label: 'INCC' }, { value: 'cub', label: 'CUB' }]}
                        onChange={v => muda({ indice: v, indiceAnual: undefined })} />
          </div>
          <CampoNumero
            rotulo={`${NOME_INDICE[indice]} projetado`} sufixo="% a.a." valor={indiceAnual}
            onChange={v => muda({ indiceAnual: v ?? 0 })}
            solto={e.indiceAnual != null} onVoltar={() => solta('indiceAnual')}
            acao={media && (
              <button type="button" onClick={() => muda({ indiceAnual: Number(media.valor.toFixed(2)) })}
                      className="h-10 px-3 rounded-[10px] text-[12.5px] font-semibold bg-s2 hover:bg-s3 text-t1 whitespace-nowrap cursor-pointer
                                 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                      title={`Acumulado de 12 meses até ${new Date(media.ate + 'T12:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`}>
                12 meses: {pct(media.valor)}
              </button>
            )}
          />
          {!media && <p className="text-[12px] text-t4">{indice === 'cub' ? 'CUB ainda sem 12 meses lançados no admin.' : 'Sem 12 meses de INCC salvos.'}</p>}
        </div>

        <CampoNumero rotulo="Idade do comprador mais velho" sufixo="anos" casas={0} valor={e.idade ?? null}
                     onChange={v => muda({ idade: v == null ? null : Math.round(v) })} placeholder="não informada" />

        <div className="flex items-center justify-between gap-2">
          <span className="rotulo-campo inline-flex items-center gap-1">
            Amortização <Ajuda {...(e.sistema === 'sac' ? AJUDA.sac : AJUDA.price)} />
          </span>
          <Segmentado rotulo="Sistema de amortização" valor={e.sistema}
                      opcoes={[{ value: 'sac', label: 'SAC' }, { value: 'price', label: 'Price' }]}
                      onChange={v => muda({ sistema: v })} />
        </div>

        {r?.valido && (
          <div className="space-y-1.5">
            <RotuloCampo ajuda={AJUDA.prazo}>
              Prazo <span className="text-t1 tabular-nums ml-1">{r.prazo} meses</span>
              <span className="text-t4 font-normal ml-1">· máx. {r.prazoMaximo}</span>
            </RotuloCampo>
            <Regua min={Math.min(60, r.prazoMaximo)} max={r.prazoMaximo} step={1} value={r.prazo}
                   onChange={v => muda({ prazo: v >= r.prazoMaximo ? null : v })} rotulo="Prazo em meses" />
          </div>
        )}

        <CampoNumero
          rotulo="Taxa de juros" sufixo="% a.a." valor={e.taxaAnual ?? r?.taxaBanco ?? null}
          onChange={v => muda({ taxaAnual: v })}
          solto={e.taxaAnual != null} onVoltar={() => muda({ taxaAnual: null })}
        />

        <div className="space-y-2">
          <span className="rotulo-campo inline-flex items-center gap-1">Renda bruta do cliente <span className="font-normal text-t4">(opcional)</span></span>
          {e.rendas.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="relative flex-1 flex items-center">
                <span className="absolute left-3.5 text-[13px] text-t4 pointer-events-none" aria-hidden>R$</span>
                <input inputMode="numeric" aria-label={i === 0 ? 'Renda bruta do cliente' : `Renda da pessoa ${i + 1}`}
                       value={v ? Math.round(v).toLocaleString('pt-BR') : ''} placeholder={i === 0 ? 'renda do cliente' : `pessoa ${i + 1}`}
                       onChange={ev => { const d = ev.target.value.replace(/\D/g, ''); const n = [...e.rendas]; n[i] = d ? parseInt(d, 10) : 0; muda({ rendas: n }) }}
                       className="campo w-full h-10 pl-10 pr-3 tabular-nums" />
              </div>
              {i > 0 && (
                <button type="button" aria-label={`Tirar a renda da pessoa ${i + 1}`}
                        onClick={() => muda({ rendas: e.rendas.filter((_, j) => j !== i) })}
                        className="w-10 h-10 inline-flex items-center justify-center rounded-[10px] text-t4 hover:text-error hover:bg-s2 cursor-pointer
                                   focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </div>
          ))}
          {e.rendas.length < 4 && (
            <button type="button" onClick={() => muda({ rendas: [...e.rendas, 0] })}
                    className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-t2 hover:text-t1 cursor-pointer rounded
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
              <Plus size={13} aria-hidden /> compor renda
            </button>
          )}
          {e.rendas.length > 1 && rendaCliente > 0 && <p className="text-[12px] text-t4 tabular-nums">Renda somada: {brl(rendaCliente, 0)}</p>}
        </div>

        <CampoDinheiro rotulo="FGTS nas chaves (opcional)" valor={e.fgts} max={Math.max(100_000, e.fgts)} step={1000}
                       onChange={v => muda({ fgts: v })} ajuda={AJUDA.fgts} />
      </section>

      {/* ── Encargos, SAC × Price ── */}
      {r?.valido && rOutro?.valido && (
        <section className="rounded-[20px] border border-line bg-surface p-4 space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-[11px] text-t4 inline-flex items-center gap-0.5">MIP <Ajuda {...AJUDA.mip} /></dt><dd className="text-[13px] font-semibold tabular-nums">{brl(r.mip)}</dd></div>
            <div><dt className="text-[11px] text-t4 inline-flex items-center gap-0.5">DFI <Ajuda {...AJUDA.dfi} /></dt><dd className="text-[13px] font-semibold tabular-nums">{brl(r.dfi)}</dd></div>
            <div><dt className="text-[11px] text-t4">Tarifa</dt><dd className="text-[13px] font-semibold tabular-nums">{brl(r.tarifa)}</dd></div>
          </dl>
          <table className="w-full text-[12.5px] tabular-nums">
            <caption className="sr-only">SAC e Price lado a lado</caption>
            <thead>
              <tr className="text-t4"><th className="text-left font-normal py-1"></th><th className="text-right font-semibold">SAC</th><th className="text-right font-semibold">Price</th></tr>
            </thead>
            <tbody className="text-t1">
              {(() => {
                const sac = e.sistema === 'sac' ? r : rOutro
                const price = e.sistema === 'price' ? r : rOutro
                return [
                  ['1ª parcela', brl(sac.parcelaTotal), brl(price.parcelaTotal)],
                  ['Renda exigida', brl(sac.rendaNecessaria, 0), brl(price.rendaNecessaria, 0)],
                  ['Total pago', brl(r.sac.totalPago, 0), brl(r.price.totalPago, 0)],
                  ['Total de juros', brl(r.sac.totalJuros, 0), brl(r.price.totalJuros, 0)],
                ].map(([a, b, c]) => (
                  <tr key={a} className="border-t border-line"><td className="py-1.5 text-t3">{a}</td><td className="text-right">{b}</td><td className="text-right">{c}</td></tr>
                ))
              })()}
            </tbody>
          </table>
          <GraficoParcelas financiado={r.financiado} i={r.i} n={r.prazo} />
        </section>
      )}

      {/* ── Comparativo entre bancos ── */}
      {comparativo.length > 1 && (
        <section className="rounded-[20px] border border-line bg-surface p-4">
          <p className="rotulo-campo mb-2">Mesma simulação em cada banco</p>
          <ol className="space-y-1">
            {comparativo.map(({ banco: b, r: rb }, i) => (
              <li key={b.id}>
                <button type="button" onClick={() => muda({ bancoId: b.id, taxaAnual: null })}
                        className={`w-full flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-[13px] cursor-pointer hover:bg-s2
                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${b.id === banco.id ? 'bg-s2' : ''}`}>
                  <span className="text-t1 font-semibold">{i + 1}. {b.nome} <span className="text-t4 font-normal">{pct(rb.taxaAnual)}</span></span>
                  <span className="tabular-nums text-t1">renda {brl(rb.rendaNecessaria, 0)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Ações ── */}
      <div className="grid gap-2">
        <button type="button" onClick={() => void gerarResumo()} disabled={!r?.valido || gerando}
                className="inline-flex items-center justify-center gap-2 h-11 rounded-[12px] bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover
                           text-[14px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          {gerando ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Download size={15} aria-hidden />}
          Gerar resumo pro cliente
        </button>
        {onSalvarNoLead && (
          <button type="button" onClick={onSalvarNoLead} disabled={!r?.valido || salvando}
                  className="inline-flex items-center justify-center gap-2 h-11 rounded-[12px] border border-line bg-surface text-t1 hover:bg-s2
                             text-[14px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
            {salvando ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Save size={15} aria-hidden />}
            Salvar simulação no lead
          </button>
        )}
      </div>

      <p className="text-[11.5px] text-t4 leading-relaxed">{AVISO_LEGAL}</p>

      {/* A arte do PNG fica fora da tela: é gerada dela, não da prévia. */}
      {r?.valido && (
        <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
          <ResumoCliente
            ref={cartao} r={r} banco={banco.nome} sistema={e.sistema}
            valorImovel={valorImovel} pagoAteChaves={pagoAteChaves} mesesAteEntrega={meses}
            indiceNome={NOME_INDICE[indice]} indiceAnual={indiceAnual}
            cliente={cliente} empreendimento={empreendimento} corretor={corretor}
          />
        </div>
      )}
    </div>
  )
}

/** SAC caindo e Price reta, ao longo do prazo (sem encargos). */
function GraficoParcelas({ financiado, i, n }: { financiado: number; i: number; n: number }) {
  const sac = useMemo(() => evolucaoParcela('sac', financiado, i, n), [financiado, i, n])
  const price = useMemo(() => evolucaoParcela('price', financiado, i, n), [financiado, i, n])
  const opcao = useCallback((t: CoresGrafico) => ({
    grid: { left: 8, right: 8, top: 24, bottom: 4, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 3, textStyle: { color: t.textoFraco, fontSize: 11 } },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => brl(v) },
    xAxis: {
      type: 'value', min: 1, max: n, axisLabel: { color: t.textoFraco, fontSize: 10, formatter: (v: number) => `${Math.round(v / 12)}a` },
      splitLine: { show: false }, axisLine: { lineStyle: { color: t.linha } },
    },
    yAxis: eixoValor(t, v => `${Math.round(v / 1000)} mil`),
    series: [
      { name: 'SAC', type: 'line', showSymbol: false, data: sac.map(p => [p.mes, p.parcela]), lineStyle: { width: 2.2, color: t.marca }, itemStyle: { color: t.marca } },
      { name: 'Price', type: 'line', showSymbol: false, data: price.map(p => [p.mes, p.parcela]), lineStyle: { width: 2, color: t.info, type: 'dashed' }, itemStyle: { color: t.info } },
    ],
  }), [sac, price, n])
  return <Grafico opcao={opcao} altura={170} rotulo={`Parcela ao longo de ${n} meses: SAC começa em ${brl(sac[0]?.parcela ?? 0)} e termina em ${brl(sac[sac.length - 1]?.parcela ?? 0)}; Price fica em ${brl(price[0]?.parcela ?? 0)}.`} />
}
