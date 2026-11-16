import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Hourglass, X } from 'lucide-react'
import type { Lead, LeadFunnelStage } from '../../types'
import { MAX_TENTATIVAS_FOLLOWUP } from '../../types'
import { STAGE_THEME } from '../../lib/stageTheme'
import { formatCurrency } from '../../lib/formatters'
import { useAuthStore } from '../../store/useAuthStore'
import { useContagem } from '../../hooks/useContagem'
import { Destaque, destacar } from '../../components/shared/Destaque'
import { TOM } from '../../components/shared/visual'
import { diasSemContato, nivelContato, ESFRIANDO_DIAS, PARADO_DIAS } from './contato'
import type { NivelContato } from './contato'
import {
  ETAPAS_FOLLOWUP, FAIXAS, ativosParaFollowup, filtrarFollowup, followupPorCorretor,
  leiturasFollowup, matrizFollowup, resumoFollowup, textoDias,
} from './followup'
import type { FaixaId, FiltroFollowup, LinhaCorretor } from './followup'

/**
 * Leads › Followup — criada em 15/11/2026.
 *
 * Mostra onde o funil está em silêncio: quantos leads estão sem contato, há
 * quanto tempo, em que etapa e com qual corretor. Serve para o gestor achar a
 * brecha e cobrar; para o corretor, é a lista de quem ele deixou esperando.
 *
 * Como ler a tela, de cima para baixo:
 *   1. O anel: que parte da carteira recebeu contato nos últimos 2 dias.
 *   2. As leituras: o que os números dizem, em frases.
 *   3. O mapa: etapa × dias sem contato. Clicar numa célula filtra a lista.
 *   4. Por corretor: clicar num corretor refaz a tela inteira só para ele.
 *   5. A lista: quem está esperando há mais tempo, primeiro. Clicar abre o lead.
 *
 * Tudo sai dos leads já em memória (`useLeadsStore`, carga única + realtime):
 * a aba não faz nenhuma consulta. O relógio local só reescreve "há X dias".
 */

interface Props {
  leads: Lead[]
  onOpenLead: (lead: Lead) => void
}

const NIVEL: Record<NivelContato, { rotulo: string; cor: string; texto: string; ponto: string; nota: string }> = {
  em_dia:    { rotulo: 'Em dia',    cor: 'var(--success)', texto: 'text-success', ponto: 'bg-success', nota: `contato nos últimos ${ESFRIANDO_DIAS} dias` },
  esfriando: { rotulo: 'Esfriando', cor: 'var(--warning)', texto: 'text-warning', ponto: 'bg-warning', nota: `de ${ESFRIANDO_DIAS} a ${PARADO_DIAS} dias sem contato` },
  parado:    { rotulo: 'Parados',   cor: 'var(--error)',   texto: 'text-error',   ponto: 'bg-error',   nota: `${PARADO_DIAS} dias ou mais sem contato` },
}

const SEM_CORRETOR = '__sem__'
const PASSO_LISTA = 25

