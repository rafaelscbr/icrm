import { useState } from 'react'
import { Check, X, Loader2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'

/**
 * Região e tipologia procuradas — as duas preferências que TODO lead tem,
 * venham do formulário ou não.
 *
 * Nenhum formulário pergunta região, e o Porto Velas nem pergunta tipologia.
 * Sem um lugar para o corretor anotar o que ouviu, esse dado morre no WhatsApp
 * e o cruzamento com lançamentos fica cego justo onde mais valeria.
 *
 * Múltiplas de propósito: "Fazenda ou Praia Brava", "2 ou 3 dorms" é a regra,
 * não a exceção. São preferências, nunca travas — ordenam a sugestão, não
 * reprovam ninguém.
 */

/**
 * Tipologias como o mercado daqui fala.
 *
 * "2 dormitórios" não é uma coisa só: 2 sem suíte, 2 com uma suíte e 2 suítes
 * são produtos diferentes, com preço e público diferentes. E studio não cabe
 * em nenhuma contagem de dormitório.
 *
 * Chave 'dorms:suites' — o casamento extrai os dois números. O formulário do
 * Meta grava só '2', e continua valendo: a comparação lê o que vem antes do
 * ':' e trata suíte não informada como "tanto faz".
 */
const TIPOLOGIAS: { value: string; label: string; grupo: string }[] = [
  { value: 'studio', label: 'Studio',              grupo: 'Studio' },
  { value: '1:0',    label: '1 dorm',              grupo: '1 dormitório' },
  { value: '1:1',    label: '1 suíte',             grupo: '1 dormitório' },
  { value: '2:0',    label: '2 dorms',             grupo: '2 dormitórios' },
  { value: '2:1',    label: '2 dorms · 1 suíte',   grupo: '2 dormitórios' },
  { value: '2:2',    label: '2 suítes',            grupo: '2 dormitórios' },
  { value: '3:0',    label: '3 dorms',             grupo: '3 dormitórios' },
  { value: '3:1',    label: '3 dorms · 1 suíte',   grupo: '3 dormitórios' },
  { value: '3:2',    label: '3 dorms · 2 suítes',  grupo: '3 dormitórios' },
  { value: '3:3',    label: '3 suítes',            grupo: '3 dormitórios' },
  { value: '4:0',    label: '4+ dorms',            grupo: '4 ou mais' },
  { value: '4:1',    label: '4+ · 1 suíte',        grupo: '4 ou mais' },
  { value: '4:2',    label: '4+ · 2 suítes',       grupo: '4 ou mais' },
  { value: '4:4',    label: '4+ suítes',           grupo: '4 ou mais' },
]

const GRUPOS = [...new Set(TIPOLOGIAS.map(t => t.grupo))]

/** O formulário do Meta grava só o número — mostra legível mesmo assim. */
function tipologiaLabel(v: string): string {
  const achado = TIPOLOGIAS.find(t => t.value === v)
  if (achado) return achado.label
  return /^\d+$/.test(v) ? `${v} ${v === '1' ? 'dorm' : 'dorms'}` : v
}

/** Sem acento e em minúscula: "São João" e "sao joao" são a mesma região. */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Chave de casamento — a mesma que o banco monta em `region_key`.
 * Bairro vazio significa "qualquer bairro desta cidade", que é como muita
 * gente procura de verdade.
 */
function regionKey(cidade: string, bairro?: string): string {
  return `${semAcento(cidade)}|${semAcento(bairro ?? '')}`
}

function regionLabel(cidade: string, bairro?: string): string {
  return bairro?.trim() ? `${cidade.trim()} · ${bairro.trim()}` : `${cidade.trim()} · toda a cidade`
}

export interface RegionItem { city: string; neighborhood?: string }

export function LeadPreferencesEditor({
  leadId, field, atuais, atuaisRegioes, onSaved, onCancel,
}: {
  leadId: string
  field: 'regioes' | 'tipologias'
  atuais?: string[]
  atuaisRegioes?: RegionItem[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [sel, setSel] = useState<string[]>(atuais ?? [])
  const [regioes, setRegioes] = useState<RegionItem[]>(atuaisRegioes ?? [])
  const [cidade, setCidade] = useState('Itajaí')
  const [bairro, setBairro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const developments = useDevelopmentsStore(s => s.developments)

  // Sugere cidade+bairro dos lançamentos ativos: é onde o cruzamento acontece,
  // e escolher da lista evita "Fazenda" e "fazenda " virarem duas regiões.
  const sugestoes = field === 'regioes'
    ? developments
        .filter(d => d.active && d.region)
        .map(d => ({ city: d.city, neighborhood: d.region! }))
        .filter((d, i, arr) =>
          arr.findIndex(x => regionKey(x.city, x.neighborhood) === regionKey(d.city, d.neighborhood)) === i)
        .filter(d => !regioes.some(r => regionKey(r.city, r.neighborhood) === regionKey(d.city, d.neighborhood)))
    : []

  const cidadesConhecidas = [...new Set(developments.filter(d => d.active).map(d => d.city))]

  function alternar(v: string) {
    setSel(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])
  }

  function adicionarRegiao(item?: RegionItem) {
    const novo = item ?? { city: cidade, neighborhood: bairro || undefined }
    if (!novo.city.trim()) return
    const chave = regionKey(novo.city, novo.neighborhood)
    if (regioes.some(r => regionKey(r.city, r.neighborhood) === chave)) { setBairro(''); return }
    setRegioes(p => [...p, novo])
    setBairro('')
  }

  async function salvar(limpar = false) {
    setSalvando(true)
    try {
      const vazio = field === 'regioes' ? regioes.length === 0 : sel.length === 0
      const valor = limpar || vazio ? null : field === 'regioes' ? {
        values: regioes.map(r => regionKey(r.city, r.neighborhood)),
        labels: regioes.map(r => regionLabel(r.city, r.neighborhood)),
        items:  regioes,
      } : {
        values: sel,
        labels: sel.map(tipologiaLabel),
      }
      const { error } = await supabase.rpc('set_lead_profile_field', {
        p_lead_id: leadId, p_field: field, p_value: valor,
      })
      if (error) throw error
      toast.success(valor ? 'Preferências salvas' : 'Preferências removidas')
      onSaved()
    } catch (err) {
      console.error('[preferencias] salvar:', err)
      toast.error('Não foi possível salvar. Verifique sua conexão e tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded-[14px] border border-brand/30 bg-brand-tint/30 p-3 space-y-2.5">
      {field === 'tipologias' ? (
        <div className="space-y-2 max-h-[16rem] overflow-y-auto overscroll-contain pr-1">
          {/* Agrupado por dormitórios: com 14 opções, uma lista corrida vira
              caça-palavras. O grupo dá o eixo e as suítes viram a variação. */}
          {GRUPOS.map(g => (
            <div key={g}>
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-t4 mb-1">{g}</p>
              <div className="flex flex-wrap gap-1.5">
                {TIPOLOGIAS.filter(t => t.grupo === g).map(t => (
                  <button
                    key={t.value}
                    onClick={() => alternar(t.value)}
                    aria-pressed={sel.includes(t.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 cursor-pointer
                      ${sel.includes(t.value)
                        ? 'bg-brand-tint text-brand-text border-brand/40'
                        : 'bg-surface text-t3 border-line hover:border-line-strong'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {regioes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {regioes.map(r => (
                <span
                  key={regionKey(r.city, r.neighborhood)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs
                             bg-brand-tint text-brand-text border border-brand/40"
                >
                  {regionLabel(r.city, r.neighborhood)}
                  <button
                    onClick={() => setRegioes(p => p.filter(
                      x => regionKey(x.city, x.neighborhood) !== regionKey(r.city, r.neighborhood)))}
                    aria-label={`Remover ${regionLabel(r.city, r.neighborhood)}`}
                    className="hover:text-error transition-colors"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Cidade + bairro: "Centro" existe em Itajaí, em Balneário e em
              Navegantes — bairro sozinho casaria gente errada. */}
          <div className="flex gap-1.5">
            <input
              value={cidade}
              onChange={e => setCidade(e.target.value)}
              list="cidades-conhecidas"
              placeholder="Cidade"
              aria-label="Cidade"
              className="w-[42%] bg-surface border border-line-input rounded-lg px-2.5 py-1.5 text-xs text-t1
                         placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand"
            />
            <datalist id="cidades-conhecidas">
              {cidadesConhecidas.map(c => <option key={c} value={c} />)}
            </datalist>
            <input
              value={bairro}
              onChange={e => setBairro(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarRegiao() } }}
              placeholder="Bairro (opcional)"
              aria-label="Bairro"
              className="flex-1 bg-surface border border-line-input rounded-lg px-2.5 py-1.5 text-xs text-t1
                         placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand"
            />
            <button
              onClick={() => adicionarRegiao()}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-line
                         text-t3 hover:text-brand-text hover:border-brand/40 transition-colors flex-shrink-0"
              aria-label="Adicionar região"
            >
              <Plus size={13} />
            </button>
          </div>
          <p className="text-[11px] text-t4">
            Bairro em branco = qualquer bairro da cidade.
          </p>

          {sugestoes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[11px] text-t4 mr-0.5">Nos lançamentos:</span>
              {sugestoes.map(r => (
                <button
                  key={regionKey(r.city, r.neighborhood)}
                  onClick={() => adicionarRegiao(r)}
                  className="text-[11px] px-1.5 py-0.5 rounded-full border border-dashed border-line
                             text-t3 hover:text-brand-text hover:border-brand/40 transition-colors"
                >
                  + {regionLabel(r.city, r.neighborhood)}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => salvar()}
          disabled={salvando}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-brand hover:bg-brand-dark
                     font-heading text-xs font-bold rounded-[10px] transition-all duration-150 disabled:opacity-50"
          style={{ color: 'var(--brand-btn-text)' }}
        >
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Salvar
        </button>
        {((field === 'regioes' ? atuaisRegioes?.length : atuais?.length) ?? 0) > 0 && (
          <button
            onClick={() => salvar(true)}
            disabled={salvando}
            className="px-2.5 py-1.5 text-xs text-t3 hover:text-error rounded-[10px] hover:bg-s2 transition-colors"
          >
            Limpar
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={salvando}
          className="w-8 h-8 flex items-center justify-center text-t4 hover:text-t2 rounded-[10px] hover:bg-s2 transition-colors"
          aria-label="Cancelar"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
