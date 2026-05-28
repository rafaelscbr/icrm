// ─── Escritório Virtual Souza Imobiliária ─────────────────────────────────────
// Pixel art top-down office — mostra onde cada corretor está em tempo real

import { useEffect, useMemo } from 'react'
import { usePresenceStore } from '../../store/usePresenceStore'
import { useAuthStore } from '../../store/useAuthStore'
import { PageLayout } from '../../components/layout/PageLayout'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type RoomId = 'admin' | 'campaign' | 'tasks' | 'break'
interface Pos { x: number; y: number }

// ─── Mapeamento página → sala ─────────────────────────────────────────────────
// admin room   = Dashboard, Performance, Admin
// campaign     = Campanhas, Metas
// tasks        = Tarefas, Leads, Contatos, Imóveis, Vendas, Permuta, ...
// break        = offline

function pageToRoom(page: string): RoomId {
  if (page === '/' || page.startsWith('/performance') || page.startsWith('/admin')) return 'admin'
  if (page.startsWith('/campanhas') || page.startsWith('/metas')) return 'campaign'
  return 'tasks'
}

// ─── Posições dos assentos (centro-inferior do sprite), coords SVG absolutas ──
// Layout:  AdminRoom  0–280 × 0–300
//          CampaignRoom 290–710 × 0–300
//          TaskRoom   720–1000 × 0–300
//          BreakRoom  0–280 × 310–660
//          Corridor   290–1000 × 310–660

const SEATS: Record<RoomId, Pos[]> = {
  admin: [
    { x: 103, y: 178 }, { x: 168, y: 173 },
    { x: 50,  y: 238 }, { x: 50,  y: 260 },
    { x: 230, y: 200 }, { x: 145, y: 205 },
  ],
  campaign: [
    { x: 365, y: 120 }, { x: 420, y: 113 }, { x: 475, y: 110 },
    { x: 535, y: 113 }, { x: 595, y: 120 },
    { x: 365, y: 232 }, { x: 420, y: 238 }, { x: 475, y: 241 },
    { x: 535, y: 238 }, { x: 595, y: 232 },
  ],
  tasks: [
    { x: 762, y: 122 }, { x: 842, y: 122 }, { x: 922, y: 122 },
    { x: 762, y: 222 }, { x: 842, y: 222 }, { x: 922, y: 222 },
  ],
  break: [
    { x: 58,  y: 590 }, { x: 118, y: 590 }, { x: 178, y: 590 }, { x: 238, y: 590 },
    { x: 78,  y: 465 }, { x: 198, y: 500 },
  ],
}

// Admin (Rafael) sempre neste assento
const ADMIN_SEAT: Pos = { x: 148, y: 272 }

// ─── Paletas de personagem ────────────────────────────────────────────────────

const PALETTES = [
  { shirt: '#3b82f6', pants: '#1e3a5f', hair: '#4a3420' },
  { shirt: '#ef4444', pants: '#3d1c1c', hair: '#111'    },
  { shirt: '#22c55e', pants: '#14532d', hair: '#704214' },
  { shirt: '#f59e0b', pants: '#451a03', hair: '#2c1a0a' },
  { shirt: '#a855f7', pants: '#2e1065', hair: '#4a3420' },
  { shirt: '#06b6d4', pants: '#164e63', hair: '#c4a882' },
  { shirt: '#f43f5e', pants: '#4c0519', hair: '#111'    },
  { shirt: '#84cc16', pants: '#1a2e05', hair: '#8B5E3C' },
]
const SKIN = '#f5c5a3'

function charColors(name: string) {
  let h = 0
  for (const c of name) h = ((h << 5) - h) + c.charCodeAt(0)
  return PALETTES[Math.abs(h) % PALETTES.length]
}

// ─── Sprite de personagem pixel art ──────────────────────────────────────────

function PixelChar({ cx, cy, name, isAdmin = false }: {
  cx: number; cy: number; name: string; isAdmin?: boolean
}) {
  const c = charColors(name)
  const p = 3 // 1 "pixel" = 3 SVG units → sprite ≈ 36×54 SVG units
  const ox = Math.round(cx - 6 * p)
  const oy = Math.round(cy - 18 * p)
  const label = name.split(' ')[0].toUpperCase().substring(0, 7)

  return (
    <g style={{ transition: 'transform 1.5s cubic-bezier(0.4,0,0.2,1)' }}
       transform={`translate(${ox},${oy})`}>
      <g className="char-bounce">

        {/* ── Coroa / admin badge ── */}
        {isAdmin && <>
          <rect x={3*p} y={-2*p} width={6*p} height={p}   fill="#f59e0b"/>
          <rect x={4*p} y={-3*p} width={p}   height={p}   fill="#f59e0b"/>
          <rect x={6*p} y={-3*p} width={p}   height={p}   fill="#f59e0b"/>
          <rect x={8*p} y={-3*p} width={p}   height={p}   fill="#f59e0b"/>
          <rect x={4*p} y={-2*p} width={4*p} height={p}   fill="#fcd34d" opacity={0.5}/>
        </>}

        {/* ── Cabelo ── */}
        <rect x={4*p} y={0}    width={4*p} height={p}   fill={c.hair}/>
        <rect x={3*p} y={p}    width={p}   height={p}   fill={c.hair}/>
        <rect x={8*p} y={p}    width={p}   height={p}   fill={c.hair}/>

        {/* ── Cabeça / rosto ── */}
        <rect x={3*p} y={2*p}  width={p}   height={2*p} fill={SKIN}/>
        <rect x={4*p} y={p}    width={4*p} height={4*p} fill={SKIN}/>
        <rect x={8*p} y={2*p}  width={p}   height={2*p} fill={SKIN}/>

        {/* olhos */}
        <rect x={4*p+2} y={2*p} width={p} height={p} fill="#1a1a2e"/>
        <rect x={7*p-2} y={2*p} width={p} height={p} fill="#1a1a2e"/>
        {/* boca */}
        <rect x={5*p}   y={4*p} width={2*p} height={p-1} fill="#c97070"/>

        {/* ── Pescoço ── */}
        <rect x={5*p} y={5*p}  width={2*p} height={p}   fill={SKIN}/>

        {/* ── Camisa / corpo ── */}
        <rect x={3*p} y={6*p}  width={6*p} height={5*p} fill={c.shirt}/>
        <rect x={3*p} y={6*p}  width={6*p} height={p}   fill="rgba(255,255,255,0.2)"/>

        {/* braços */}
        <rect x={2*p} y={6*p}  width={p}   height={4*p} fill={c.shirt}/>
        <rect x={9*p} y={6*p}  width={p}   height={4*p} fill={c.shirt}/>
        {/* mãos */}
        <rect x={2*p} y={9*p}  width={p}   height={p+1} fill={SKIN}/>
        <rect x={9*p} y={9*p}  width={p}   height={p+1} fill={SKIN}/>

        {/* ── Cinto ── */}
        <rect x={3*p} y={11*p} width={6*p} height={p}   fill="#5c3d11"/>
        <rect x={5*p} y={11*p} width={2*p} height={p}   fill="#8B5E3C"/>

        {/* ── Calça ── */}
        <rect x={3*p} y={12*p} width={2*p+1} height={4*p} fill={c.pants}/>
        <rect x={5*p} y={12*p} width={2*p}   height={2*p} fill={c.pants}/>
        <rect x={7*p-1} y={12*p} width={2*p+1} height={4*p} fill={c.pants}/>
        <rect x={3*p} y={12*p} width={p}       height={4*p} fill="rgba(0,0,0,0.2)"/>

        {/* ── Sapatos ── */}
        <rect x={2*p} y={16*p} width={3*p+1} height={2*p} fill="#1a1a2e"/>
        <rect x={7*p-1} y={16*p} width={3*p+1} height={2*p} fill="#1a1a2e"/>
        <rect x={2*p} y={16*p} width={3*p+1} height={p}   fill="rgba(255,255,255,0.1)"/>
        <rect x={7*p-1} y={16*p} width={3*p+1} height={p} fill="rgba(255,255,255,0.1)"/>

        {/* ── Etiqueta nome ── */}
        <rect x={-3} y={18*p+2} width={12*p+6} height={9} fill="rgba(0,0,0,0.8)" rx={2}/>
        <text x={6*p} y={18*p+9} textAnchor="middle" fontSize={6}
              fill="white" fontFamily="monospace" fontWeight="bold">
          {label}
        </text>
        {isAdmin && (
          <text x={6*p} y={18*p+16} textAnchor="middle" fontSize={4.5}
                fill="#fcd34d" fontFamily="monospace">
            ADMIN
          </text>
        )}
      </g>
    </g>
  )
}

