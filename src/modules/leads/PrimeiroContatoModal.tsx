import { useEffect, useState } from 'react'
import { MessageCircle, Phone } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../../store/useAuthStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import type { CanalPrimeiroContato, Lead, PotencialLead, ResultadoPrimeiroContato } from '../../types'
import {
  NOME_CANAL, POTENCIAIS, RESULTADOS,
  pendentesDoCorretor, perguntaPotencial, usePrimeiroContatoStore,
} from './primeiroContato'

/**
 * O popup do 1º contato (migração 114). Fica montado uma vez no App: abre
 * quando o corretor chama um lead pela primeira vez, e volta sozinho para o
 * 1º contato que ficou sem resposta (popup fechado, página recarregada).
 *
 * Banco primeiro: só fecha depois que o registro foi gravado. Número que não
 * existe descarta o lead; "tem potencial" oferece qualificar.
 */
export function PrimeiroContatoHost() {
  const { atual, adiados, abrir } = usePrimeiroContatoStore()
  const leads = useLeadsStore(s => s.leads)
  const eu = useAuthStore(s => s.profile?.id)

  // Pendente de uma sessão anterior: abre de novo, um de cada vez.
  useEffect(() => {
    if (atual) return
    const p = pendentesDoCorretor(leads, eu).find(l => !adiados.includes(l.id))
    if (p) abrir(p.id, p.firstContactChannel ?? 'whatsapp')
  }, [atual, leads, eu, adiados, abrir])

  const lead = atual ? leads.find(l => l.id === atual.leadId) : undefined
  if (!atual || !lead) return null
  return <PrimeiroContatoModal key={lead.id} lead={lead} canalInicial={atual.canal} />
}

type Passo = 'resultado' | 'qualificar'

function PrimeiroContatoModal({ lead, canalInicial }: { lead: Lead; canalInicial: CanalPrimeiroContato }) {
  const { fechar, adiar } = usePrimeiroContatoStore()
  const { registrarPrimeiroContato, discard, advanceFollowup, setQualified } = useLeadsStore()
  const [canal, setCanal] = useState<CanalPrimeiroContato>(canalInicial)
  const [resultado, setResultado] = useState<ResultadoPrimeiroContato | null>(null)
  const [potencial, setPotencial] = useState<PotencialLead | null>(null)
  const [passo, setPasso] = useState<Passo>('resultado')
  const [salvando, setSalvando] = useState(false)

  const pedePotencial = perguntaPotencial(canal, resultado)
  const pronto = resultado !== null && (!pedePotencial || potencial !== null)
  const nome = lead.name.split(' ')[0]

  function trocarCanal(c: CanalPrimeiroContato) {
    setCanal(c)
    if (!perguntaPotencial(c, resultado)) setPotencial(null)
  }
  function escolherResultado(r: ResultadoPrimeiroContato) {
    setResultado(r)
    if (!perguntaPotencial(canal, r)) setPotencial(null)
  }

  async function registrar() {
    if (!pronto || !resultado || salvando) return
    setSalvando(true)
    try {
      await registrarPrimeiroContato(lead.id, { canal, resultado, potencial: pedePotencial ? potencial : null })
    } catch {
      setSalvando(false)   // erro já avisado pela camada db; o popup fica aberto
      return
    }
    // O registro já está no banco. Os passos seguintes avisam se falharem,
    // mas não desfazem o registro.
    try {
      if (resultado === 'numero_invalido') {
        await discard(lead.id, 'telefone_invalido')
        toast.success(`${nome}: número não existe, lead descartado`)
      } else {
        // Ligação feita pela ficha não passa pelo Chamar: o lead sai de "Novo".
        if (lead.funnelStage === 'lead') await advanceFollowup(lead.id)
        toast.success('Primeiro contato registrado')
      }
    } catch { /* erro já avisado pela camada db */ }
    setSalvando(false)
    if (potencial === 'potencial' && pedePotencial && !lead.qualifiedAt) setPasso('qualificar')
    else fechar()
  }

  async function qualificar() {
    setSalvando(true)
    try {
      await setQualified(lead.id, true)
      toast.success(`${nome} qualificado`)
      fechar()
    } catch {
      setSalvando(false)   // erro já avisado; dá para tentar de novo ou seguir
    }
  }

  if (passo === 'qualificar') {
    return (
      <Modal
        isOpen
        onClose={fechar}
        title="Deseja qualificar o lead?"
        subtitle={`${lead.name} tem potencial para comprar`}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fechar} className="flex-1" disabled={salvando}>Agora não</Button>
            <Button onClick={qualificar} className="flex-1" carregando={salvando}>Qualificar</Button>
          </div>
        }
      >
        <p className="text-[13.5px] text-t2 leading-relaxed">
          O lead fica marcado como qualificado
          {lead.origin === 'meta_ads' ? ' e o Meta recebe o aviso, para buscar mais leads parecidos com este.' : '.'}
          {' '}Dá para desfazer na ficha.
        </p>
      </Modal>
    )
  }

  const pilula = (ativo: boolean) =>
    `inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13.5px] font-medium transition-colors cursor-pointer ${
      ativo ? 'bg-brand-fill text-brand-fill-text' : 'bg-s2 text-t2 hover:bg-s3'}`
  const opcao = (ativo: boolean) =>
    `w-full text-left px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
      ativo ? 'border-transparent ring-2 ring-brand-fill bg-brand-fill/10' : 'border-line hover:bg-s2'}`

  return (
    <Modal
      isOpen
      onClose={adiar}
      title="Como foi o primeiro contato?"
      subtitle={`${lead.name}${lead.propertyName ? ` · ${lead.propertyName}` : ''}`}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={adiar} className="flex-1" disabled={salvando}>Responder depois</Button>
          <Button onClick={registrar} className="flex-1" disabled={!pronto} carregando={salvando}>
            {resultado === 'numero_invalido' ? 'Registrar e descartar' : 'Registrar'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="rotulo-campo mb-2">Por onde foi?</legend>
          <div className="flex gap-2" role="radiogroup" aria-label="Por onde foi o contato">
            {(['ligacao', 'whatsapp'] as const).map(c => (
              <button key={c} type="button" role="radio" aria-checked={canal === c}
                      onClick={() => trocarCanal(c)} className={pilula(canal === c)}>
                {c === 'ligacao' ? <Phone size={14} aria-hidden /> : <MessageCircle size={14} aria-hidden />}
                {NOME_CANAL[c]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="rotulo-campo mb-2">O que aconteceu?</legend>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="O que aconteceu no contato">
            {RESULTADOS.map(r => (
              <button key={r.valor} type="button" role="radio" aria-checked={resultado === r.valor}
                      onClick={() => escolherResultado(r.valor)} className={opcao(resultado === r.valor)}>
                <span className="block text-[14px] font-medium text-t1">{r.nome}</span>
                <span className="block text-[12px] text-t4">{r.nota}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {pedePotencial && (
          <fieldset className="flex flex-col gap-2 animate-in fade-in duration-150">
            <legend className="rotulo-campo mb-2">Tem potencial para comprar?</legend>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Potencial do lead">
              {POTENCIAIS.map(p => (
                <button key={p.valor} type="button" role="radio" aria-checked={potencial === p.valor}
                        onClick={() => setPotencial(p.valor)} className={`${opcao(potencial === p.valor)} text-center`}>
                  <span className="block text-[13.5px] font-medium text-t1">{p.nome}</span>
                  <span className="block text-[11.5px] text-t4 leading-tight mt-0.5">{p.nota}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Modal>
  )
}
