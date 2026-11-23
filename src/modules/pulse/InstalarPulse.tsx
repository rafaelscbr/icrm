import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'

/**
 * Pulse instalável (22/11/2026) — o Rafael quer o Pulse como um app próprio
 * no iPhone, com ícone dele, abrindo direto na sala.
 *
 * Como: enquanto a tela do Pulse está aberta, o <head> aponta para o manifesto
 * do Pulse (public/pulse.webmanifest: start_url /pulse, ícone do batimento) e
 * para o ícone e o nome do Pulse no iOS. "Adicionar à Tela de Início" lê o que
 * está no <head> naquela hora — então nasce o app "Pulse", não o iCRM. Ao sair
 * da tela, tudo volta ao do iCRM.
 *
 * Instalar: Android e computador (Chrome/Edge) têm o pedido nativo
 * (beforeinstallprompt). O Safari do iPhone não tem — lá o botão mostra os
 * dois toques: Compartilhar → Adicionar à Tela de Início.
 */

interface PedidoDeInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// O navegador dispara o pedido uma vez, às vezes antes da tela montar: guarda.
let pedidoGuardado: PedidoDeInstalacao | null = null
const ouvintes = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    pedidoGuardado = e as PedidoDeInstalacao
    ouvintes.forEach(f => f())
  })
  window.addEventListener('appinstalled', () => { pedidoGuardado = null; ouvintes.forEach(f => f()) })
}

function trocarHead(manifesto: string, icone: string, titulo: string) {
  const anteriores: (() => void)[] = []
  const definir = (seletor: string, attr: 'href' | 'content', valor: string) => {
    const el = document.head.querySelector<HTMLLinkElement | HTMLMetaElement>(seletor)
    if (!el) return
    const antes = el.getAttribute(attr)
    el.setAttribute(attr, valor)
    anteriores.push(() => { if (antes !== null) el.setAttribute(attr, antes) })
  }
  definir('link[rel="manifest"]', 'href', manifesto)
  definir('link[rel="apple-touch-icon"]', 'href', icone)
  definir('meta[name="apple-mobile-web-app-title"]', 'content', titulo)
  return () => anteriores.forEach(f => f())
}

/** Enquanto montado, o <head> é o do Pulse. */
export function useCabecalhoDoPulse() {
  useEffect(() => trocarHead('/pulse.webmanifest', '/icones-pulse/apple-touch-icon.png', 'Pulse'), [])
}

function jaInstalado(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function ehIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
}

/** Botão "Instalar" — some quando o Pulse já está aberto como app. */
export function InstalarPulse({ className = '', escuro = false }: { className?: string; escuro?: boolean }) {
  const [, forcar] = useState(0)
  const [passos, setPassos] = useState(false)
  useEffect(() => {
    const f = () => forcar(n => n + 1)
    ouvintes.add(f)
    return () => { ouvintes.delete(f) }
  }, [])

  if (jaInstalado()) return null

  async function instalar() {
    if (pedidoGuardado) {
      await pedidoGuardado.prompt()
      await pedidoGuardado.userChoice
      pedidoGuardado = null
      forcar(n => n + 1)
      return
    }
    setPassos(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void instalar()}
        className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E2C385]/60
          ${escuro ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-s2 text-t1 hover:bg-s3'} ${className}`}
      >
        <Download size={14} strokeWidth={2} aria-hidden />
        Instalar o Pulse
      </button>

      {passos && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 p-4" role="presentation"
             onClick={() => setPassos(false)}>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- só impede que o clique dentro feche */}
          <div role="dialog" aria-modal="true" aria-label="Como instalar o Pulse"
               className="w-full max-w-[380px] rounded-[22px] bg-surface p-5 text-t1 shadow-modal"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <img src="/icones-pulse/icon-192.png" alt="" className="w-14 h-14 rounded-[14px]" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[18px] font-bold">Pulse no seu celular</p>
                <p className="text-[13.5px] text-t3 mt-0.5">Um ícone próprio, que abre direto na sala.</p>
              </div>
              <button type="button" onClick={() => setPassos(false)} aria-label="Fechar"
                className="w-8 h-8 -mr-1 -mt-1 rounded-full flex items-center justify-center text-t3 hover:bg-s2 cursor-pointer">
                <X size={16} aria-hidden />
              </button>
            </div>
            <ol className="mt-4 flex flex-col gap-3 text-[14.5px]">
              <li className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-[11px] bg-s2 flex items-center justify-center flex-shrink-0"><Share size={17} aria-hidden /></span>
                <span>{ehIOS() ? <>Toque em <b>Compartilhar</b>, na barra do Safari</> : <>Abra o menu do navegador</>}</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-[11px] bg-s2 flex items-center justify-center flex-shrink-0"><SquarePlus size={17} aria-hidden /></span>
                <span>Escolha <b>Adicionar à Tela de Início</b> e confirme</span>
              </li>
            </ol>
            <p className="mt-4 text-[12.5px] text-t4">Faça isso com o Pulse aberto: o ícone e o nome que entram na tela são os do Pulse.</p>
          </div>
        </div>
      )}
    </>
  )
}