// ─── SVG do escritório ────────────────────────────────────────────────────────

interface OfficeSVGProps {
  brokerSeats: Array<{ name: string; room: RoomId; seat: Pos; page: string }>
  adminName: string
  offlineNames: string[]
}

function OfficeSVG({ brokerSeats, adminName, offlineNames }: OfficeSVGProps) {
  // Offline brokers ocupam cadeiras da Copa
  const breakSeats: Array<{ name: string; seat: Pos }> = offlineNames.map((n, i) => ({
    name: n,
    seat: SEATS.break[i % SEATS.break.length],
  }))

  return (
    <svg
      viewBox="0 0 1000 660"
      width="100%"
      style={{ imageRendering: 'pixelated', maxHeight: '70vh', display: 'block' }}
      shapeRendering="crispEdges"
    >
      <defs>
        {/* ─ Floor patterns ─ */}
        <pattern id="woodFloor" x="0" y="0" width="24" height="16" patternUnits="userSpaceOnUse">
          <rect width="24" height="16" fill="#2d1f0f"/>
          <rect width="23" height="15" fill="#3a2812"/>
          <rect y="8" width="24" height="1" fill="#2d1f0f" opacity="0.6"/>
        </pattern>
        <pattern id="greenTile" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" fill="#1a2a1a"/>
          <rect width="17" height="17" fill="#1f3021"/>
          <rect x="0" y="0" width="1" height="18" fill="#152015"/>
          <rect x="0" y="0" width="18" height="1" fill="#152015"/>
        </pattern>
        <pattern id="carpetFloor" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#1a1a3d"/>
          <rect x="2" y="2" width="12" height="12" fill="#1f1f4a" opacity="0.8"/>
          <rect x="0" y="7" width="16" height="2" fill="#14143a" opacity="0.5"/>
          <rect x="7" y="0" width="2" height="16" fill="#14143a" opacity="0.5"/>
        </pattern>
        <pattern id="breakTile" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#2a1a14"/>
          <rect width="19" height="19" fill="#341f18"/>
          <rect x="0" y="0" width="1" height="20" fill="#1a1008"/>
          <rect x="0" y="0" width="20" height="1" fill="#1a1008"/>
        </pattern>
        <pattern id="corridorFloor" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
          <rect width="32" height="32" fill="#181828"/>
          <rect width="31" height="31" fill="#1e1e34"/>
          <rect x="0" y="0" width="1" height="32" fill="#121220"/>
          <rect x="0" y="0" width="32" height="1" fill="#121220"/>
          <rect x="15" y="15" width="2" height="2" fill="#252540" opacity="0.8}"/>
        </pattern>

        {/* ─ Animações CSS ─ */}
        <style>{`
          .char-bounce {
            animation: charBounce 0.65s ease-in-out infinite;
            transform-origin: center bottom;
          }
          @keyframes charBounce {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-2px); }
          }
          .tv-pulse { animation: tvGlow 2s ease-in-out infinite; }
          @keyframes tvGlow {
            0%, 100% { opacity: 0.85; }
            50%       { opacity: 1; }
          }
          .bar-anim1 { animation: barUp1 1.8s ease-in-out infinite; }
          .bar-anim2 { animation: barUp2 2.2s ease-in-out infinite; }
          .bar-anim3 { animation: barUp3 1.5s ease-in-out infinite; }
          @keyframes barUp1 { 0%,100%{height:8px;y:82px} 50%{height:14px;y:76px} }
          @keyframes barUp2 { 0%,100%{height:14px;y:76px} 50%{height:20px;y:70px} }
          @keyframes barUp3 { 0%,100%{height:18px;y:72px} 60%{height:10px;y:80px} }
          .kpi-blink { animation: kpiBlink 3s step-start infinite; }
          @keyframes kpiBlink { 0%,100%{opacity:1} 50%{opacity:0.6} }
        `}</style>
      </defs>

      {/* ══════════ FUNDO GERAL ══════════ */}
      <rect width="1000" height="660" fill="#0d0d1a"/>

      {/* ══════════ SALA DO RAFAEL (Admin Room) ══════════ */}
      {/* Fundo da sala */}
      <rect x={0} y={0} width={280} height={300} fill="#1a0a38"/>
      {/* Piso madeira */}
      <rect x={10} y={40} width={260} height={252} fill="url(#woodFloor)"/>
      {/* Parede top */}
      <rect x={0} y={0} width={280} height={10} fill="#140826"/>
      {/* Parede esquerda */}
      <rect x={0} y={0} width={10} height={300} fill="#140826"/>
      {/* Parede direita */}
      <rect x={270} y={0} width={10} height={300} fill="#140826"/>
      {/* Parede bottom */}
      <rect x={0} y={290} width={280} height={10} fill="#140826"/>

      {/* Banner da sala */}
      <rect x={0} y={0} width={280} height={38} fill="#1e0d42"/>
      <text x={140} y={24} textAnchor="middle" fontSize={11} fill="#c084fc"
            fontFamily="monospace" fontWeight="bold">
        ▪ SALA DO RAFAEL ▪
      </text>
      <rect x={0} y={36} width={280} height={2} fill="#7c3aed" opacity={0.6}/>

      {/* ─── 3 TVs com gráficos ─── */}
      {[0,1,2].map(i => {
        const tx = 18 + i * 82
        const ty = 45
        return (
          <g key={`tv${i}`}>
            {/* Moldura */}
            <rect x={tx}   y={ty}   width={68} height={48} fill="#111827"/>
            <rect x={tx+2} y={ty+2} width={64} height={38} fill="#0f172a"/>
            {/* Tela com conteúdo por TV */}
            <g className="tv-pulse">
              {i === 0 && ( /* TV 1: barras de gráfico */
                <>
                  <rect x={tx+4} y={ty+4} width={60} height={36} fill="#0c1445"/>
                  {/* Grid lines */}
                  {[8,16,24,30].map(yy => (
                    <rect key={yy} x={tx+4} y={ty+4+yy} width={60} height={1} fill="#1e3a6e" opacity={0.5}/>
                  ))}
                  {/* Bars */}
                  <rect x={tx+8}  y={ty+28} width={6} height={8}  fill="#22c55e"/>
                  <rect x={tx+17} y={ty+22} width={6} height={14} fill="#3b82f6"/>
                  <rect x={tx+26} y={ty+25} width={6} height={11} fill="#22c55e"/>
                  <rect x={tx+35} y={ty+18} width={6} height={18} fill="#f59e0b"/>
                  <rect x={tx+44} y={ty+21} width={6} height={15} fill="#ef4444"/>
                  <rect x={tx+53} y={ty+16} width={6} height={20} fill="#22c55e"/>
                  {/* Line chart */}
                  <polyline
                    points={`${tx+8},${ty+25} ${tx+17},${ty+19} ${tx+26},${ty+22} ${tx+35},${ty+15} ${tx+44},${ty+18} ${tx+53},${ty+12}`}
                    fill="none" stroke="#a78bfa" strokeWidth={1.5} opacity={0.8}
                  />
                </>
              )}
              {i === 1 && ( /* TV 2: logo + nome */
                <>
                  <rect x={tx+2} y={ty+2} width={64} height={38} fill="#0a0a1f"/>
                  {/* Simulação de logo */}
                  <rect x={tx+22} y={ty+8}  width={24} height={16} fill="#7c3aed" opacity={0.9}/>
                  <rect x={tx+24} y={ty+10} width={20} height={12} fill="#a78bfa" opacity={0.7}/>
                  <text x={tx+34} y={ty+20} textAnchor="middle" fontSize={7} fill="white"
                        fontFamily="monospace" fontWeight="bold">S</text>
                  <text x={tx+34} y={ty+30} textAnchor="middle" fontSize={5}
                        fill="#c084fc" fontFamily="monospace">SOUZA</text>
                  <text x={tx+34} y={ty+36} textAnchor="middle" fontSize={3.5}
                        fill="#9d71e8" fontFamily="monospace">IMOBILIÁRIA</text>
                </>
              )}
              {i === 2 && ( /* TV 3: KPIs numéricos */
                <>
                  <rect x={tx+2} y={ty+2} width={64} height={38} fill="#0c1810"/>
                  <text x={tx+10} y={ty+11} fontSize={5} fill="#86efac" fontFamily="monospace">LEADS</text>
                  <text x={tx+10} y={ty+19} fontSize={9} fill="#22c55e" fontFamily="monospace"
                        fontWeight="bold" className="kpi-blink">47</text>
                  <text x={tx+38} y={ty+11} fontSize={5} fill="#93c5fd" fontFamily="monospace">VISITAS</text>
                  <text x={tx+38} y={ty+19} fontSize={9} fill="#3b82f6" fontFamily="monospace"
                        fontWeight="bold" className="kpi-blink">12</text>
                  <rect x={tx+4} y={ty+22} width={60} height={1} fill="#16a34a" opacity={0.4}/>
                  <text x={tx+10} y={ty+30} fontSize={5} fill="#fcd34d" fontFamily="monospace">VENDAS</text>
                  <text x={tx+10} y={ty+37} fontSize={9} fill="#f59e0b" fontFamily="monospace"
                        fontWeight="bold" className="kpi-blink">R$1.2M</text>
                </>
              )}
            </g>
            {/* Borda TV */}
            <rect x={tx} y={ty} width={68} height={48} fill="none" stroke="#374151" strokeWidth={1.5}/>
            {/* Suporte da TV */}
            <rect x={tx+29} y={ty+48} width={10} height={5} fill="#4b5563"/>
            <rect x={tx+23} y={ty+53} width={22} height={3} fill="#374151"/>
          </g>
        )
      })}

      {/* ─── Sofá (esquerda) ─── */}
      <rect x={14} y={178} width={58} height={32} fill="#4c1d95"/>    {/* base */}
      <rect x={14} y={160} width={58} height={20} fill="#5b21b6"/>    {/* encosto */}
      <rect x={16} y={162} width={27} height={16} fill="#6d28d9"/>    {/* almofada 1 */}
      <rect x={44} y={162} width={26} height={16} fill="#6d28d9"/>    {/* almofada 2 */}
      <rect x={14} y={160} width={6}  height={50} fill="#4c1d95"/>    {/* braço esq */}
      <rect x={66} y={160} width={6}  height={50} fill="#4c1d95"/>    {/* braço dir */}
      {/* Mesa de centro */}
      <rect x={16} y={144} width={56} height={16} fill="#8B5E3C"/>
      <rect x={18} y={145} width={52} height={12} fill="#a06835"/>
      {/* Xícara de café */}
      <rect x={36} y={146} width={6} height={5} fill="#6b4f3a"/>
      <rect x={37} y={143} width={4} height={3} fill="#c97b2e" opacity={0.7}/>

      {/* ─── Cadeiras de cliente ─── */}
      {[82, 152].map((cx2) => (
        <g key={cx2}>
          <rect x={cx2}   y={152} width={24} height={16} fill="#4c1d95"/>
          <rect x={cx2}   y={136} width={24} height={18} fill="#5b21b6"/>
          <rect x={cx2+2} y={164} width={5}  height={8}  fill="#3b0764"/>
          <rect x={cx2+17} y={164} width={5} height={8}  fill="#3b0764"/>
        </g>
      ))}

      {/* ─── Mesa grande do Rafael ─── */}
      <rect x={45} y={242} width={200} height={28} fill="#6b3d18"/>
      <rect x={47} y={243} width={196} height={24} fill="#8B5024"/>
      <rect x={47} y={243} width={196} height={4}  fill="#a06040" opacity={0.6}/>
      {/* Pernas */}
      {[50, 225].map(lx => (
        <rect key={lx} x={lx} y={270} width={10} height={20} fill="#5c3011"/>
      ))}
      {/* Monitor */}
      <rect x={118} y={218} width={54} height={32} fill="#0d1117"/>
      <rect x={120} y={220} width={50} height={26} fill="#1e3a5f"/>
      {/* gráfico no monitor */}
      {[0,1,2,3].map(b => (
        <rect key={b} x={124+b*11} y={234-b*3} width={8} height={8+b*3} fill={['#22c55e','#3b82f6','#f59e0b','#ef4444'][b]} opacity={0.9}/>
      ))}
      <rect x={142} y={250} width={8} height={6} fill="#4b5563"/>
      <rect x={135} y={256} width={22} height={3} fill="#374151"/>
      {/* Papéis na mesa */}
      <rect x={70}  y={248} width={28} height={18} fill="#e8e8f0" opacity={0.85}/>
      <rect x={74}  y={251} width={20} height={1}  fill="#9ca3af"/>
      <rect x={74}  y={254} width={16} height={1}  fill="#9ca3af"/>
      <rect x={74}  y={257} width={18} height={1}  fill="#9ca3af"/>
      <rect x={195} y={248} width={22} height={14} fill="#fef3c7" opacity={0.8}/>
      {/* Caneta */}
      <rect x={80}  y={244} width={2}  height={14} fill="#dc2626"/>

      {/* ─── Estante de livros (direita) ─── */}
      <rect x={257} y={42} width={12} height={246} fill="#5c3d11"/>
      <rect x={258} y={44} width={10} height={50}  fill="#3b82f6" opacity={0.75}/>
      <rect x={258} y={97} width={10} height={40}  fill="#ef4444" opacity={0.75}/>
      <rect x={258} y={140} width={10} height={45} fill="#22c55e" opacity={0.75}/>
      <rect x={258} y={188} width={10} height={40} fill="#f59e0b" opacity={0.75}/>
      <rect x={258} y={232} width={10} height={50} fill="#a855f7" opacity={0.75}/>
      {/* Prateleiras */}
      {[96, 139, 187, 231].map(sy => (
        <rect key={sy} x={257} y={sy} width={12} height={2} fill="#3d2508"/>
      ))}

      {/* ─── Planta (canto) ─── */}
      <rect x={247} y={268} width={16} height={14} fill="#92400e"/>
      <rect x={249} y={271} width={12} height={10} fill="#78350f"/>
      {[0,1,2].map(i => (
        <g key={i}>
          <rect x={249+i*4} y={253} width={4} height={17} fill="#15803d"/>
          <rect x={246+i*5} y={248} width={8} height={7}  fill="#16a34a" opacity={0.85}/>
        </g>
      ))}

      {/* Porta da sala do Rafael → direita */}
      <rect x={270} y={165} width={10} height={40} fill="#2a1a54" opacity={0.7}/>
      <rect x={271} y={167} width={8}  height={36} fill="#1e0d42"/>

      {/* ══════════ SALA DE CAMPANHAS (Campaign Room) ══════════ */}
      <rect x={290} y={0} width={420} height={300} fill="#0f1f0f"/>
      <rect x={300} y={40} width={400} height={252} fill="url(#greenTile)"/>
      <rect x={290} y={0} width={420} height={10}  fill="#071007"/>
      <rect x={290} y={0} width={10}  height={300} fill="#071007"/>
      <rect x={700} y={0} width={10}  height={300} fill="#071007"/>
      <rect x={290} y={290} width={420} height={10} fill="#071007"/>

      {/* Banner */}
      <rect x={290} y={0} width={420} height={38} fill="#0d1f0d"/>
      <text x={500} y={24} textAnchor="middle" fontSize={11} fill="#4ade80"
            fontFamily="monospace" fontWeight="bold">
        ▪ SALA DE CAMPANHAS ▪
      </text>
      <rect x={290} y={36} width={420} height={2} fill="#16a34a" opacity={0.6}/>

      {/* Quadro branco (esquerda) */}
      <rect x={302} y={46} width={55} height={80} fill="#1a2f1a"/>
      <rect x={304} y={48} width={51} height={76} fill="#e8f5e9" opacity={0.9}/>
      <rect x={308} y={52} width={43} height={1}  fill="#4ade80" opacity={0.6}/>
      {/* rascunhos no quadro */}
      <rect x={308} y={56} width={30} height={1} fill="#9ca3af"/>
      <rect x={308} y={60} width={25} height={1} fill="#9ca3af"/>
      <rect x={308} y={64} width={35} height={1} fill="#9ca3af"/>
      {/* "funil" desenhado */}
      <polygon points="320,70 336,70 332,88 324,88" fill="none" stroke="#22c55e" strokeWidth={1.5}/>
      <text x={328} y={100} textAnchor="middle" fontSize={5} fill="#374151" fontFamily="monospace">FUNIL</text>
      {/* Apoio do quadro */}
      <rect x={318} y={126} width={22} height={4} fill="#374151"/>

      {/* Bandeiras (flags) no fundo */}
      {[320, 390, 460, 530, 600, 670].map((fx, i) => (
        <g key={`flag${i}`}>
          <rect x={fx} y={42} width={2} height={30} fill="#4b5563"/>
          <rect x={fx+2} y={44} width={18} height={12}
                fill={['#dc2626','#2563eb','#16a34a','#d97706','#7c3aed','#0891b2'][i % 6]}
                opacity={0.85}/>
        </g>
      ))}

      {/* Mesa de conferência central */}
      {/* Superfície */}
      <rect x={340} y={130} width={320} height={90} fill="#5c3d11"/>
      <rect x={342} y={132} width={316} height={86} fill="#78501a"/>
      <rect x={342} y={132} width={316} height={6}  fill="#946030" opacity={0.6}/>
      {/* Pernas */}
      {[345, 640].map(lx => (
        <rect key={lx} x={lx} y={218} width={12} height={20} fill="#4a2c0a"/>
      ))}

      {/* Cadeiras em torno da mesa */}
      {/* Row superior (acima da mesa) */}
      {[352, 410, 468, 528, 586].map(cx3 => (
        <g key={`ctop${cx3}`}>
          <rect x={cx3}   y={118} width={24} height={16} fill="#1a4a1a"/>
          <rect x={cx3}   y={108} width={24} height={12} fill="#1f5c1f"/>
          <rect x={cx3+2} y={132} width={5}  height={6}  fill="#143a14"/>
          <rect x={cx3+17} y={132} width={5} height={6}  fill="#143a14"/>
        </g>
      ))}
      {/* Row inferior (abaixo da mesa) */}
      {[352, 410, 468, 528, 586].map(cx3 => (
        <g key={`cbot${cx3}`}>
          <rect x={cx3}   y={222} width={24} height={16} fill="#1a4a1a"/>
          <rect x={cx3}   y={236} width={24} height={12} fill="#1f5c1f"/>
          <rect x={cx3+2} y={237} width={5}  height={6}  fill="#143a14"/>
          <rect x={cx3+17} y={237} width={5} height={6}  fill="#143a14"/>
        </g>
      ))}

      {/* Pizza box */}
      <rect x={396} y={148} width={28} height={22} fill="#d97706"/>
      <rect x={397} y={149} width={26} height={20} fill="#f59e0b" opacity={0.9}/>
      <rect x={397} y={149} width={26} height={4}  fill="#d97706" opacity={0.5}/>
      {/* pizza dentro */}
      <rect x={399} y={153} width={22} height={14} fill="#dc7a3a"/>
      {[0,1,2].map(s => (
        <rect key={s} x={401+s*7} y={155} width={5} height={5} fill="#dc2626" opacity={0.8}/>
      ))}
      <text x={409} y={146} textAnchor="middle" fontSize={5} fill="#d97706" fontFamily="monospace">🍕</text>

      {/* Energéticos */}
      {[450, 464, 478].map((ex) => (
        <g key={ex}>
          <rect x={ex} y={148} width={8} height={18} fill={ex===450?'#dc2626':ex===464?'#2563eb':'#16a34a'}/>
          <rect x={ex} y={148} width={8} height={4}  fill="rgba(255,255,255,0.3)"/>
        </g>
      ))}

      {/* Notebook na mesa */}
      <rect x={530} y={150} width={40} height={26} fill="#1f2937"/>
      <rect x={532} y={152} width={36} height={20} fill="#1e3a5f"/>
      {[0,1,2].map(b2 => (
        <rect key={b2} x={535+b2*10} y={162} width={7} height={5+b2*2}
              fill={['#22c55e','#3b82f6','#f59e0b'][b2]} opacity={0.9}/>
      ))}
      <rect x={530} y={176} width={40} height={4} fill="#374151"/>

      {/* Planta canto campaign */}
      <rect x={692} y={266} width={14} height={12} fill="#92400e"/>
      {[0,1].map(i => (
        <g key={i}>
          <rect x={693+i*5} y={252} width={4} height={16} fill="#15803d"/>
          <rect x={691+i*6} y={247} width={8} height={6}  fill="#16a34a" opacity={0.8}/>
        </g>
      ))}

      {/* Porta (para corredor) */}
      <rect x={290} y={165} width={10} height={40} fill="#071007" opacity={0.8}/>
      <rect x={700} y={165} width={10} height={40} fill="#071007" opacity={0.8}/>

      {/* ══════════ SALA DE TAREFAS (Task Room) ══════════ */}
      <rect x={720} y={0} width={280} height={300} fill="#0f0f2a"/>
      <rect x={730} y={40} width={260} height={252} fill="url(#carpetFloor)"/>
      <rect x={720} y={0} width={280} height={10}   fill="#07071a"/>
      <rect x={720} y={0} width={10}   height={300} fill="#07071a"/>
      <rect x={990} y={0} width={10}   height={300} fill="#07071a"/>
      <rect x={720} y={290} width={280} height={10} fill="#07071a"/>

      {/* Banner */}
      <rect x={720} y={0} width={280} height={38} fill="#0f0f28"/>
      <text x={860} y={24} textAnchor="middle" fontSize={11} fill="#818cf8"
            fontFamily="monospace" fontWeight="bold">
        ▪ SALA DE TAREFAS ▪
      </text>
      <rect x={720} y={36} width={280} height={2} fill="#4f46e5" opacity={0.6}/>

      {/* Quadro de tarefas (esquerda) */}
      <rect x={732} y={46} width={45} height={80} fill="#0f0f28"/>
      <rect x={734} y={48} width={41} height={76} fill="#1e1e44"/>
      <text x={754} y={60} textAnchor="middle" fontSize={5} fill="#818cf8" fontFamily="monospace">TO-DO</text>
      {['[ ] Proposta', '[ ] Visita', '[x] Follow', '[ ] Agrênci'].map((t, i) => (
        <text key={i} x={736} y={70+i*10} fontSize={4.5} fill={t.startsWith('[x]') ? '#4ade80' : '#94a3b8'}
              fontFamily="monospace">{t}</text>
      ))}
      <rect x={742} y={128} width={24} height={4} fill="#374151"/>

      {/* Mesas individuais — 2 linhas x 3 colunas */}
      {[0,1,2].map(col => [0,1].map(row => {
        const dx = 748 + col * 80
        const dy = 88 + row * 100
        return (
          <g key={`desk${col}-${row}`}>
            {/* Mesa */}
            <rect x={dx-18} y={dy} width={36} height={22} fill="#5c3d11"/>
            <rect x={dx-16} y={dy+1} width={32} height={19} fill="#78501a"/>
            <rect x={dx-16} y={dy+1} width={32} height={3} fill="#a06040" opacity={0.5}/>
            {/* Pernas */}
            <rect x={dx-16} y={dy+22} width={5} height={12} fill="#4a2c0a"/>
            <rect x={dx+11} y={dy+22} width={5} height={12} fill="#4a2c0a"/>
            {/* Monitor */}
            <rect x={dx-10} y={dy-18} width={20} height={22} fill="#0d1117"/>
            <rect x={dx-8}  y={dy-16} width={16} height={18} fill="#1e3a5f"/>
            {/* Tela */}
            {[0,1,2].map(b3 => (
              <rect key={b3} x={dx-6+b3*5} y={dy-8} width={3} height={5+b3*2}
                    fill={['#3b82f6','#22c55e','#f59e0b'][b3]} opacity={0.9}/>
            ))}
            {/* Suporte monitor */}
            <rect x={dx-3} y={dy+4} width={6} height={4} fill="#4b5563"/>
            {/* Cadeira */}
            <rect x={dx-9} y={dy+34} width={18} height={12} fill="#2a2a5c"/>
            <rect x={dx-9} y={dy+24} width={18} height={12} fill="#32327a"/>
            <rect x={dx-8} y={dy+44} width={4} height={8}  fill="#1e1e4a"/>
            <rect x={dx+4} y={dy+44} width={4} height={8}  fill="#1e1e4a"/>
            {/* Planta na mesa */}
            <rect x={dx+6} y={dy-4}  width={6} height={6} fill="#78350f"/>
            <rect x={dx+7} y={dy-9}  width={4} height={6} fill="#15803d"/>
            <rect x={dx+5} y={dy-11} width={7} height={4} fill="#16a34a" opacity={0.8}/>
          </g>
        )
      }))}

      {/* Porta task room */}
      <rect x={720} y={165} width={10} height={40} fill="#07071a" opacity={0.8}/>

      {/* ══════════ COPA / CAFÉ (Break Room) ══════════ */}
      <rect x={0} y={310} width={280} height={350} fill="#1f0f0f"/>
      <rect x={10} y={350} width={260} height={302} fill="url(#breakTile)"/>
      <rect x={0} y={310} width={280} height={10}   fill="#0f0808"/>
      <rect x={0} y={310} width={10}   height={350} fill="#0f0808"/>
      <rect x={270} y={310} width={10}  height={350} fill="#0f0808"/>
      <rect x={0} y={650} width={280}  height={10}  fill="#0f0808"/>

      {/* Banner */}
      <rect x={0} y={310} width={280} height={38} fill="#1a0c0c"/>
      <text x={140} y={334} textAnchor="middle" fontSize={11} fill="#fb923c"
            fontFamily="monospace" fontWeight="bold">
        ▪ COPA & CAFÉ ▪
      </text>
      <rect x={0} y={346} width={280} height={2} fill="#ea580c" opacity={0.6}/>

      {/* ─── Máquina de café (parede superior) ─── */}
      <rect x={14} y={358} width={30} height={50} fill="#374151"/>
      <rect x={16} y={360} width={26} height={40} fill="#1f2937"/>
      <rect x={18} y={362} width={22} height={20} fill="#111827"/>
      <rect x={20} y={364} width={18} height={16} fill="#0369a1" opacity={0.8}/>
      {/* botões */}
      <rect x={20} y={382} width={4} height={4} fill="#dc2626"/>
      <rect x={26} y={382} width={4} height={4} fill="#22c55e"/>
      <rect x={32} y={382} width={4} height={4} fill="#f59e0b"/>
      {/* bocal */}
      <rect x={27} y={398} width={4} height={6} fill="#4b5563"/>
      <rect x={26} y={406} width={3} height={4} fill="#92400e" opacity={0.7}/>
      {/* Prateleira */}
      <rect x={14} y={408} width={30} height={4} fill="#4b5563"/>
      {/* Xícaras */}
      {[0,1,2].map(i => (
        <g key={i}>
          <rect x={16+i*9} y={412} width={8} height={6} fill="#7c3aed"/>
          <rect x={17+i*9} y={410} width={6} height={3} fill="#6d28d9"/>
        </g>
      ))}
      {/* Fumaça */}
      <text x={30} y={357} fontSize={8} fill="#9ca3af" opacity={0.7}>~</text>

      {/* ─── Máquina de vending (direita) ─── */}
      <rect x={245} y={358} width={30} height={65} fill="#1f2937"/>
      <rect x={247} y={360} width={26} height={45} fill="#374151"/>
      <rect x={249} y={362} width={22} height={30} fill="#0d1117"/>
      {/* produtos */}
      {[0,1,2].map(row => [0,1].map(col => (
        <rect key={`vm${row}${col}`} x={251+col*11} y={364+row*10} width={9} height={8}
              fill={['#dc2626','#2563eb','#f59e0b','#22c55e','#a855f7','#06b6d4'][row*2+col]}
              opacity={0.8}/>
      )))}
      {/* slot */}
      <rect x={250} y={392} width={20} height={3} fill="#0d1117"/>
      {/* botões */}
      {[0,1,2].map(i => (
        <rect key={i} x={251+i*7} y={398} width={5} height={5} fill="#374151"/>
      ))}

      {/* ─── Mesa redonda com cadeiras ─── */}
      {/* Mesa */}
      <rect x={130} y={415} width={70} height={55} fill="#8B5E3C" style={{ borderRadius: '50%' }}/>
      <rect x={132} y={417} width={66} height={51} fill="#a06835"/>
      <rect x={132} y={417} width={66} height={5}  fill="#b07845" opacity={0.5}/>
      {/* Pernas */}
      <rect x={140} y={470} width={8} height={14} fill="#5c3d11"/>
      <rect x={185} y={470} width={8} height={14} fill="#5c3d11"/>
      {/* Cadeiras em torno */}
      {[[ 120,430,'left'],[170,430,'right'],[130,395,'top'],[162,395,'top']].map(([cx4,cy4,], i) => (
        <g key={i}>
          <rect x={Number(cx4)-12} y={Number(cy4)-12} width={24} height={16} fill="#92400e"/>
          <rect x={Number(cx4)-12} y={Number(cy4)-24} width={24} height={14} fill="#a05020"/>
          <rect x={Number(cx4)-10} y={Number(cy4)+4}  width={5}  height={8}  fill="#78350f"/>
          <rect x={Number(cx4)+5}  y={Number(cy4)+4}  width={5}  height={8}  fill="#78350f"/>
        </g>
      ))}
      {/* Itens na mesa */}
      <rect x={145} y={428} width={12} height={8} fill="#1f2937"/> {/* tablete/phone */}
      <rect x={162} y={428} width={8}  height={8} fill="#92400e"/> {/* xícara */}
      <rect x={163} y={426} width={6}  height={3} fill="#7c3aed"/>

      {/* ─── Sofá (fundo) ─── */}
      <rect x={14} y={570} width={120} height={36} fill="#7f1d1d"/>
      <rect x={14} y={550} width={120} height={22} fill="#991b1b"/>
      <rect x={16} y={552} width={57} height={18} fill="#b91c1c"/>
      <rect x={75} y={552} width={57} height={18} fill="#b91c1c"/>
      <rect x={14} y={550} width={6}  height={56} fill="#7f1d1d"/>
      <rect x={128} y={550} width={6} height={56} fill="#7f1d1d"/>
      {/* Almofada */}
      <rect x={57} y={556} width={24} height={12} fill="#9b1414" opacity={0.6}/>
      <text x={70} y={568} textAnchor="middle" fontSize={8} fill="#f87171" opacity={0.8}>zzz</text>

      {/* Plantas break room */}
      {[16, 248].map((px2, pi) => (
        <g key={pi}>
          <rect x={px2} y={628} width={16} height={14} fill="#92400e"/>
          <rect x={px2+2} y={631} width={12} height={10} fill="#78350f"/>
          <rect x={px2+2} y={612} width={4}  height={18} fill="#15803d"/>
          <rect x={px2+7} y={614} width={4}  height={18} fill="#15803d"/>
          <rect x={px2}   y={608} width={12} height={7}  fill="#16a34a" opacity={0.85}/>
        </g>
      ))}

      {/* ══════════ CORREDOR / ÁREA COMUM ══════════ */}
      <rect x={290} y={310} width={710} height={350} fill="#0d0d1e"/>
      <rect x={300} y={350} width={690} height={302} fill="url(#corridorFloor)"/>
      <rect x={290} y={310} width={710} height={10}  fill="#060610"/>
      <rect x={290} y={310} width={10}  height={350} fill="#060610"/>
      <rect x={990} y={310} width={10}  height={350} fill="#060610"/>
      <rect x={290} y={650} width={710} height={10}  fill="#060610"/>

      {/* Banner corredor */}
      <rect x={290} y={310} width={710} height={38} fill="#0a0a1a"/>
      <text x={645} y={334} textAnchor="middle" fontSize={11} fill="#64748b"
            fontFamily="monospace" fontWeight="bold">
        ▪ ÁREA COMUM ▪
      </text>
      <rect x={290} y={346} width={710} height={2} fill="#334155" opacity={0.6}/>

      {/* Logo central */}
      <rect x={550} y={380} width={190} height={110} fill="#0f0f2a" opacity={0.8}/>
      <rect x={552} y={382} width={186} height={106} fill="#0d0d28"/>
      <rect x={552} y={382} width={186} height={3} fill="#4f46e5" opacity={0.5}/>
      <text x={645} y={415} textAnchor="middle" fontSize={18} fill="#7c3aed"
            fontFamily="monospace" fontWeight="bold">SOUZA</text>
      <text x={645} y={432} textAnchor="middle" fontSize={9} fill="#6d28d9"
            fontFamily="monospace">IMOBILIÁRIA</text>
      <rect x={570} y={438} width={150} height={1} fill="#4f46e5" opacity={0.4}/>
      <text x={645} y={452} textAnchor="middle" fontSize={6.5} fill="#4338ca"
            fontFamily="monospace">ESCRITÓRIO VIRTUAL</text>
      {/* Estrelinhas decorativas */}
      {[310,340,370,400,430,460,490,520].map((sx, si) => (
        <rect key={si} x={sx} y={490+si%3*8} width={2} height={2}
              fill="#818cf8" opacity={0.4 + si*0.07}/>
      ))}
      {[670,700,730,760,790,820,850,880].map((sx, si) => (
        <rect key={si} x={sx} y={490+si%3*8} width={2} height={2}
              fill="#818cf8" opacity={0.4 + si*0.07}/>
      ))}

      {/* Mural de recados (esquerda do corredor) */}
      <rect x={302} y={358} width={55} height={75} fill="#1e1e3a"/>
      <rect x={304} y={360} width={51} height={71} fill="#fef3c7" opacity={0.9}/>
      <text x={329} y={370} textAnchor="middle" fontSize={5.5} fill="#374151" fontFamily="monospace" fontWeight="bold">AVISOS</text>
      <rect x={306} y={372} width={47} height={1} fill="#9ca3af"/>
      {['☎ Reunião 14h', '✔ Meta: 50 leads', '✉ Emails: 8', '🏠 Visita 10h'].map((t, i) => (
        <text key={i} x={308} y={381+i*10} fontSize={4.5} fill="#374151" fontFamily="monospace">{t}</text>
      ))}
      {/* Pushpins */}
      {[310,340].map((px3) => (
        <rect key={px3} x={px3} y={360} width={4} height={4} fill="#dc2626"/>
      ))}

      {/* Plantas no corredor */}
      {[305, 490, 670, 855].map((px4, pi4) => (
        <g key={pi4}>
          <rect x={px4} y={630} width={12} height={10} fill="#92400e"/>
          <rect x={px4+1} y={632} width={10} height={8} fill="#78350f"/>
          <rect x={px4+2} y={618} width={3} height={14} fill="#15803d"/>
          <rect x={px4+6} y={620} width={3} height={14} fill="#15803d"/>
          <rect x={px4} y={614} width={10} height={6} fill="#16a34a" opacity={0.8}/>
        </g>
      ))}

      {/* Setas de direção para as salas */}
      {/* ↑ Admin */}
      <text x={315} y={440} fontSize={8} fill="#c084fc" fontFamily="monospace" opacity={0.7}>↑ Admin</text>
      {/* ↑ Campaign */}
      <text x={455} y={440} fontSize={8} fill="#4ade80" fontFamily="monospace" opacity={0.7}>↑ Campanhas</text>
      {/* ↑ Tasks */}
      <text x={750} y={440} fontSize={8} fill="#818cf8" fontFamily="monospace" opacity={0.7}>↑ Tarefas</text>
      {/* ← Break */}
      <text x={302} y={530} fontSize={7} fill="#fb923c" fontFamily="monospace" opacity={0.7}>← Copa</text>

      {/* ════════════ PERSONAGENS ════════════ */}
      {/* Admin (Rafael) sempre no seu assento */}
      <PixelChar cx={ADMIN_SEAT.x} cy={ADMIN_SEAT.y} name={adminName} isAdmin/>

      {/* Corretores online — posicionados na sala certa */}
      {brokerSeats.map(({ name, seat }) => (
        <PixelChar key={name} cx={seat.x} cy={seat.y} name={name}/>
      ))}

      {/* Corretores offline — na copa */}
      {breakSeats.map(({ name, seat }) => (
        <PixelChar key={`off-${name}`} cx={seat.x} cy={seat.y} name={name}/>
      ))}

      {/* Separadores entre salas (linhas de parede) */}
      <rect x={280} y={0}   width={10} height={300} fill="#0d0d1a"/>
      <rect x={710} y={0}   width={10} height={300} fill="#0d0d1a"/>
      <rect x={0}   y={300} width={1000} height={10} fill="#0d0d1a"/>
      <rect x={280} y={310} width={10} height={350} fill="#0d0d1a"/>
    </svg>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function VirtualOfficePage() {
  const { onlineBrokers } = usePresenceStore()
  const { allProfiles, profile: me, fetchAllProfiles } = useAuthStore()

  // Garante que temos todos os perfis para mostrar offline
  useEffect(() => {
    if (allProfiles.length === 0) fetchAllProfiles()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Nome do admin (primeiro admin nos profiles ou o usuário atual se for admin)
  const adminName = useMemo(() => {
    const admin = allProfiles.find(p => p.role === 'admin') ?? (me?.role === 'admin' ? me : null)
    return admin?.name ?? 'Rafael'
  }, [allProfiles, me])

  // Distribui assentos para corretores online
  const brokerSeats = useMemo(() => {
    const counts: Record<RoomId, number> = { admin: 0, campaign: 0, tasks: 0, break: 0 }
    return onlineBrokers
      .filter(b => b.role !== 'admin')
      .map(b => {
        const room = pageToRoom(b.currentPage)
        const idx  = counts[room]++
        const seat = SEATS[room][idx % SEATS[room].length]
        return { name: b.name, room, seat, page: b.currentPage }
      })
  }, [onlineBrokers])

  // Corretores offline (estão nos profiles mas não no presence)
  const offlineNames = useMemo(() => {
    const onlineSet = new Set(onlineBrokers.map(b => b.name))
    return allProfiles
      .filter(p => p.role === 'broker' && p.active && !onlineSet.has(p.name))
      .map(p => p.name)
  }, [allProfiles, onlineBrokers])

  // Quem está em cada sala (para o painel lateral)
  const roomSummary: Record<RoomId, string[]> = {
    admin:    [adminName, ...brokerSeats.filter(b => b.room === 'admin').map(b => b.name)],
    campaign: brokerSeats.filter(b => b.room === 'campaign').map(b => b.name),
    tasks:    brokerSeats.filter(b => b.room === 'tasks').map(b => b.name),
    break:    offlineNames,
  }

  const ROOM_META: Record<RoomId, { label: string; color: string; dot: string }> = {
    admin:    { label: 'Sala do Rafael',       color: 'bg-purple-500/20 border-purple-500/30 text-purple-300', dot: 'bg-purple-400' },
    campaign: { label: 'Sala de Campanhas',    color: 'bg-green-500/20  border-green-500/30  text-green-300',  dot: 'bg-green-400'  },
    tasks:    { label: 'Sala de Tarefas',      color: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300', dot: 'bg-indigo-400' },
    break:    { label: 'Copa & Café',          color: 'bg-orange-500/20 border-orange-500/30 text-orange-300', dot: 'bg-orange-400' },
  }

  return (
    <PageLayout
      title="Escritório Virtual"
      subtitle="Souza Imobiliária — ao vivo"
    >
      {/* Legenda rápida */}
      <div className="flex flex-wrap gap-3 mb-4">
        {(Object.keys(roomSummary) as RoomId[]).map(room => {
          const meta  = ROOM_META[room]
          const names = roomSummary[room]
          if (names.length === 0 && room !== 'admin') return null
          return (
            <div key={room} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${meta.color}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`}/>
              <span className="font-semibold">{meta.label}</span>
              {names.length > 0 && (
                <span className="opacity-70">
                  {names.slice(0, 4).join(', ')}{names.length > 4 ? ` +${names.length - 4}` : ''}
                </span>
              )}
              {names.length === 0 && <span className="opacity-50">vazia</span>}
            </div>
          )
        })}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-line bg-s2/50 text-xs text-slate-500 ml-auto">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
          Tempo real · {onlineBrokers.length} online
        </div>
      </div>

      {/* Escritório SVG */}
      <div className="w-full overflow-x-auto rounded-2xl border border-line" style={{ background: '#0d0d1a' }}>
        <OfficeSVG
          brokerSeats={brokerSeats}
          adminName={adminName}
          offlineNames={offlineNames}
        />
      </div>

      {/* Legenda dos personagens */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.keys(roomSummary) as RoomId[]).map(room => {
          const meta  = ROOM_META[room]
          const names = roomSummary[room]
          return (
            <div key={room} className="flex flex-col gap-1.5 p-3 rounded-xl bg-s2/50 border border-line">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${meta.dot}`}/>
                <span className="text-xs font-semibold text-slate-300">{meta.label}</span>
              </div>
              {names.length === 0 ? (
                <span className="text-[11px] text-slate-600">Vazia</span>
              ) : (
                names.map(n => (
                  <span key={n} className="text-[11px] text-slate-400 flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${room === 'break' ? 'bg-slate-600' : 'bg-green-400'}`}/>
                    {n}{room === 'break' && ' (offline)'}
                  </span>
                ))
              )}
            </div>
          )
        })}
      </div>
    </PageLayout>
  )
}
