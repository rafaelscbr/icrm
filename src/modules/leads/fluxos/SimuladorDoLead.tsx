import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Check, Key, Loader2, Save, Send, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Lead } from '../../../types'
import { db } from '../../../lib/db'
import { useAuthStore } from '../../../store/useAuthStore'
import { usePropertiesStore } from '../../../store/usePropertiesStore'
import { Abas } from '../../../components/shared/Abas'
import type { SharedFields, SimuladorModo } from '../../simulador/shared/types'
import {
  EstadoAssociativo, EstadoDireto, EstadoPosChaves, LeadFluxo, RelatoDoSimulador, ROTULO_DO_MODO,
} from '../../simulador/shared/fluxo'
import { PosChavesSimulator } from '../../simulador/posChaves/Simulator'
import { DiretoSimulator } from '../../simulador/direto/Simulator'
import { AssociativoSimulator } from '../../simulador/associativo/Simulator'

/**
 * O simulador aberto de dentro do lead (19/11/2026).
 *
 * São os mesmos três modos da tela do Simulador, sem cópia de cálculo nem de
 * formulário: esta camada só os hospeda. Ela preenche a identificação com os
 * dados do lead, ouve o que o modo relata e grava.
 *
 * Regras:
 *   • Salvar nunca sobrescreve. A primeira gravação cria o fluxo (versão 1); as
 *     seguintes criam a versão seguinte do mesmo fluxo.
 *   • Um fluxo não muda de tipo de simulação. A escolha do tipo só existe
 *     enquanto o fluxo é novo.
 *   • Banco primeiro: a tela só diz "salvo" depois que o banco respondeu.
 *   • Sair com alteração não salva pede confirmação.
 */

const MODOS: { value: SimuladorModo; label: string; icon: typeof Key }[] = [
  { value: 'pos_chaves',  label: 'Pós-chaves',               icon: Key       },
  { value: 'direto',      label: 'Direto com a construtora', icon: Building2 },
  { value: 'associativo', label: 'Associativo',              icon: Users     },
]

