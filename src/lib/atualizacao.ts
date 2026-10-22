import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/*
 * Atualização do app instalado (PWA).
 *
 * Antes o service worker trocava de versão em silêncio e a tela aberta seguia
 * com o código velho: o deploy estava no ar e o celular não via nada até o app
 * ser fechado de verdade — no iPhone, que mantém o app vivo em segundo plano,
 * isso podia levar dias.
 *
 * Agora a versão nova fica esperando e a tela avisa, com um botão "Atualizar".
 * Não recarrega sozinha: o Simulador é usado na frente do cliente e não guarda
 * o que foi digitado — uma recarga no meio apagaria a simulação. Quem decide a
 * hora é o corretor. Se ele ignorar, a versão nova entra quando o app fechar.
 */

let pendente = false
const ouvintes = new Set<() => void>()
let aplicar: (recarregar?: boolean) => Promise<void> = async () => {}

/** Intervalo mínimo entre checagens ao voltar para o app. */
const INTERVALO_CHECAGEM = 60_000

export function iniciarAtualizacao() {
  aplicar = registerSW({
    immediate: true,
    onNeedRefresh() {
      // O Pulse é quiosque: ninguém toca na tela e não há formulário a perder.
      if (location.pathname.startsWith('/pulse')) {
        void aplicar(true)
        return
      }
      pendente = true
      ouvintes.forEach(f => f())
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      // O app no celular raramente é recarregado; ele volta do segundo plano.
      // É nessa volta que vale perguntar ao servidor se há versão nova.
      let ultima = Date.now()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        if (Date.now() - ultima < INTERVALO_CHECAGEM) return
        ultima = Date.now()
        // Sem rede a checagem falha e tudo bem: a versão atual segue
        // funcionando e a próxima volta tenta de novo.
        reg.update().catch(() => {})
      })
    },
  })
}

export function atualizarAgora() {
  void aplicar(true)
}

export function dispensarAtualizacao() {
  pendente = false
  ouvintes.forEach(f => f())
}

export function useAtualizacaoPendente(): boolean {
  return useSyncExternalStore(
    f => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => pendente,
  )
}
