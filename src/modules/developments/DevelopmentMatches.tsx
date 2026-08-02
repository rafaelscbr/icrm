import { useEffect, useState } from 'react'
import { Users, Download, Loader2, Sparkles, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { DevelopmentMatches as Matches, DevelopmentMatch, Development } from '../../types'
import { FIT_COLOR, FIT_LABEL, FIT_TEXT, Fit } from '../../lib/intelligence'
import { formatCurrencyRound, formatPhone } from '../../lib/formatters'

/**
 * Matching reverso: quem da base cabe neste empreendimento.
 *
 * É o outro lado da conta que o painel do lead já faz. Lá, "que produto serve
 * para esta pessoa"; aqui, "que pessoas servem para este produto" — e é isto
 * que transforma um lançamento novo em lista de trabalho no mesmo dia, em vez
 * de esperar a próxima campanha trazer de fora gente que já estava na base.
 */

const ORDEM_FIT: Fit[] = ['ideal', 'possivel', 'dificil', 'sem_dados']

/** Escapa campo de CSV: aspas dobradas e o valor entre aspas. */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function exportarCSV(dev: Development, leads: DevelopmentMatch[]) {
  const cab = [
    'Nome', 'Telefone', 'E-mail', 'Encaixe', 'Unidade sugerida', 'Preço',
    'Renda declarada', 'Entrada declarada', 'Objetivo', 'Etapa',
    'Veio deste produto', 'Entrou em',
  ]
  const linhas = leads.map(l => [
    l.name, formatPhone(l.phone), l.email ?? '',
    FIT_LABEL[l.fit],
    l.unit?.name ?? '',
    l.unit?.price != null ? formatCurrencyRound(l.unit.price) : '',
    l.renda ?? '', l.entrada ?? '', l.objetivo ?? '', l.stage,
    l.isOrigin ? 'sim' : 'não',
    new Date(l.createdAt).toLocaleDateString('pt-BR'),
  ].map(csvCell).join(';'))

  // BOM + ';' — o Excel em pt-BR abre assim sem pedir importação e sem quebrar
  // acento. Vírgula abriria tudo numa coluna só.
  const csv = '﻿' + [cab.map(csvCell).join(';'), ...linhas].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const dia  = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `leads-${dev.name.toLowerCase().replace(/\s+/g, '-')}-${dia}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`${leads.length} lead(s) exportado(s)`)
}

export function DevelopmentMatches({ development }: { development: Development }) {
  const [data, setData]       = useState<Matches | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro]   = useState<Fit | null>(null)
  const [aberto, setAberto]   = useState(false)

  useEffect(() => {
    if (!aberto || data) return
    let vivo = true
    setLoading(true)
    ;(async () => {
      try {
        const { data: d, error } = await supabase.rpc('development_matches', { p_dev_id: development.id })
        if (!vivo) return
        if (error) throw error
        setData(d as Matches)
      } catch (err) {
        console.error('[matches]', err)
        if (vivo) toast.error('Erro ao buscar leads compatíveis')
      } finally {
        if (vivo) setLoading(false)
      }
    })()
    return () => { vivo = false }
  }, [aberto, development.id, data])

  const lista = data?.leads.filter(l => !filtro || l.fit === filtro) ?? []

  return (
    <section className="flex flex-col gap-3">
      <button
        onClick={() => setAberto(v => !v)}
        className="flex items-center justify-between w-full group"
        aria-expanded={aberto}
      >
        <div className="flex items-center gap-2">
          <Users size={13} className="text-brand" />
          <h3 className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t2">
            Leads que cabem neste produto
          </h3>
          {data && (
            <span className="font-label text-[11px] bg-s3 text-t2 px-1.5 py-0.5 rounded-full tabular-nums">
              {data.total}
            </span>
          )}
        </div>
        <ChevronDown
          size={13} aria-hidden
          className={`text-t4 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {!aberto && (
        <p className="text-xs text-t4 -mt-1">
          Cruza o perfil declarado de toda a base com a régua deste empreendimento.
        </p>
      )}

      {aberto && loading && (
        <div className="flex items-center gap-2 py-3 text-xs text-t4">
          <Loader2 size={12} className="animate-spin" /> Cruzando com a base…
        </div>
      )}

      {aberto && !loading && data && (
        <>
          {/* Resumo — "novos" é o número que importa: quem já veio deste
              produto não é descoberta, é o óbvio. */}
          <div className="flex flex-wrap items-center gap-2">
            {ORDEM_FIT.map(f => {
              const n = data.byFit[f]
              if (!n) return null
              const ativo = filtro === f
              return (
                <button
                  key={f}
                  onClick={() => setFiltro(ativo ? null : f)}
                  aria-pressed={ativo}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px]
                              font-label uppercase tracking-[0.08em] transition-all cursor-pointer
                              ${ativo ? 'bg-s3' : 'bg-transparent hover:bg-s2'} ${FIT_TEXT[f]}`}
                  style={{ borderColor: FIT_COLOR[f] + (ativo ? '' : '55') }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: FIT_COLOR[f] }} aria-hidden />
                  {FIT_LABEL[f]}
                  <span className="tabular-nums opacity-70">{n}</span>
                </button>
              )
            })}
          </div>

          {data.novos > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-info-bg border border-info-line">
              <Sparkles size={13} className="text-info flex-shrink-0 mt-0.5" />
              <p className="text-xs text-info leading-relaxed">
                <span className="font-semibold">{data.novos}</span> desses leads vieram de
                outro produto e nunca ouviram falar do {development.name}.
              </p>
            </div>
          )}

          {lista.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-t4">
                {lista.length} {lista.length === 1 ? 'lead' : 'leads'}
                {filtro ? ` · ${FIT_LABEL[filtro]}` : ''}
              </span>
              <Button variant="secondary" size="sm" onClick={() => exportarCSV(development, lista)}>
                <Download size={12} /> Exportar CSV
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-1.5 max-h-[24rem] overflow-y-auto overscroll-contain">
            {lista.length === 0 ? (
              <p className="text-xs text-t4 py-2">Nenhum lead neste encaixe.</p>
            ) : lista.map(l => (
              <div
                key={l.leadId}
                className="flex items-start gap-2.5 p-2.5 rounded-xl border border-line bg-surface"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                  style={{ background: FIT_COLOR[l.fit] }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-t1 truncate">{l.name}</span>
                    {l.isOrigin && (
                      <span className="font-label text-[10px] uppercase tracking-[0.08em] text-t4 border border-line px-1.5 rounded-full">
                        já é deste produto
                      </span>
                    )}
                    {l.discarded && (
                      <span className="font-label text-[10px] uppercase tracking-[0.08em] text-t4">
                        descartado
                      </span>
                    )}
                  </div>
                  {/* A unidade concreta que cabe — sugerir "o produto" sem dizer
                      qual unidade deixa o corretor com a mesma dúvida de antes. */}
                  {l.unit && (
                    <p className="text-[11px] text-t3 mt-0.5">
                      {l.unit.name}
                      {l.unit.price != null && ` · ${formatCurrencyRound(l.unit.price)}`}
                      {l.unit.matchesPreference && ' · bate com a tipologia que ele quer'}
                    </p>
                  )}
                  <p className="text-[11px] text-t4 mt-0.5 truncate">
                    {[l.renda && `renda ${l.renda}`, l.entrada && `entrada ${l.entrada}`]
                      .filter(Boolean).join(' · ') || 'sem dados financeiros'}
                  </p>
                </div>
                <span className={`font-label text-[10px] uppercase tracking-[0.08em] flex-shrink-0 ${FIT_TEXT[l.fit]}`}>
                  {FIT_LABEL[l.fit]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
