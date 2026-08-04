import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'

/**
 * O lint estava parado desde a subida para o ESLint 9: o projeto tinha as
 * dependências no package.json mas nenhum arquivo de configuração no formato
 * flat, então `npm run lint` não checava nada. Na prática, toda a régua de
 * acessibilidade dependia de alguém olhar o código na mão.
 *
 * As regras de `jsx-a11y` entram como **erro** onde já estamos limpos, e como
 * **aviso** onde há dívida conhecida — assim o lint pode entrar em CI hoje sem
 * transformar a dívida existente em bloqueio, e sem esconder que ela existe.
 */
export default tseslint.config(
  {
    ignores: [
      'dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results',
      // worktrees de agente: cópias inteiras do repo, não são o projeto
      '.claude/**',
    ],
  },

  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // `any` aparece em fronteira de dados (payload de realtime, linha crua do
      // PostgREST). Avisa, não trava.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // ── Acessibilidade: o que NÃO pode voltar ──────────────────────────────
      // Estes são exatamente os defeitos que a auditoria encontrou e que já
      // foram corrigidos. Ficam como erro para não reaparecerem.
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/aria-props':               'error',
      'jsx-a11y/aria-role':                'error',
      'jsx-a11y/aria-unsupported-elements':'error',
      'jsx-a11y/no-redundant-roles':       'error',

      // ── Dívida conhecida: avisa, não trava ─────────────────────────────────
      // Linhas de lista e cartões de kanban que abrem detalhe no clique. O
      // caminho por teclado existe em outro lugar da tela; a correção é real
      // mas é composição, não uma linha de código.
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',

      // Quase todo `autoFocus` do sistema é o primeiro campo de um formulário
      // dentro de Modal ou SidePanel — que é o que o padrão de diálogo do
      // WAI-ARIA manda fazer: ao abrir, o foco entra no diálogo. A regra não
      // distingue esse caso do autofocus em página inteira, que aí sim
      // atrapalha. Fica como aviso para continuar visível sem travar.
      'jsx-a11y/no-autofocus': 'warn',
    },
  },

  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'e2e/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    files: ['*.config.{js,ts}', 'scripts/**'],
    languageOptions: { globals: globals.node },
  },
)
