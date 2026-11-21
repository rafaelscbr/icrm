import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, Loader2, RotateCcw, Info, Circle } from 'lucide-react'
import toast from 'react-hot-toast'
import { SecaoTitulo, Chip } from '../../components/shared/visual'
import { Avatar } from '../../components/ui/Avatar'
import { Interruptor } from '../leads/SecaoConfig'
import type { Profile } from '../../store/useAuthStore'
import { usePresenceStore } from '../../store/usePresenceStore'
import { mensagemDeErro } from '../../lib/erros'
import { ANCORA_AVISOS_ACESSO } from './ancora'
import {
  type ConfigAvisoAcesso, type AcessoRegistrado,
  carregarConfig, salvarConfig, acessosDeHoje,
  horariosDeAlerta, horaFalada, horaFaladaDe, situacaoDoDia,
} from './avisosAcesso'

/**
 * Avisos de acesso — só admin (fica dentro de /admin).
 *
 * Em cima, o que importa no dia: quem já entrou, a que horas, e quem está
 * online agora. Embaixo, a configuração dos dois avisos que chegam no celular:
 *   • "Ryan Maciel entrou no iCRM às 9h02" — 1º acesso do dia;
 *   • "Ryan ainda não entrou no iCRM (9h10)" — repete no intervalo até o fim.
 * Tudo é salvo de uma vez e validado no banco (set_aviso_acesso_config).
 */

// Segunda primeiro; o número é o ISO do banco (1 = segunda … 7 = domingo).
const DIAS = [
  { iso: 1, curto: 'Seg', nome: 'Segunda' },
  { iso: 2, curto: 'Ter', nome: 'Terça' },
  { iso: 3, curto: 'Qua', nome: 'Quarta' },
  { iso: 4, curto: 'Qui', nome: 'Quinta' },
  { iso: 5, curto: 'Sex', nome: 'Sexta' },
  { iso: 6, curto: 'Sáb', nome: 'Sábado' },
  { iso: 7, curto: 'Dom', nome: 'Domingo' },
]

const INTERVALOS = [30, 60, 90, 120]

const campoHora = `bg-s2 border border-line rounded-[10px] px-2.5 h-10 text-sm text-t1 tabular-nums
  focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-40`

/** O usuário de teste automatizado nunca aparece nem é acompanhado. */
function ehAcompanhavel(p: Profile): boolean {
  return p.role === 'broker' && p.active && p.name !== 'E2E Tester'
}

function igual(a: ConfigAvisoAcesso, b: ConfigAvisoAcesso): boolean {
  const norm = (c: ConfigAvisoAcesso) => JSON.stringify({
    ...c, destinatario: null, dias: [...c.dias].sort(), corretores: [...c.corretores].sort(),
  })
  return norm(a) === norm(b)
}

