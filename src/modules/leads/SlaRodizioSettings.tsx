import { useEffect, useMemo, useState } from 'react'
import { Timer, Loader2, Info, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSlaConfigStore } from '../../store/useSlaConfigStore'
import { SlaDia } from '../../types'

/**
 * Rodízio por tempo de resposta (o "ping-pong" do lead Meta).
 *
 * Se o corretor não registra o 1º contato (WhatsApp) no prazo, o lead passa
 * para o próximo corretor do rodízio do formulário. O admin decide aqui:
 *   • liga/desliga — salva na hora, como o liga/desliga das campanhas;
 *   • prazo em minutos e a agenda da semana — salvos juntos no botão.
 * O relógio só corre dentro da agenda; fora dela ninguém perde lead.
 * Tudo é validado no banco (set_lead_sla_config); a tela mostra o que voltou.
 */

// Segunda primeiro, como a semana de trabalho é lida; o índice é o do banco.
const DIAS: { idx: number; curto: string; nome: string }[] = [
  { idx: 1, curto: 'Seg', nome: 'Segunda' },
  { idx: 2, curto: 'Ter', nome: 'Terça' },
  { idx: 3, curto: 'Qua', nome: 'Quarta' },
  { idx: 4, curto: 'Qui', nome: 'Quinta' },
  { idx: 5, curto: 'Sex', nome: 'Sexta' },
  { idx: 6, curto: 'Sáb', nome: 'Sábado' },
  { idx: 0, curto: 'Dom', nome: 'Domingo' },
]

const campoHora = `bg-s2 border border-line rounded-[10px] px-2.5 h-10 text-sm text-t1 tabular-nums
  focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-40`

