import { useEffect, useId, useRef, useState } from 'react'
import type { LeadFunnelStage } from '../../types'
import { JOIA } from '../../lib/paletaJoia'

/**
 * O funil do sistema — PADRÃO VISUAL OBRIGATÓRIO (Rafael, 23/11/2026: "sempre
 * que eu falo que quero um funil, eu quero nesse padrão"): fatias em trapézio,
 * empilhadas e centradas, cada uma no degradê joia da etapa, com o nome em
 * maiúsculas e o número grande em branco — a forma do funil do Pulse, em tons
 * mais claros, e com a conversão escrita em cada passagem. Sem brilho animado
 * (pedido dele).
 *
 * A largura das fatias é FORMA, não proporção: com 545 no topo e 5 no fundo,
 * fatias proporcionais virariam um traço. A proporção está nos números e nas
 * taxas.
 *
 * O desenho é medido em PIXELS (a caixa é observada e o viewBox é a largura
 * real): a letra tem sempre o mesmo tamanho, no celular e no computador — num
 * SVG que só escala, a letra lateral virava 7 px no celular.
 *
 *   largo   — o passo (quantos da etapa de cima avançaram) à direita da
 *             passagem e o acumulado (quanto do topo chegou) à esquerda
 *   estreito — os dois numa etiqueta só, centrada no vão entre as fatias,
 *             e o funil ocupa a largura toda
 *
 * `preencher` (TV do Pulse, 24/11/2026): o funil enche a caixa nas duas
 * direções — a altura das fatias e a letra saem da altura disponível. Sem
 * folga para nome em cima e número embaixo, os dois vão para a mesma linha.
 *
 * `cruzada` (24/11/2026, migração 113): parte da fatia que fechou OUTRO
 * produto. A fatia se divide — o próprio produto na cor cheia à esquerda, a
 * venda cruzada clara e hachurada à direita — e o número continua o total.
 * A legenda com os nomes fica com quem usa o funil.
 */

export interface EtapaFunil {
  chave: string
  nome: string
  n: number
  /** a cor da etapa na paleta joia */
  joia: LeadFunnelStage
  /** quantos desta etapa fecharam outro produto (só na de vendas) */
  cruzada?: number
}

