/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Brand (Salesforce blue) ──────────────────────────────────
        brand:          'var(--brand)',
        'brand-dark':   'var(--brand-dark)',
        'brand-tint':   'var(--brand-tint)',
        'brand-text':   'var(--brand-text)',

        // ── Surfaces ─────────────────────────────────────────────────
        page:    'var(--page-bg)',
        surface: 'var(--surface)',
        's2':    'var(--surface-2)',
        's3':    'var(--surface-3)',

        // ── Navigation ───────────────────────────────────────────────
        'nav-surface':     'var(--nav-bg)',
        'nav-text':        'var(--nav-text)',
        'nav-muted':       'var(--nav-muted)',
        'nav-active-text': 'var(--nav-active-text)',
        'nav-active-bg':   'var(--nav-active-bg)',
        'nav-hover':       'var(--nav-hover-bg)',
        'nav-line':        'var(--nav-line)',

        // ── Semantic text ────────────────────────────────────────────
        t1: 'var(--t1)',
        t2: 'var(--t2)',
        t3: 'var(--t3)',
        t4: 'var(--t4)',

        // ── Lines / borders ──────────────────────────────────────────
        line:         'var(--line)',
        'line-strong':'var(--line-strong)',
        'line-input': 'var(--line-input)',

        // ── Status ───────────────────────────────────────────────────
        success:         'var(--success)',
        'success-bg':    'var(--success-bg)',
        'success-line':  'var(--success-line)',
        warning:         'var(--warning)',
        'warning-bg':    'var(--warning-bg)',
        'warning-line':  'var(--warning-line)',
        error:           'var(--error)',
        'error-bg':      'var(--error-bg)',
        'error-line':    'var(--error-line)',
        info:            'var(--info)',
        'info-bg':       'var(--info-bg)',
        'info-line':     'var(--info-line)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
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