export function SlaRodizioSettings() {
  const { config, loading, error, load, save } = useSlaConfigStore()
  const [minutos, setMinutos] = useState('')
  const [agenda,  setAgenda]  = useState<SlaDia[]>([])
  const [salvando, setSalvando] = useState<'toggle' | 'agenda' | null>(null)

  useEffect(() => { void load(true) }, [load])

  // O rascunho parte sempre do que está no banco.
  useEffect(() => {
    if (!config) return
    setMinutos(String(config.minutes))
    setAgenda(config.schedule.map(d => ({ ...d })))
  }, [config])

  const alterado = useMemo(() => {
    if (!config) return false
    return Number(minutos) !== config.minutes || JSON.stringify(agenda) !== JSON.stringify(config.schedule)
  }, [config, minutos, agenda])

  const problema = useMemo(() => {
    const m = Number(minutos)
    if (!minutos || !Number.isInteger(m) || m < 1 || m > 240) return 'O prazo precisa ficar entre 1 e 240 minutos.'
    if (!agenda.some(d => d.on)) return 'Deixe pelo menos um dia na agenda — para parar, desligue o rodízio.'
    const errado = DIAS.find(d => agenda[d.idx]?.on && agenda[d.idx].start >= agenda[d.idx].end)
    if (errado) return `${errado.nome}: o início precisa ser antes do fim.`
    return null
  }, [minutos, agenda])

  function mudarDia(idx: number, patch: Partial<SlaDia>) {
    setAgenda(a => a.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }

  async function alternar() {
    if (!config) return
    setSalvando('toggle')
    try {
      const novo = await save(!config.enabled, config.minutes, config.schedule)
      toast.success(novo.enabled ? 'Rodízio ligado — vale para os próximos prazos' : 'Rodízio desligado — ninguém perde lead por tempo')
    } catch { /* erro já toastado pela camada db */ }
    finally { setSalvando(null) }
  }

  async function salvarAgenda() {
    if (!config || problema) return
    setSalvando('agenda')
    try {
      await save(config.enabled, Number(minutos), agenda)
      toast.success('Prazo e agenda salvos')
    } catch { /* erro já toastado pela camada db */ }
    finally { setSalvando(null) }
  }

  function descartar() {
    if (!config) return
    setMinutos(String(config.minutes))
    setAgenda(config.schedule.map(d => ({ ...d })))
  }

  const ligado = config?.enabled ?? false

  return (
    <section className="rounded-[14px] border border-line bg-s2/40 overflow-hidden" aria-labelledby="sla-rodizio-titulo">
      <div className="flex items-start gap-3 px-4 py-3.5 border-b border-line">
        <div className="w-9 h-9 rounded-[10px] bg-brand-tint border border-brand/25 flex items-center justify-center flex-shrink-0">
          <Timer size={15} strokeWidth={1.6} className="text-brand" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="sla-rodizio-titulo" className="font-heading text-sm font-bold text-t1">Rodízio por tempo de resposta</h3>
          <p className="text-xs text-t3 mt-0.5">
            Se o corretor não chamar o lead no WhatsApp dentro do prazo, o lead passa para o próximo corretor do rodízio.
          </p>
        </div>

        {config && (
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <span className={`text-xs font-semibold ${ligado ? 'text-success' : 'text-t3'}`}>
              {salvando === 'toggle' ? <Loader2 size={12} className="animate-spin inline" aria-hidden /> : ligado ? 'Ligado' : 'Desligado'}
            </span>
            <button
              type="button"
              onClick={alternar}
              disabled={salvando !== null || alterado}
              title={alterado ? 'Salve ou desfaça o prazo e a agenda antes de ligar/desligar' : undefined}
              role="switch"
              aria-checked={ligado}
              aria-label={ligado ? 'Desligar rodízio por tempo de resposta' : 'Ligar rodízio por tempo de resposta'}
              className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 cursor-pointer"
              style={{ background: ligado ? 'var(--brand)' : 'var(--line-strong)' }}
            >
              <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
                style={{ left: ligado ? '1.375rem' : '2px' }} />
            </button>
          </div>
        )}
      </div>

      {loading && !config ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={18} className="animate-spin text-brand" strokeWidth={1.6} aria-label="Carregando" />
        </div>
      ) : error || !config ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
          <p className="text-sm font-medium text-error">Não foi possível carregar o rodízio.</p>
          <button type="button" onClick={() => void load(true)}
            className="text-xs font-semibold text-t2 underline underline-offset-2 cursor-pointer">
            Tentar de novo
          </button>
        </div>
      ) : (
        <div className={`px-4 py-4 flex flex-col gap-4 ${ligado ? '' : 'opacity-70'}`}>
          {/* Prazo */}
          <label className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-t2">Prazo para o 1º contato</span>
            <span className="relative inline-flex items-center">
              <input
                type="text"
                inputMode="numeric"
                value={minutos}
                onChange={e => setMinutos(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className={`${campoHora} w-24 pr-11 text-right`}
                aria-label="Prazo em minutos"
              />
              <span className="absolute right-3 text-xs text-t3 pointer-events-none">min</span>
            </span>
          </label>

          {/* Agenda */}
          <div>
            <p className="font-label text-[11px] uppercase tracking-wide text-t4 mb-2">Quando o relógio corre</p>
            <ul className="flex flex-col divide-y divide-line rounded-[12px] border border-line bg-s2/60">
              {DIAS.map(d => {
                const dia = agenda[d.idx]
                if (!dia) return null
                return (
                  <li key={d.idx} className="flex items-center gap-3 px-3 py-2 min-h-[52px]">
                    <button
                      type="button"
                      onClick={() => mudarDia(d.idx, { on: !dia.on })}
                      role="switch"
                      aria-checked={dia.on}
                      aria-label={`${d.nome}: ${dia.on ? 'com rodízio' : 'sem rodízio'}`}
                      className={`w-14 h-9 rounded-[10px] border text-xs font-bold transition-colors cursor-pointer flex-shrink-0
                        ${dia.on ? 'bg-brand-tint border-brand/40 text-brand-text' : 'bg-s2 border-line text-t4'}`}
                    >
                      {d.curto}
                    </button>
                    {dia.on ? (
                      <div className="flex items-center gap-2 text-sm text-t3">
                        <input type="time" value={dia.start} step={300}
                          onChange={e => mudarDia(d.idx, { start: e.target.value })}
                          className={campoHora} aria-label={`${d.nome}: início`} />
                        <span aria-hidden>às</span>
                        <input type="time" value={dia.end} step={300}
                          onChange={e => mudarDia(d.idx, { end: e.target.value })}
                          className={campoHora} aria-label={`${d.nome}: fim`} />
                      </div>
                    ) : (
                      <span className="text-sm text-t4">Sem rodízio — o relógio para</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-t3">
            <Info size={12} strokeWidth={1.6} className="flex-shrink-0 mt-0.5" aria-hidden />
            <span>
              Lead que chega fora desses horários começa a contar no início da próxima janela.
              {ligado
                ? ' Mudanças valem para os próximos prazos.'
                : ' Desligado: o prazo continua aparecendo no card como meta, mas ninguém perde o lead.'}
            </span>
          </p>

          {(alterado || problema) && (
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {problema && <span className="text-xs text-error mr-auto" role="alert">{problema}</span>}
              <button type="button" onClick={descartar} disabled={salvando !== null}
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-[10px] text-sm font-medium text-t2 hover:bg-s3 cursor-pointer disabled:opacity-50">
                <RotateCcw size={14} strokeWidth={1.8} aria-hidden /> Desfazer
              </button>
              <button type="button" onClick={salvarAgenda} disabled={!!problema || salvando !== null || !alterado}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {salvando === 'agenda' && <Loader2 size={14} className="animate-spin" aria-hidden />}
                Salvar prazo e agenda
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