/** Mistura com branco: 0 = a cor, 1 = branco. */
function clarear(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * t))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function pct(parte: number, base: number): string {
  if (base <= 0) return '—'
  const v = (parte / base) * 100
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })}%`
}

/** Largura aproximada de um texto (Inter/Manrope, peso alto). */
const larguraTexto = (t: string, fs: number) => t.length * fs * 0.6

/** Abaixo disto, as taxas vão para o vão entre as fatias. */
const ESTREITO = 520

const entre = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export function FunilJoia({ etapas, compacto = false, rotulo, escuro = false, preencher = false }: {
  etapas: EtapaFunil[]
  /** ocupa a altura da caixa (o pai dá a altura): fatias e letra crescem junto */
  preencher?: boolean
  /** versão de cartão: fatias mais baixas, mesma forma */
  compacto?: boolean
  /** sobre fundo Marinho (painel da dashboard): taxas e rótulos claros */
  escuro?: boolean
  /** descrição para leitor de tela */
  rotulo: string
}) {
  const id = useId().replace(/:/g, '')
  const caixa = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  const [Hc, setHc] = useState(0)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    // Tamanho de layout, não o da tela: no Pulse o palco de 1600×900 é
    // ampliado por transform, e o tamanho já ampliado seria ampliado de novo.
    const medir = () => {
      setW(el.clientWidth)
      setHc(el.clientHeight)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const estreito = W > 0 && W < ESTREITO
  // Cores das taxas: no claro, o tom médio da etapa; no Marinho, o claro
  // clareado (o médio some no azul) e o fundo da etiqueta em branco translúcido.
  const corTaxa = (j: LeadFunnelStage) => (escuro ? clarear(JOIA[j].claro, 0.55) : JOIA[j].medio)
  const fundoTaxa = (j: LeadFunnelStage) => (escuro ? '#FFFFFF' : JOIA[j].medio)
  const opFundoTaxa = escuro ? 0.09 : 0.12
  const corLado = escuro ? 'rgba(255,255,255,0.62)' : 'var(--t4)'

  // Tipografia em px — igual em qualquer largura.
  let fsNome = compacto ? 12 : (estreito ? 14 : 15)
  let fsNum  = compacto ? 26 : (estreito ? 30 : 40)
  let fsTaxa = compacto ? 14 : 16
  let fsLado = compacto ? 13 : 14

  let H   = compacto ? 58 : (estreito ? 72 : 92)
  let VAO = estreito ? (compacto ? 32 : 36) : (compacto ? 12 : 14)

  // Enchendo a caixa: primeiro a letra das taxas (pela altura), depois o vão
  // que ela pede, e o que sobra é das fatias.
  const n = Math.max(1, etapas.length)
  if (preencher && Hc > 0) {
    fsTaxa = Math.round(entre(Hc / 34, 14, 19))
    fsLado = fsTaxa - 1
    VAO = estreito ? Math.round(fsTaxa * 1.6 + 10) : Math.round(entre(Hc / 40, 10, 18))
    H = Math.round(entre((Hc - 8 - (n - 1) * VAO) / n, 40, 150))
  }
  const umaLinha = preencher && H < 66
  if (preencher && Hc > 0) {
    fsNum  = Math.round(umaLinha ? entre(H * 0.56, 20, 34) : entre(H * 0.42, 28, 60))
    fsNome = Math.round(umaLinha ? entre(H * 0.26, 12, 14) : entre(H * 0.15, 13, 18))
  }
  // Nome e número: na caixa cheia, o par fica centrado na fatia; no padrão,
  // as alturas de sempre. Numa linha só, os dois na linha do meio.
  const bloco = fsNome + 8 + fsNum * 0.72
  const yNome = (y: number) => umaLinha ? y + H / 2 + fsNome * 0.36
    : preencher ? y + (H - bloco) / 2 + fsNome * 0.78 : y + H * 0.36
  const yNum = (y: number) => umaLinha ? y + H / 2 + fsNum * 0.36
    : preencher ? y + (H + bloco) / 2 : y + H * 0.8

  // Espaço lateral para as taxas (só no largo).
  const lado = estreito ? 0 : Math.max(
    larguraTexto('↓ 100%', fsTaxa) + 22,
    larguraTexto('99,9% do total', fsLado),
  ) + 16
  const cx = W / 2
  const TOPO = Math.max(0, Math.min(W - 2 * lado, preencher ? 820 : compacto ? 460 : 640))
  const BASE = TOPO * 0.42
  const passo = (TOPO - BASE) / Math.max(1, etapas.length)
  const altura = etapas.length * (H + VAO) - VAO
  const topo = etapas[0]?.n ?? 0

  const fatias = etapas.map((e, i) => {
    const y = i * (H + VAO)
    const a = TOPO - i * passo, b = TOPO - (i + 1) * passo
    const pts = [[cx - a / 2, y], [cx + a / 2, y], [cx + b / 2, y + H], [cx - b / 2, y + H]]
    // Venda cruzada: o pedaço da direita, na proporção, com o corte inclinado
    // acompanhando as bordas do trapézio.
    let cruz: string | null = null
    let corte: [number, number, number, number] | null = null
    const c = Math.min(e.cruzada ?? 0, e.n)
    if (c > 0 && e.n > 0) {
      const q = (e.n - c) / e.n
      const xt = cx - a / 2 + a * q, xb = cx - b / 2 + b * q
      cruz = [[xt, y], [cx + a / 2, y], [cx + b / 2, y + H], [xb, y + H]].map(p => p.join(',')).join(' ')
      corte = [xt, y, xb, y + H]
    }
    return { ...e, i, y, a, pontos: pts.map(p => p.join(',')).join(' '), cruz, corte }
  })

  const descricao = `${rotulo}: ${etapas.map((e, i) =>
    `${e.nome} ${e.n.toLocaleString('pt-BR')}${i > 0 ? ` (${pct(e.n, etapas[i - 1].n)} da etapa anterior)` : ''}` +
    (e.cruzada ? `, das quais ${e.cruzada.toLocaleString('pt-BR')} fecharam outro produto` : '')).join(', ')}.`

  return (
    <div ref={caixa} className={preencher ? 'relative w-full h-full min-h-0' : 'w-full'}>
      {W > 0 && (!preencher || Hc > 0) && (
        <svg width={W} height={altura + 8} viewBox={`0 -4 ${W} ${altura + 8}`} className={`block overflow-visible ${preencher ? 'absolute left-0' : ''}`}
             style={preencher ? { top: Math.max(0, (Hc - altura - 8) / 2) } : undefined}
             role="img" aria-label={descricao}>
          <defs>
            {fatias.map(f => {
              const j = JOIA[f.joia]
              return (
                <linearGradient key={f.chave} id={`${id}-${f.chave}`} x1="0" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor={clarear(j.claro, 0.3)} />
                  <stop offset="55%" stopColor={clarear(j.claro, 0.12)} />
                  <stop offset="100%" stopColor={j.claro} />
                </linearGradient>
              )
            })}
            <pattern id={`${id}-hachura`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke="#fff" strokeWidth="2.2" strokeOpacity="0.55" />
            </pattern>
          </defs>

          {fatias.map(f => (
            <g key={f.chave} className="funil-fatia" style={{ animationDelay: `${f.i * 90}ms` }}>
              <polygon points={f.pontos} fill={`url(#${id}-${f.chave})`}
                       stroke={escuro ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.7)'} strokeWidth={1.5} strokeLinejoin="round" />
              {f.cruz && f.corte && (
                <>
                  <polygon points={f.cruz} fill="#fff" fillOpacity={0.38} />
                  <polygon points={f.cruz} fill={`url(#${id}-hachura)`} />
                  <line x1={f.corte[0]} y1={f.corte[1]} x2={f.corte[2]} y2={f.corte[3]} stroke="#fff" strokeWidth={2} />
                </>
              )}
              <text x={umaLinha ? cx - 10 : cx} y={yNome(f.y)} textAnchor={umaLinha ? 'end' : 'middle'}
                    style={{ fill: 'rgba(255,255,255,0.95)', fontSize: fsNome, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                {f.nome}
              </text>
              <text x={umaLinha ? cx + 8 : cx} y={yNum(f.y)} textAnchor={umaLinha ? 'start' : 'middle'}
                    className="font-display tabular-nums"
                    style={{ fill: '#fff', fontSize: fsNum, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {f.n.toLocaleString('pt-BR')}
              </text>
            </g>
          ))}

          {/* conversão em cada passagem */}
          {fatias.slice(1).map(f => {
            const anterior = etapas[f.i - 1]
            const meio = f.y - VAO / 2
            const cor = corTaxa(f.joia)
            const passoTxt = `↓ ${pct(f.n, anterior.n)}`

            if (estreito) {
              // Uma etiqueta só, centrada no vão: "↓ 12% avançam · 2,2% do total"
              const total = ` · ${pct(f.n, topo)} do total`
              const w = larguraTexto(passoTxt + ' avançam', fsTaxa) + larguraTexto(total, fsLado) + 20
              return (
                <g key={`taxa-${f.chave}`} aria-hidden>
                  <rect x={cx - w / 2} y={meio - fsTaxa * 0.85} width={w} height={fsTaxa * 1.7} rx={fsTaxa * 0.85}
                        fill={fundoTaxa(f.joia)} fillOpacity={opFundoTaxa} />
                  <text x={cx} y={meio + fsTaxa * 0.36} textAnchor="middle" className="tabular-nums">
                    <tspan style={{ fill: cor, fontSize: fsTaxa, fontWeight: 800 }}>{passoTxt}</tspan>
                    <tspan style={{ fill: cor, fontSize: fsTaxa, fontWeight: 600 }}> avançam</tspan>
                    <tspan style={{ fill: corLado, fontSize: fsLado, fontWeight: 600 }}>{total}</tspan>
                  </text>
                </g>
              )
            }

            const w = larguraTexto(passoTxt, fsTaxa) + 22
            const xd = cx + f.a / 2 + 14
            const xe = cx - f.a / 2 - 14
            return (
              <g key={`taxa-${f.chave}`} aria-hidden>
                <rect x={xd} y={meio - fsTaxa * 0.9} width={w} height={fsTaxa * 1.8} rx={fsTaxa * 0.9}
                      fill={fundoTaxa(f.joia)} fillOpacity={opFundoTaxa} />
                <text x={xd + w / 2} y={meio + fsTaxa * 0.36} textAnchor="middle" className="tabular-nums"
                      style={{ fill: cor, fontSize: fsTaxa, fontWeight: 800 }}>
                  {passoTxt}
                </text>
                <text x={xe} y={meio + fsLado * 0.36} textAnchor="end" className="tabular-nums"
                      style={{ fill: corLado, fontSize: fsLado, fontWeight: 600 }}>
                  {pct(f.n, topo)} do total
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