export function LeadFollowupTab({ leads, onOpenLead }: Props) {
  const { isAdmin, profile, allProfiles, fetchAllProfiles } = useAuthStore()
  const [agora, setAgora] = useState(() => Date.now())
  const [corretorSel, setCorretorSel] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroFollowup>({})
  const [limite, setLimite] = useState(PASSO_LISTA)

  // Relógio local — só reescreve os "há X dias". Não toca a rede.
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => { if (isAdmin && allProfiles.length === 0) void fetchAllProfiles() }, [isAdmin, allProfiles.length, fetchAllProfiles])
  useEffect(() => { setLimite(PASSO_LISTA) }, [filtro, corretorSel])

  const nomeCorretor = (id: string | null) =>
    id === null ? undefined : allProfiles.find(p => p.id === id)?.name ?? (id === profile?.id ? profile.name : undefined)

  const base    = useMemo(() => ativosParaFollowup(leads), [leads])
  const escopo  = useMemo(
    () => (corretorSel ? base.filter(l => (l.brokerId ?? SEM_CORRETOR) === corretorSel) : base),
    [base, corretorSel],
  )
  const resumo     = useMemo(() => resumoFollowup(escopo, agora), [escopo, agora])
  const matriz     = useMemo(() => matrizFollowup(escopo, agora), [escopo, agora])
  const corretores = useMemo(() => followupPorCorretor(base, agora), [base, agora])
  const lista      = useMemo(() => filtrarFollowup(escopo, filtro, agora), [escopo, filtro, agora])
  const leituras   = leiturasFollowup(escopo, resumo, corretorSel ? [] : corretores, nomeCorretor, formatCurrency, agora)

  const nomeSel = corretorSel
    ? (corretorSel === SEM_CORRETOR ? 'Sem corretor' : nomeCorretor(corretorSel) ?? 'Corretor')
    : null
  const temFiltro = !!(filtro.etapa || filtro.faixa || filtro.nivel || filtro.nunca)

  if (base.length === 0) {
    return (
      <div className="bento px-6 py-14 text-center">
        <p className="font-display text-[16px] font-bold text-t1">{destacar('Nenhum lead *ativo* por aqui')}</p>
        <p className="text-[14px] text-t3 mt-1.5">Quando houver leads no funil, esta aba mostra quem está sem contato e há quanto tempo.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-10 stagger-children">

      {/* ── Topo ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
          <h2 className="font-display text-[18px] font-bold tracking-[-0.02em] text-t1">
            Followup da <Destaque>carteira</Destaque>
          </h2>
          {nomeSel && (
            <button type="button" onClick={() => setCorretorSel(null)}
              className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-brand-tint text-brand-text text-[13px] font-semibold cursor-pointer hover:brightness-95
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              aria-label={`Vendo só ${nomeSel}. Voltar para todos`}>
              {nomeSel} <X size={14} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
        <p className="text-[13px] text-t3 mt-1.5">
          O relógio conta desde o último WhatsApp, ligação ou tarefa concluída. Sem nenhum contato, conta desde a entrada do lead.
        </p>
      </div>

      {/* ── O retrato: anel + níveis ──────────────────────────────────────── */}
      <section className="bento p-5 lg:p-7 flex flex-col md:flex-row md:items-center gap-6 lg:gap-10" aria-label="Situação do followup">
        <Anel pct={resumo.pctEmDia} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[20px] lg:text-[22px] font-bold tracking-[-0.02em] text-t1 leading-snug" style={{ textWrap: 'balance' } as React.CSSProperties}>
            {resumo.emDia.toLocaleString('pt-BR')} de {resumo.total.toLocaleString('pt-BR')} leads receberam contato nos últimos {ESFRIANDO_DIAS} dias.
          </p>
          <p className="text-[13.5px] text-t3 mt-1.5">
            Maior silêncio: {textoDias(resumo.maiorSilencio)}
            {resumo.valorParado > 0 && <> · {formatCurrency(resumo.valorParado)} em negociação parada</>}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
            {(['em_dia', 'esfriando', 'parado'] as NivelContato[]).map(nv => (
              <BotaoNivel key={nv}
                rotulo={NIVEL[nv].rotulo} nota={NIVEL[nv].nota} ponto={NIVEL[nv].ponto} cor={NIVEL[nv].cor}
                valor={nv === 'em_dia' ? resumo.emDia : nv === 'esfriando' ? resumo.esfriando : resumo.parado}
                total={resumo.total}
                ativo={filtro.nivel === nv}
                onClick={() => setFiltro(f => (f.nivel === nv ? {} : { nivel: nv }))} />
            ))}
            <BotaoNivel
              rotulo="Nunca contatados" nota="nenhum contato registrado" ponto="bg-t4" cor="var(--t4)"
              valor={resumo.nunca} total={resumo.total}
              ativo={!!filtro.nunca}
              onClick={() => setFiltro(f => (f.nunca ? {} : { nunca: true }))} />
          </div>
        </div>
      </section>

      {/* ── O que os números dizem ────────────────────────────────────────── */}
      {leituras.length > 0 && (
        <section aria-label="Leitura do followup" className="px-1">
          <ul className="flex flex-col gap-2">
            {leituras.map((l, i) => (
              <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed text-t2">
                <span className={`mt-[9px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${TOM[l.tom].ponto}`} aria-hidden />
                <span>{l.texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Mapa do silêncio + corretores ─────────────────────────────────── */}
      <div className={`grid grid-cols-1 gap-5 ${corretores.length > 1 ? 'xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}>
        <section className="bento p-5 lg:p-6 min-w-0">
          <Titulo descricao="Etapa do funil × dias sem contato. Toque em um número para ver os leads.">
            Onde está o *silêncio*
          </Titulo>
          <Mapa matriz={matriz} filtro={filtro} onFiltro={setFiltro} />
        </section>

        {corretores.length > 1 && (
          <section className="bento p-5 lg:p-6 min-w-0">
            <Titulo descricao="Toque em um corretor para ver a tela só dele.">Por *corretor*</Titulo>
            <ul className="flex flex-col gap-1.5">
              {corretores.map(c => {
                const chave = c.brokerId ?? SEM_CORRETOR
                return (
                  <li key={chave}>
                    <LinhaDoCorretor
                      linha={c}
                      nome={c.brokerId === null ? 'Sem corretor' : nomeCorretor(c.brokerId) ?? 'Corretor'}
                      ativo={corretorSel === chave}
                      onClick={() => setCorretorSel(s => (s === chave ? null : chave))} />
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>

      {/* ── Quem está esperando ───────────────────────────────────────────── */}
      <section className="bento min-w-0 overflow-hidden">
        <div className="flex items-start justify-between gap-3 flex-wrap px-5 lg:px-6 pt-5">
          <Titulo descricao="Do silêncio mais longo para o mais curto. Toque em um lead para abrir.">
            Quem está *esperando*
          </Titulo>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] text-t3 tabular-nums">
              {lista.length.toLocaleString('pt-BR')} {lista.length === 1 ? 'lead' : 'leads'}
            </span>
            {temFiltro && (
              <button type="button" onClick={() => setFiltro({})}
                className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-s2 text-[13px] font-medium text-t1 cursor-pointer hover:bg-s3
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                {descreverFiltro(filtro)} <X size={14} strokeWidth={2} aria-hidden />
                <span className="sr-only">Limpar filtro</span>
              </button>
            )}
          </div>
        </div>

        {lista.length === 0 ? (
          <p className="text-[14px] text-t3 px-5 lg:px-6 pb-8">Nenhum lead neste recorte.</p>
        ) : (
          <>
            <ul className="divide-y divide-line border-t border-line">
              {lista.slice(0, limite).map(l => (
                <li key={l.id}>
                  <LinhaDoLead lead={l} agora={agora} corretor={nomeCorretor(l.brokerId ?? null)} onOpen={() => onOpenLead(l)} />
                </li>
              ))}
            </ul>
            {lista.length > limite && (
              <div className="border-t border-line px-5 py-3 text-center">
                <button type="button" onClick={() => setLimite(n => n + PASSO_LISTA)}
                  className="h-10 px-4 rounded-[12px] text-[13.5px] font-semibold text-t1 bg-s2 hover:bg-s3 cursor-pointer
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
                  Mostrar mais {Math.min(PASSO_LISTA, lista.length - limite)} de {(lista.length - limite).toLocaleString('pt-BR')}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// ─── Peças ────────────────────────────────────────────────────────────────────

function Titulo({ children, descricao }: { children: string; descricao?: string }) {
  return (
    <div className="mb-4 min-w-0">
      <h3 className="font-display text-[16px] font-bold tracking-[-0.015em] text-t1">{destacar(children)}</h3>
      {descricao && <p className="text-[13px] text-t3 mt-0.5">{descricao}</p>}
    </div>
  )
}

function descreverFiltro(f: FiltroFollowup): string {
  const partes: string[] = []
  if (f.etapa) partes.push(STAGE_THEME[f.etapa].label)
  if (f.faixa) partes.push(FAIXAS.find(x => x.id === f.faixa)!.rotulo)
  if (f.nivel) partes.push(NIVEL[f.nivel].rotulo)
  if (f.nunca) partes.push('Nunca contatados')
  return partes.join(' · ')
}

/** O anel enche até a parcela em dia; a cor diz se o número é bom, médio ou ruim. */
function Anel({ pct }: { pct: number | null }) {
  const alvo = pct ?? 0
  const contado = useContagem(Math.round(alvo))
  const R = 54, C = 2 * Math.PI * R
  const [p, setP] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setP(alvo))
    return () => cancelAnimationFrame(id)
  }, [alvo])
  const cor = alvo >= 70 ? 'var(--success)' : alvo >= 40 ? 'var(--warning)' : 'var(--error)'
  const leitura = pct === null ? 'sem leads' : alvo >= 70 ? 'carteira bem cuidada' : alvo >= 40 ? 'metade no escuro' : 'maioria sem contato'

  return (
    <div className="relative w-[156px] h-[156px] flex-shrink-0 mx-auto md:mx-0" role="img"
         aria-label={pct === null ? 'Sem leads para medir' : `${Math.round(alvo)}% da carteira em dia: ${leitura}`}>
      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="11" style={{ stroke: 'var(--surface-3)' }} />
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="11" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(100, p) / 100)}
          style={{ stroke: cor, transition: 'stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-[34px] font-extrabold tracking-[-0.03em] tabular-nums leading-none text-t1">
          {pct === null ? '—' : `${contado}%`}
        </span>
        <span className="text-[12px] text-t3 mt-1.5">em dia</span>
      </div>
    </div>
  )
}

function BotaoNivel({ rotulo, nota, ponto, cor, valor, total, ativo, onClick }: {
  rotulo: string; nota: string; ponto: string; cor: string
  valor: number; total: number; ativo: boolean; onClick: () => void
}) {
  const contado = useContagem(valor)
  const parte = total > 0 ? (valor / total) * 100 : 0
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(parte))
    return () => cancelAnimationFrame(id)
  }, [parte])
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} title={`${rotulo}: ${nota}`}
      className={`group text-left rounded-[14px] px-3.5 py-3 min-w-0 cursor-pointer transition-[background-color,transform] duration-150 active:scale-[0.98]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                  ${ativo ? 'bg-s3 ring-1 ring-line-strong' : 'bg-s2 hover:bg-s3'}`}>
      <span className="flex items-center gap-1.5 text-[12.5px] text-t3">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ponto}`} aria-hidden />
        <span className="truncate">{rotulo}</span>
      </span>
      <span className="block font-display text-[26px] font-extrabold tracking-[-0.025em] tabular-nums leading-none text-t1 mt-2">
        {contado.toLocaleString('pt-BR')}
      </span>
      <span className="block h-1 rounded-full bg-surface mt-3 overflow-hidden" aria-hidden>
        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${w}%`, background: cor }} />
      </span>
      <span className="block text-[11.5px] text-t4 mt-1.5 truncate">{nota}</span>
    </button>
  )
}

/** Etapa × faixa de dias. A intensidade da cor é o volume; a cor é o nível. */
function Mapa({ matriz, filtro, onFiltro }: {
  matriz: ReturnType<typeof matrizFollowup>
  filtro: FiltroFollowup
  onFiltro: (f: FiltroFollowup) => void
}) {
  const maior = Math.max(1, ...ETAPAS_FOLLOWUP.flatMap(e => FAIXAS.map(f => matriz[e][f.id])))
  const totalFaixa = (id: FaixaId) => ETAPAS_FOLLOWUP.reduce((s, e) => s + matriz[e][id], 0)
  const totalEtapa = (e: LeadFunnelStage) => FAIXAS.reduce((s, f) => s + matriz[e][f.id], 0)
  const alternar = (novo: FiltroFollowup) => {
    const igual = (filtro.etapa ?? null) === (novo.etapa ?? null) && (filtro.faixa ?? null) === (novo.faixa ?? null)
      && !filtro.nivel && !filtro.nunca
    onFiltro(igual ? {} : novo)
  }
  const foco = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50'

  return (
    <div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'minmax(104px, 1.4fr) repeat(7, minmax(0, 1fr))' }}>
        <span aria-hidden />
        {FAIXAS.map(f => {
          const sel = filtro.faixa === f.id && !filtro.etapa
          return (
            <button key={f.id} type="button" onClick={() => alternar({ faixa: f.id })} aria-pressed={sel}
              aria-label={`${f.rotulo}: ${totalFaixa(f.id)} leads`}
              className={`rounded-[8px] pb-1.5 pt-1 text-center cursor-pointer hover:bg-s2 ${foco} ${sel ? 'bg-s2' : ''}`}>
              <span className="block text-[11.5px] text-t3 whitespace-nowrap">{f.curto}</span>
              <span className="block h-[3px] rounded-full mx-1.5 mt-1" style={{ background: NIVEL[f.nivel].cor, opacity: 0.75 }} aria-hidden />
            </button>
          )
        })}

        {ETAPAS_FOLLOWUP.map((e, linha) => (
          <FragmentoLinha key={e}>
            <button type="button" onClick={() => alternar({ etapa: e })}
              aria-pressed={filtro.etapa === e && !filtro.faixa}
              aria-label={`${STAGE_THEME[e].label}: ${totalEtapa(e)} leads`}
              className={`flex items-center gap-2 min-w-0 rounded-[10px] px-2 h-12 text-left cursor-pointer hover:bg-s2 ${foco}
                          ${filtro.etapa === e && !filtro.faixa ? 'bg-s2' : ''}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STAGE_THEME[e].dot}`} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-t1 truncate">{STAGE_THEME[e].label}</span>
                <span className="block text-[11.5px] text-t4 tabular-nums">{totalEtapa(e)}</span>
              </span>
            </button>
            {FAIXAS.map((f, coluna) => {
              const v = matriz[e][f.id]
              const sel = filtro.etapa === e && filtro.faixa === f.id
              const forca = 14 + Math.round((v / maior) * 58)
              return (
                <button key={f.id} type="button" disabled={v === 0}
                  onClick={() => alternar({ etapa: e, faixa: f.id })} aria-pressed={sel}
                  aria-label={`${STAGE_THEME[e].label}, ${f.rotulo}: ${v} ${v === 1 ? 'lead' : 'leads'}`}
                  className={`h-12 rounded-[10px] flex items-center justify-center font-display text-[15px] font-extrabold tabular-nums
                              transition-transform duration-150 ${foco}
                              ${v === 0 ? 'text-t5 cursor-default' : 'text-t1 cursor-pointer hover:scale-[1.06] active:scale-[0.97]'}
                              ${sel ? 'ring-2 ring-t1' : ''}`}
                  style={{
                    background: v === 0 ? 'var(--surface-2)' : `color-mix(in srgb, ${NIVEL[f.nivel].cor} ${forca}%, var(--surface))`,
                    animation: 'slideUp 320ms cubic-bezier(0.16,1,0.3,1) backwards',
                    animationDelay: `${(linha * 7 + coluna) * 16}ms`,
                  }}>
                  {v === 0 ? '·' : v.toLocaleString('pt-BR')}
                </button>
              )
            })}
          </FragmentoLinha>
        ))}
      </div>
      <Legenda />
    </div>
  )
}

function FragmentoLinha({ children }: { children: React.ReactNode }) { return <>{children}</> }

function Legenda() {
  return (
    <p className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px] text-t3 mt-4">
      {(['em_dia', 'esfriando', 'parado'] as NivelContato[]).map(nv => (
        <span key={nv} className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${NIVEL[nv].ponto}`} aria-hidden />
          {NIVEL[nv].rotulo}: {NIVEL[nv].nota}
        </span>
      ))}
    </p>
  )
}