const horaCurta = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function SimuladorDoLead({ lead, base, nomeSugerido, onClose, onSalvo }: {
  lead: Lead
  /** versão de partida, ao editar; ausente = fluxo novo */
  base?: LeadFluxo
  nomeSugerido: string
  onClose: () => void
  /** chamado a cada gravação que o banco confirmou */
  onSalvo: (f: LeadFluxo) => void
}) {
  const corretor = useAuthStore(s => s.profile?.name ?? '')
  const produto = usePropertiesStore(s => lead.propertyId ? s.properties.find(p => p.id === lead.propertyId)?.name : undefined)

  // A versão do banco de que esta edição parte. Depois de salvar, passa a ser a recém-gravada.
  const [atual, setAtual] = useState<LeadFluxo | undefined>(base)
  const [modo, setModo] = useState<SimuladorModo>(base?.modo ?? 'pos_chaves')
  const [nome, setNome] = useState(base?.nome ?? nomeSugerido)
  const [shared, setShared] = useState<SharedFields>(() => base?.dados.shared ?? {
    empreendimento: produto ?? lead.propertyName ?? '',
    cliente: lead.name,
    // O lead guarda o telefone com o 55 do país; o simulador trabalha só com
    // DDD + número (o campo dele corta em 11 dígitos). Mesma regra de `telefoneValido`.
    telefone: (lead.phone ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''),
    valorTotal: lead.averageTicket ?? 0,
  })
  const onShared = (patch: Partial<SharedFields>) => setShared(prev => ({ ...prev, ...patch }))

  // O que o modo ativo relatou por último.
  const [relato, setRelato] = useState<RelatoDoSimulador<unknown> | null>(null)
  const aoRelatar = useCallback((r: RelatoDoSimulador<unknown>) => setRelato(r), [])

  // "Sujo" = diferente do que está no banco (ou, no fluxo novo, do ponto de partida).
  const assinatura = relato ? JSON.stringify({ nome: nome.trim(), modo, shared, estado: relato.estado }) : null
  const [referencia, setReferencia] = useState<string | null>(null)
  useEffect(() => {
    if (referencia === null && assinatura !== null) setReferencia(assinatura)
  }, [referencia, assinatura])
  const sujo = referencia !== null && assinatura !== null && assinatura !== referencia

  const [salvando, setSalvando] = useState<'salvar' | 'enviar' | null>(null)
  const [confirmarSaida, setConfirmarSaida] = useState(false)

  const valido = !!relato?.valido
  const nomeOk = nome.trim().length > 0
  const precisaSalvar = !atual || sujo
  const jaEnviado = !!atual?.enviadoEm && !sujo

  async function gravar(enviar: boolean) {
    if (!relato || !valido || !nomeOk || salvando) return
    setSalvando(enviar ? 'enviar' : 'salvar')
    try {
      let f = atual
      if (precisaSalvar || !f) {
        f = await db.leadFluxos.salvar({
          leadId: lead.id, fluxoId: atual?.fluxoId ?? null, nome: nome.trim(), modo,
          dados: { shared, estado: relato.estado } as LeadFluxo['dados'],
          resumo: relato.resumo, mensagem: relato.mensagem,
        })
        // O banco confirmou a versão: a partir daqui é ela a referência.
        setAtual(f)
        setReferencia(assinatura)
        onSalvo(f)
        if (!enviar) toast.success(`Fluxo salvo · versão ${f.versao}`)
      }
      if (enviar) {
        const enviado = await db.leadFluxos.marcarEnviado(f.id)
        setAtual(enviado)
        onSalvo(enviado)
        toast.success(`Versão ${enviado.versao} marcada como enviada`)
      }
    } catch { /* erro já avisado pela camada do banco; a tela fica como estava */ }
    finally { setSalvando(null) }
  }

  const pedirSaida = useCallback(() => {
    if (salvando) return
    if (sujo) setConfirmarSaida(true)
    else onClose()
  }, [salvando, sujo, onClose])

  // Esc fecha esta camada (não a ficha atrás dela), com a mesma confirmação.
  const pedirSaidaRef = useRef(pedirSaida)
  useEffect(() => { pedirSaidaRef.current = pedirSaida }, [pedirSaida])
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); pedirSaidaRef.current() } }
    document.addEventListener('keydown', aoTeclar, true)
    return () => document.removeEventListener('keydown', aoTeclar, true)
  }, [])

  // Só na montagem do modo: reabre com o que foi salvo, se for do mesmo tipo.
  const inicial = base && base.modo === modo ? base.dados.estado : undefined

  const situacao = !atual
    ? 'Fluxo novo, ainda não salvo'
    : sujo
      ? `Alterações não salvas · partindo da versão ${atual.versao}`
      : `Versão ${atual.versao} salva às ${horaCurta(atual.criadoEm)}`

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-page flex flex-col" role="dialog" aria-modal="true"
         aria-label={`Fluxo de pagamento para ${lead.name}`}>
      <header className="flex-shrink-0 border-b border-line bg-surface"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-x-4 gap-y-3 flex-wrap">
          <button type="button" onClick={pedirSaida} className="ficha-icone -ml-2 flex-shrink-0" aria-label="Fechar o simulador">
            <X size={19} strokeWidth={1.8} />
          </button>

          <div className="min-w-0 flex-1 basis-[240px]">
            <p className="text-[12.5px] text-t4 truncate">
              Fluxo para <span className="text-t2 font-medium">{lead.name}</span>
              {atual && <> · {ROTULO_DO_MODO[atual.modo]}</>}
            </p>
            <label className="sr-only" htmlFor="nome-do-fluxo">Nome do fluxo</label>
            <input
              id="nome-do-fluxo"
              value={nome}
              onChange={e => setNome(e.target.value)}
              maxLength={80}
              placeholder="Dê um nome ao fluxo — ex.: Opção 1, entrada maior"
              className="w-full bg-transparent font-display text-[19px] font-bold text-t1 tracking-[-0.02em]
                         placeholder:text-t4 placeholder:font-normal placeholder:text-[15px]
                         rounded-md -mx-1 px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            />
          </div>

          <p className={`text-[12.5px] tabular-nums flex-shrink-0 ${sujo || !atual ? 'text-warning' : 'text-t4'}`} role="status">
            {jaEnviado
              ? <span className="inline-flex items-center gap-1 text-success"><Check size={13} strokeWidth={2} aria-hidden />Versão {atual!.versao} enviada ao cliente</span>
              : situacao}
          </p>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => void gravar(false)}
              disabled={!valido || !nomeOk || !precisaSalvar || !!salvando}
              title={!valido ? 'Preencha a simulação para salvar' : !nomeOk ? 'Dê um nome ao fluxo' : !precisaSalvar ? 'Nada mudou desde a última versão salva' : undefined}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover
                         text-[13.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {salvando === 'salvar' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} strokeWidth={2} aria-hidden />}
              {atual ? `Salvar versão ${atual.versao + 1}` : 'Salvar fluxo'}
            </button>
            <button
              type="button"
              onClick={() => void gravar(true)}
              disabled={!valido || !nomeOk || jaEnviado || !!salvando}
              title={jaEnviado ? 'Esta versão já foi marcada como enviada' : 'Grava a versão, se houver mudança, e registra o envio no histórico do lead'}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] border border-line bg-surface text-t1 hover:bg-s2
                         text-[13.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {salvando === 'enviar' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} strokeWidth={1.9} aria-hidden />}
              {precisaSalvar ? 'Salvar e marcar como enviado' : 'Marcar como enviado'}
            </button>
          </div>
        </div>

        {confirmarSaida && (
          <div className="border-t border-warning-line bg-warning-bg" role="alertdialog" aria-label="Sair sem salvar">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 flex-wrap">
              <p className="flex-1 min-w-0 text-[13.5px] text-t1">Há alterações que não foram salvas. Se sair agora, elas se perdem.</p>
              <button type="button" onClick={onClose}
                      className="h-8 px-3 rounded-[9px] text-[13px] font-semibold text-error hover:bg-error-bg cursor-pointer">
                Sair sem salvar
              </button>
              <button type="button" onClick={() => setConfirmarSaida(false)}
                      className="h-8 px-3 rounded-[9px] text-[13px] font-semibold text-t1 bg-surface border border-line hover:bg-s2 cursor-pointer">
                Continuar editando
              </button>
            </div>
          </div>
        )}

        {/* O tipo de simulação só se escolhe no fluxo novo: um fluxo salvo não muda de tipo. */}
        {!atual && (
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto rolagem-limpa">
            <Abas abas={MODOS} valor={modo} onChange={setModo} rotulo="Tipo de simulação" variante="sublinhado" />
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
          {modo === 'pos_chaves' && (
            <PosChavesSimulator key="pos_chaves" shared={shared} onShared={onShared} corretor={corretor}
              inicial={inicial as EstadoPosChaves | undefined} onRelato={aoRelatar} />
          )}
          {modo === 'direto' && (
            <DiretoSimulator key="direto" shared={shared} onShared={onShared} corretor={corretor}
              inicial={inicial as EstadoDireto | undefined} onRelato={aoRelatar} />
          )}
          {modo === 'associativo' && (
            <AssociativoSimulator key="associativo" shared={shared} onShared={onShared} corretor={corretor}
              inicial={inicial as EstadoAssociativo | undefined} onRelato={aoRelatar} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