export function AvisosDeAcesso({ perfis }: { perfis: Profile[] }) {
  const location = useLocation()
  const online = usePresenceStore(s => s.onlineBrokers)
  const [salvo,     setSalvo]     = useState<ConfigAvisoAcesso | null>(null)
  const [rascunho,  setRascunho]  = useState<ConfigAvisoAcesso | null>(null)
  const [acessos,   setAcessos]   = useState<AcessoRegistrado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro,      setErro]      = useState<string | null>(null)
  const [salvando,  setSalvando]  = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [cfg, hoje] = await Promise.all([carregarConfig(), acessosDeHoje()])
      setSalvo(cfg)
      setRascunho(cfg)
      setAcessos(hoje)
    } catch (err) {
      console.error('[avisos-acesso]', err)
      setErro(mensagemDeErro(err))
    } finally { setCarregando(false) }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  // O toque no aviso do celular abre /admin#avisos-acesso: rola até aqui.
  useEffect(() => {
    if (location.hash !== `#${ANCORA_AVISOS_ACESSO}` || carregando) return
    document.getElementById(ANCORA_AVISOS_ACESSO)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash, carregando])

  const corretores = useMemo(
    () => perfis.filter(ehAcompanhavel).sort((a, b) => a.name.localeCompare(b.name)),
    [perfis],
  )

  const acompanhados = useMemo(
    () => corretores.filter(p => salvo?.corretores.includes(p.id)),
    [corretores, salvo],
  )

  const situacao = useMemo(
    () => situacaoDoDia(acompanhados.map(p => p.id), acessos),
    [acompanhados, acessos],
  )

  const onlineIds = useMemo(() => new Set(online.map(o => o.userId)), [online])

  const alterado = !!(salvo && rascunho && !igual(salvo, rascunho))

  const problema = useMemo(() => {
    if (!rascunho) return null
    if (rascunho.atrasoInicio > rascunho.atrasoFim) return 'O primeiro alerta precisa ser antes do último.'
    if (rascunho.atrasoAtivo && rascunho.dias.length === 0) return 'Marque pelo menos um dia — para parar, desligue o alerta.'
    return null
  }, [rascunho])

  const horarios = rascunho
    ? horariosDeAlerta(rascunho.atrasoInicio, rascunho.atrasoFim, rascunho.atrasoIntervaloMin)
    : []

  function mudar(patch: Partial<ConfigAvisoAcesso>) {
    setRascunho(r => (r ? { ...r, ...patch } : r))
  }

  function alternarDia(iso: number) {
    if (!rascunho) return
    mudar({ dias: rascunho.dias.includes(iso) ? rascunho.dias.filter(d => d !== iso) : [...rascunho.dias, iso] })
  }

  function alternarCorretor(id: string) {
    if (!rascunho) return
    mudar({
      corretores: rascunho.corretores.includes(id)
        ? rascunho.corretores.filter(c => c !== id)
        : [...rascunho.corretores, id],
    })
  }

  async function salvar() {
    if (!rascunho || problema) return
    setSalvando(true)
    try {
      const novo = await salvarConfig(rascunho)
      setSalvo(novo)
      setRascunho(novo)
      toast.success('Avisos de acesso salvos — eles chegam para você')
    } catch (err) {
      toast.error(mensagemDeErro(err))
    } finally { setSalvando(false) }
  }

  return (
    <section id={ANCORA_AVISOS_ACESSO} className="scroll-mt-4">
      <SecaoTitulo icon={Bell} tom="info" descricao="Quem já entrou hoje e os avisos que chegam no seu celular">
        Avisos de acesso
      </SecaoTitulo>

      {carregando && !salvo ? (
        <div className="flex items-center justify-center py-10 mt-3">
          <Loader2 size={18} className="animate-spin text-brand" strokeWidth={1.6} aria-label="Carregando" />
        </div>
      ) : erro || !salvo || !rascunho ? (
        <div className="flex flex-col items-center gap-2 py-8 mt-3 text-center px-4 rounded-[14px] border border-line">
          <p className="text-sm font-medium text-error">Não foi possível carregar os avisos de acesso.</p>
          {erro && <p className="text-xs text-t3">{erro}</p>}
          <button type="button" onClick={() => void carregar()}
            className="text-xs font-semibold text-t2 underline underline-offset-2 cursor-pointer">
            Tentar de novo
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 mt-3">
          {/* ── Hoje ─────────────────────────────────────────────────────── */}
          <div className="bento overflow-hidden">
            <p className="px-4 pt-4 text-[12.5px] text-t4">Hoje</p>
            {situacao.length === 0 ? (
              <p className="px-4 py-4 text-sm text-t3">Nenhum corretor acompanhado. Marque abaixo quem acompanhar.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {situacao.map(s => {
                  const p = acompanhados.find(x => x.id === s.brokerId)!
                  const estaOnline = onlineIds.has(s.brokerId)
                  return (
                    <li key={s.brokerId} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                      <Avatar name={p.name} photoUrl={p.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-t1 truncate">{p.name}</p>
                        <p className="text-xs text-t3 tabular-nums">
                          {s.primeiro
                            ? `Entrou às ${horaFaladaDe(s.primeiro)}${s.ultimo && s.ultimo !== s.primeiro ? ` · último acesso ${horaFaladaDe(s.ultimo)}` : ''}`
                            : 'Ainda não entrou hoje'}
                        </p>
                      </div>
                      {estaOnline
                        ? <Chip icon={Circle} tom="sucesso">Online agora</Chip>
                        : !s.primeiro && <Chip tom="atencao">Sem acesso</Chip>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* ── Configuração ─────────────────────────────────────────────── */}
          <div className="bento overflow-hidden">
            <div className="px-4 py-4 flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-t1">Avisar quando o corretor entrar</p>
                  <p className="text-xs text-t3 mt-0.5">“Ryan Maciel entrou no iCRM às 9h02” — só no 1º acesso do dia, qualquer dia.</p>
                </div>
                <Interruptor
                  ligado={rascunho.entradaAtiva}
                  onChange={() => mudar({ entradaAtiva: !rascunho.entradaAtiva })}
                  rotulo="Avisar quando o corretor entrar"
                  disabled={salvando}
                />
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-t1">Avisar quem ainda não entrou</p>
                    <p className="text-xs text-t3 mt-0.5">“Ryan ainda não entrou no iCRM (9h10)” — repete até ele entrar.</p>
                  </div>
                  <Interruptor
                    ligado={rascunho.atrasoAtivo}
                    onChange={() => mudar({ atrasoAtivo: !rascunho.atrasoAtivo })}
                    rotulo="Avisar quem ainda não entrou"
                    disabled={salvando}
                  />
                </div>

                <div className={`flex flex-col gap-3 ${rascunho.atrasoAtivo ? '' : 'opacity-50'}`}>
                  <div className="flex items-center gap-2 flex-wrap text-sm text-t3">
                    <span>Primeiro alerta</span>
                    <input type="time" step={300} value={rascunho.atrasoInicio}
                      onChange={e => mudar({ atrasoInicio: e.target.value })}
                      disabled={!rascunho.atrasoAtivo || salvando}
                      className={campoHora} aria-label="Primeiro alerta" />
                    <span>repete a cada</span>
                    <select value={rascunho.atrasoIntervaloMin}
                      onChange={e => mudar({ atrasoIntervaloMin: Number(e.target.value) })}
                      disabled={!rascunho.atrasoAtivo || salvando}
                      className={campoHora} aria-label="Intervalo entre alertas">
                      {INTERVALOS.map(m => (
                        <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', ' h 30')}</option>
                      ))}
                    </select>
                    <span>até</span>
                    <input type="time" step={300} value={rascunho.atrasoFim}
                      onChange={e => mudar({ atrasoFim: e.target.value })}
                      disabled={!rascunho.atrasoAtivo || salvando}
                      className={campoHora} aria-label="Último alerta" />
                  </div>

                  <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Dias com alerta">
                    {DIAS.map(d => {
                      const on = rascunho.dias.includes(d.iso)
                      return (
                        <button key={d.iso} type="button" role="switch" aria-checked={on}
                          aria-label={`${d.nome}: ${on ? 'com alerta' : 'sem alerta'}`}
                          onClick={() => alternarDia(d.iso)}
                          disabled={!rascunho.atrasoAtivo || salvando}
                          className={`w-12 h-10 rounded-[10px] border text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed
                            ${on ? 'bg-brand-tint border-brand/40 text-brand-text' : 'bg-s2 border-line text-t4'}`}>
                          {d.curto}
                        </button>
                      )
                    })}
                  </div>

                  {horarios.length > 0 && (
                    <p className="text-xs text-t3 tabular-nums">
                      Alertas às {horarios.map(horaFalada).join(', ')}.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-t1 mb-2">Corretores acompanhados</p>
                {corretores.length === 0 ? (
                  <p className="text-sm text-t3">Nenhum corretor ativo.</p>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {corretores.map(p => {
                      const on = rascunho.corretores.includes(p.id)
                      return (
                        <button key={p.id} type="button" role="checkbox" aria-checked={on}
                          onClick={() => alternarCorretor(p.id)} disabled={salvando}
                          className={`inline-flex items-center gap-2 h-10 px-3 rounded-[10px] border text-sm font-medium transition-colors cursor-pointer
                            ${on ? 'bg-brand-tint border-brand/40 text-brand-text' : 'bg-s2 border-line text-t3'}`}>
                          <Avatar name={p.name} photoUrl={p.avatarUrl} size="xs" />
                          {p.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <p className="flex items-start gap-1.5 text-xs text-t3">
                <Info size={12} strokeWidth={1.6} className="flex-shrink-0 mt-0.5" aria-hidden />
                <span>
                  Conta como acesso abrir o iCRM, voltar para a aba ou clicar depois de 30 min parado.
                  Os avisos chegam para quem salvar esta configuração.
                </span>
              </p>

              {(alterado || problema) && (
                <div className="flex items-center gap-3 flex-wrap justify-end">
                  {problema && <span className="text-xs text-error mr-auto" role="alert">{problema}</span>}
                  <button type="button" onClick={() => setRascunho(salvo)} disabled={salvando}
                    className="inline-flex items-center gap-1.5 h-10 px-3 rounded-[10px] text-sm font-medium text-t2 hover:bg-s3 cursor-pointer disabled:opacity-50">
                    <RotateCcw size={14} strokeWidth={1.8} aria-hidden /> Desfazer
                  </button>
                  <button type="button" onClick={() => void salvar()} disabled={!!problema || salvando || !alterado}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 size={14} className="animate-spin" aria-hidden />}
                    Salvar avisos
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