function LinhaDoCorretor({ linha, nome, ativo, onClick }: {
  linha: LinhaCorretor; nome: string; ativo: boolean; onClick: () => void
}) {
  const partes: [NivelContato, number][] = [['em_dia', linha.emDia], ['esfriando', linha.esfriando], ['parado', linha.parado]]
  const [pronto, setPronto] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setPronto(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const pct = linha.pctEmDia === null ? null : Math.round(linha.pctEmDia)

  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      aria-label={`${nome}: ${linha.total} leads, ${linha.parado} parados, ${pct ?? 0}% em dia. ${ativo ? 'Voltar para todos' : 'Ver só este corretor'}`}
      className={`w-full text-left rounded-[14px] px-3.5 py-3 cursor-pointer transition-[background-color,transform] duration-150 active:scale-[0.99]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                  ${ativo ? 'bg-s2 ring-1 ring-line-strong' : 'hover:bg-s2'}`}>
      <span className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-brand-fill text-brand-fill-text flex items-center justify-center text-[14px] font-bold flex-shrink-0" aria-hidden>
          {nome.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold text-t1 truncate">{nome}</span>
          <span className="block text-[12.5px] text-t3 truncate tabular-nums">
            {linha.total.toLocaleString('pt-BR')} leads · maior silêncio {textoDias(linha.maiorSilencio)}
          </span>
        </span>
        <span className="text-right flex-shrink-0">
          <span className="block font-display text-[19px] font-extrabold tabular-nums leading-none text-t1">{pct === null ? '—' : `${pct}%`}</span>
          <span className="block text-[11.5px] text-t4 mt-1">em dia</span>
        </span>
      </span>
      <span className="flex h-2 rounded-full overflow-hidden bg-s3 mt-3 gap-[2px]" aria-hidden>
        {partes.map(([nv, v]) => v > 0 && (
          <span key={nv} className="h-full rounded-full transition-[flex-grow] duration-700"
            style={{ flexGrow: pronto ? v : 0, flexBasis: 0, background: NIVEL[nv].cor }} />
        ))}
      </span>
      <span className="flex items-center gap-x-3 text-[12px] text-t3 mt-2 tabular-nums">
        {partes.map(([nv, v]) => (
          <span key={nv} className="inline-flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${NIVEL[nv].ponto}`} aria-hidden />
            {v.toLocaleString('pt-BR')} {NIVEL[nv].rotulo.toLowerCase()}
          </span>
        ))}
      </span>
    </button>
  )
}

function LinhaDoLead({ lead, agora, corretor, onOpen }: {
  lead: Lead; agora: number; corretor?: string; onOpen: () => void
}) {
  const dias = diasSemContato(lead, agora)
  const nv = nivelContato(lead, agora)
  const meta = [
    STAGE_THEME[lead.funnelStage].label,
    lead.propertyName,
    corretor?.split(' ')[0],
    lead.funnelStage === 'followup' && lead.followupStep > 0 ? `tentativa ${lead.followupStep} de ${MAX_TENTATIVAS_FOLLOWUP}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <button type="button" onClick={onOpen}
      className="group w-full flex items-center gap-3.5 px-5 lg:px-6 py-3 min-h-[56px] text-left hover:bg-s2 cursor-pointer
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40">
      <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: NIVEL[nv].cor }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-t1 truncate">{lead.name}</span>
        <span className="block text-[12.5px] text-t3 truncate">{meta}</span>
      </span>
      <span className="text-right flex-shrink-0">
        <span className={`flex items-center justify-end gap-1.5 font-display text-[16px] font-extrabold tabular-nums leading-none ${NIVEL[nv].texto}`}>
          {nv !== 'em_dia' && <Hourglass size={13} strokeWidth={2} aria-hidden />}
          {textoDias(dias)}
        </span>
        <span className="block text-[11.5px] text-t4 mt-1">
          {!lead.lastContactAt ? 'nunca contatado' : dias === 0 ? 'último contato' : 'sem contato'}
        </span>
      </span>
      <ChevronRight size={15} strokeWidth={1.8} className="text-t4 flex-shrink-0" aria-hidden />
    </button>
  )
}
