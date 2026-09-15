/**
 * Cor de token com suporte a modificador de opacidade (`bg-s2/50`).
 *
 * Os tokens são `var(--x)` — e com cor em string var() o Tailwind 3 NÃO gera
 * `/NN`: a classe simplesmente some do CSS, sem erro. ~1000 usos no sistema
 * estavam mortos assim (card do Kanban transparente, anéis de foco invisíveis,
 * pílulas ativas sem fundo). Não dá para usar `<alpha-value>` porque os tokens
 * são hex e rgba, não canais.
 *
 * Cor como função resolve na origem: sem modificador devolve o próprio var();
 * com `/NN` devolve color-mix com transparente, que funciona com hex e com
 * rgba (a opacidade do token é multiplicada, não substituída).
 */
const cor = (token) => ({ opacityValue }) => {
  const v = `var(${token})`
  // Sem modificador o Tailwind passa `var(--tw-bg-opacity, 1)` (ou undefined
  // em fill/stroke). O projeto não usa `bg-opacity-*`, então é cor cheia.
  if (opacityValue === undefined || String(opacityValue).startsWith('var(--tw-')) return v
  const n = Number(opacityValue)
  if (Number.isFinite(n)) return n >= 1 ? v : `color-mix(in srgb, ${v} ${+(n * 100).toFixed(2)}%, transparent)`
  return `color-mix(in srgb, ${v} calc(${opacityValue} * 100%), transparent)`
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Brand (Salesforce blue) ──────────────────────────────────
        brand:          cor('--brand'),
        'brand-dark':   cor('--brand-dark'),
        'brand-tint':   cor('--brand-tint'),
        'brand-text':   cor('--brand-text'),
        // Preenchimento de marca — o mesmo ouro nos dois temas (ver index.css)
        'brand-fill':       cor('--brand-fill'),
        'brand-fill-hover': cor('--brand-fill-hover'),
        'brand-fill-deep':  cor('--brand-fill-deep'),
        'brand-fill-text':  cor('--brand-fill-text'),

        // ── Surfaces ─────────────────────────────────────────────────
        page:    cor('--page-bg'),
        surface: cor('--surface'),
        's2':    cor('--surface-2'),
        's3':    cor('--surface-3'),

        // ── Navigation ───────────────────────────────────────────────
        'nav-surface':     cor('--nav-bg'),
        'nav-text':        cor('--nav-text'),
        'nav-muted':       cor('--nav-muted'),
        'nav-active-text': cor('--nav-active-text'),
        'nav-active-bg':   cor('--nav-active-bg'),
        'nav-hover':       cor('--nav-hover-bg'),
        'nav-line':        cor('--nav-line'),

        // ── Semantic text ────────────────────────────────────────────
        t1: cor('--t1'),
        t2: cor('--t2'),
        t3: cor('--t3'),
        t4: cor('--t4'),
        t5: cor('--t5'),

        // ── Lines / borders ──────────────────────────────────────────
        line:         cor('--line'),
        'line-strong':cor('--line-strong'),
        'line-input': cor('--line-input'),

        // ── Status ───────────────────────────────────────────────────
        success:         cor('--success'),
        'success-bg':    cor('--success-bg'),
        'success-line':  cor('--success-line'),
        warning:         cor('--warning'),
        'warning-bg':    cor('--warning-bg'),
        'warning-line':  cor('--warning-line'),
        error:           cor('--error'),
        'error-bg':      cor('--error-bg'),
        'error-line':    cor('--error-line'),
        info:            cor('--info'),
        'info-bg':       cor('--info-bg'),
        'info-line':     cor('--info-line'),
      },
      fontFamily: {
        // Ver nota de desvio do Brand Guide no topo de src/index.css.
        sans:     ['Inter', 'system-ui', 'sans-serif'],
        heading:  ['Sora', 'system-ui', 'sans-serif'],
        // `label` continua existindo como intenção semântica (rótulo/dado),
        // mas usa a mesma família do corpo — a diferença é caixa e tracking.
        label:    ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:    'var(--shadow-card)',
        modal:   'var(--shadow-modal)',
        dropdown:'var(--shadow-dropdown)',
        brand:   '0 4px 14px var(--brand-shadow)',
      },
    },
  },
  plugins: [],
}
