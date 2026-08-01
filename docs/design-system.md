# Souza OS — Design System

Mapa dos tokens e componentes do iCRM. Serve para decidir **onde mexer** quando
algo precisa mudar em mais de uma tela.

Regra que vale para tudo: **se um estilo aparece em duas telas, ele vira token
ou componente.** Estilo local repetido é o que produz a inconsistência que
estamos corrigindo.

---

## 1. Tokens

Todos em `src/index.css`. `:root` = tema escuro, `html.light` = tema claro
(**principal**). Nunca escrever hex direto num componente.

### Superfícies e marca

| Token | Papel |
|---|---|
| `--page-bg` | fundo da página |
| `--surface` / `--surface-2` / `--surface-3` | planos elevados, em ordem |
| `--nav-bg`, `--nav-text`, `--nav-muted`, `--nav-active-*`, `--nav-logo` | navegação |
| `--brand`, `--brand-dark`, `--brand-tint`, `--brand-text` | Areia |
| `--brand-btn-text` | texto **sobre** fundo dourado (branco no claro, Marinho no escuro) |

> `--brand` é a Areia de fundo; `--brand-text` é a Areia **legível como texto**.
> Trocar um pelo outro é a causa mais comum de dourado ilegível.

### Texto

`--t1` título · `--t2` corpo · `--t3` secundário · `--t4` piso AA para texto
pequeno · `--t5` **só decorativo** (separadores, ícone inativo) — nunca
informação.

### Status

`--success` avanço/venda · `--warning` atenção/prazo · `--error` risco/atraso ·
`--info` informação neutra (azul-petróleo). Cada um tem `-bg` e `-line`.

**Cor nunca é o único indicador.** Sempre acompanhada de texto, ícone ou forma.

### Etapas do funil

`--stage-{lead,followup,atendimento,visita,proposta,venda}` + `-bg` + `-line`.

Progressão semântica: neutro (topo) → **Areia suave** (visita) → **Areia viva**
(proposta) → **verde** (venda). Consumidos por `lib/stageTheme.ts`, que é a
**fonte única** — nunca redefinir cor de etapa dentro de uma tela.

### Textura e profundidade

| Classe | Uso |
|---|---|
| `--grain` / `.texture-grain` | grão SVG incolor; pode ir em qualquer superfície |
| `--surface-sheen` | gradiente diagonal; valor por tema (luz no escuro, sombra fria no claro) |
| `.surface-premium` | grão + gradiente forte, para blocos executivos |
| `.gold-edge` / `.gold-edge-short` | filete dourado no topo — **uso restrito** |
| `.gold-glow-tl` | luz dourada no canto — **uso restrito** |

**Regra do dourado:** marca dinheiro, meta e marca. Hero de VGV, cards de
receita, painel do login. Card de operação e de alerta **não** recebem — se
todos tiverem, nenhum destaca.

`.gold-glow-tl` exige `isolation:isolate` + `z-index:-1` juntos; sem isso o
brilho pinta por cima do texto.

---

## 2. Componentes

### Base — `src/components/ui/`

| Componente | Observação |
|---|---|
| `Button` | `primary` usa `--brand-btn-text`; nunca hex fixo sobre dourado |
| `Input` · `Select` · `Textarea` · `Toggle` | label sempre visível; placeholder não é rótulo |
| `Card` | superfície padrão; `accent` só colore o chip do ícone |
| `ListContainer` | container de lista/tabela |
| `Modal` | focus trap + devolução de foco. **Modal novo deve usar este**, não overlay artesanal |
| `Badge` | `purple`/`indigo`/`orange` são apelidos semânticos legados |
| `Avatar` · `ScoreBadge` · `EmptyState` | — |

### Compartilhados — `src/components/shared/`

`StatCard` · `StatusBadge` · `ChecklistBadge` · `FilterDropdown` ·
`PeriodSelector` · `GlobalSearch` (⌘K) · `TasksLinkedModal`

### Layout — `src/components/layout/`

`Sidebar` (recolhível, persistido) · `BottomNav` (mobile) · `PageLayout`
(título + CTA + grão) · `NotificationsPopover`

### Domínio — leads

| Componente | Papel |
|---|---|
| `LeadKanban` | quadro + card de 4 níveis + colunas |
| `LeadModal` | **painel lateral** (não é modal); URL `?lead=<id>`, Esc fecha |
| `nextAction.ts` | próxima ação do lead — SLA → tarefa → silêncio → sem ação |
| `stageTheme.ts` | fonte única de cor/label de etapa |
| `SlaBadge` | relógio do SLA Meta Ads |
| `LeadTimeline` | histórico de interações |

---

## 3. Estado persistido

| Store | Chave | Observação |
|---|---|---|
| `useThemeStore` | `icrm-theme` | `version:1` migra quem tinha `dark` gravado |
| `useSidebarStore` | `icrm-sidebar` | recolhida ou não |
| `useKanbanPrefs` | `icrm-kanban-prefs` | densidade, ordenação, modo financeiro |

Ao mudar um default persistido, **subir a `version` e escrever o `migrate`** —
senão a mudança não alcança quem já usa o sistema.

---

## 4. Exceções deliberadas

Não tokenizar:

- **`modules/office/VirtualOfficePage`** — pixel art; as cores *são* o desenho.
- **`modules/simulador/**`** — cards exportados em PNG. O material do cliente
  não pode mudar de cor conforme o tema do corretor.

---

## 5. Armadilhas conhecidas

1. **Cor fixa em gráfico.** Recharts aceita `var(--*)` em `stroke`, `fill`,
   `contentStyle` e `tick`. Hex fixo produz tooltip preto sobre papel no tema
   claro — foi o bug mais recorrente do sistema.
2. **`indigo-200`, `-100`, `-700+`** não entram no remapeamento indigo→marca do
   `index.css` (que cobre 300–600). Ficam lavanda cru e somem no claro.
3. **`fill="white"` em SVG** — invisível sobre card claro. Usar `var(--t1)`.
4. **`bg-gradient-to-r` com classe `bg-*`** em vez de `from-*`/`to-*` gera
   gradiente sem color-stop: fundo invisível.
5. **Tema claro é onde os bugs moram.** O sistema nasceu escuro; toda tela
   pouco visitada tende a ter contraste quebrado no claro.

---

## 6. Acessibilidade — mínimo aceito

WCAG 2.2 AA. Foco visível, navegação por teclado, `aria-label` em botão só de
ícone, `aria-live` em erro, alvo de toque adequado, `prefers-reduced-motion`
respeitado (já global no `index.css`), e nunca cor sozinha comunicando status.
