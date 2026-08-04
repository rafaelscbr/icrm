# Auditoria de front-end, UX e UI — Souza OS / iCRM

Levantamento feito em 04/08/2026 sobre `main`, com o sistema rodando e as telas
inspecionadas no navegador (Chrome, tema claro e escuro, base real de 12.578
contatos / 847 leads / 20 listas).

Este documento é diagnóstico. **Nenhuma tela foi alterada para produzi-lo.**

---

## PARTE 1 — Fundação front-end

### 1.1 Inventário de dependências de UI

| Biblioteca | Versão | Papel | Onde é usada | Estável | Problemas | Recomendação |
|---|---|---|---|---|---|---|
| `react` / `react-dom` | 19.0 | runtime | tudo | sim | — | manter |
| `react-router-dom` | 7.1 | rotas | `App.tsx`, 21 rotas | sim | sem `errorElement`; sem rota 404 | corrigir |
| `zustand` | 5.0 | estado | 24 stores | sim | erro engolido no `catch` (ver P0-1) | corrigir uso |
| `@supabase/supabase-js` | 2.104 | dados/realtime | `lib/db`, stores | sim | 197 kB no bundle inicial | aceitar |
| `tailwindcss` | 3.4 | estilo | tudo | sim | v4 disponível; migração sem ganho claro agora | manter |
| `lucide-react` | 0.469 | ícones | ~todas as telas | sim | — | manter |
| `recharts` | 2.15 | gráficos | 7 telas | sim | **404 kB**, chunk próprio | ver P2-3 |
| `@dnd-kit/*` | 6.3 / 10.0 | arrastar | 2 kanbans | sim | 50 kB, chunk próprio; teclado OK | manter |
| `react-hot-toast` | 2.4 | notificação | ~todas | sim | sem `aria-live` configurado | ajuste pequeno |
| `xlsx` | 0.18 | import/export | 3 arquivos | **não** | **424 kB** — o maior do bundle; versão do npm sem correções de segurança recentes | ver P1-3 |
| `canvas-confetti` | 1.9 | celebração | metas, vendas | sim | — | manter |
| `html-to-image` | 1.11 | export PNG | simulador | sim | — | manter |

**Não instalados:** shadcn/ui, Radix, Base UI, React Aria, Ark UI, Mantine,
Motion/Framer, react-hook-form, TanStack Table. Não existe `components.json`.

**Conclusão do inventário:** a camada de componentes é **100% artesanal** —
14 componentes em `components/ui` (863 linhas no total) mais 8 em
`components/shared`. Não há biblioteca de UI a manter ou migrar; há uma
biblioteca interna a **qualificar**.

### 1.2 Estado de acessibilidade da camada artesanal

Medido por arquivo (`role`, `aria-*`, focus trap, `Escape`, navegação por seta):

| Componente | Semântica | Foco | Teclado | Veredito |
|---|---|---|---|---|
| `Modal` | `role=dialog`, `aria-modal` | trap + retorno | Escape | **bom** |
| `SidePanel` | `role=dialog`, `aria-modal` | trap + retorno | Escape | **bom** |
| `Select` | `<select>` nativo | nativo | nativo | **bom** (e melhor no mobile) |
| `Input` / `Textarea` | `aria-invalid`, `role=alert` | nativo | nativo | bom |
| `MoneyInput` | idem | nativo | nativo | bom |
| `FilterDropdown` | `role` + `aria` + Escape + clique fora | ok | **sem setas** | parcial |
| `GlobalSearch` | **sem `role`** (não é combobox) | ok | setas + Escape | parcial |
| `PeriodSelector` | **sem `role`, sem `aria`, sem Escape** | clique fora | **nenhum** | **fraco** |
| `Button`/`Badge`/`Card`/`Avatar` | não precisam | `focus-visible` | — | ok |

O grosso do risco está em **três overlays**, não na biblioteca inteira.

### 1.3 Decisão: manter, modernizar ou substituir

| Critério | Atual (artesanal) | Radix/shadcn | Base UI | React Aria | Mantine |
|---|---|---|---|---|---|
| Acessibilidade | boa em diálogo, fraca em 3 overlays | excelente | excelente | excelente | boa |
| Controle visual | **total** | alto | alto | alto | **baixo** |
| Compatibilidade com o Pulse | **nativa** | alta | alta | alta | conflita |
| Bundle | ~0 kB extra | +30–60 kB | +25–50 kB | +60–90 kB | +150 kB+ |
| Manutenção | nossa | comunidade | comunidade | Adobe | Mantine |
| Componentes prontos | 22 | muitos | muitos | muitos | muitíssimos |
| Qualidade mobile | boa (select nativo) | boa | boa | boa | boa |
| Custo de migração | — | **alto** (22 componentes + 40 telas) | alto | alto | **muito alto** |
| Risco de regressão | — | alto | alto | alto | muito alto |

**Decisão: Estratégia B — modernização seletiva, sem trocar a fundação.**

Justificativa, contra os critérios que você definiu para a Estratégia C:

- *A fundação impede o Design System?* **Não** — ela é o Design System. A
  identidade (grão, degradê 158°, ouro racionado, Sora/Space Grotesk) existe
  porque os componentes são nossos.
- *Problemas recorrentes de acessibilidade?* **Localizados**, em três overlays,
  não sistêmicos. Diálogo e formulário já estão corretos.
- *Componentes abandonados?* Não.
- *Implementações artesanais frágeis?* Sim, três. É reparo, não troca de base.
- *Ganho mensurável da nova base?* Não demonstrável: trocaria acessibilidade
  boa-com-3-buracos por acessibilidade excelente, ao custo de +30–90 kB, de
  reescrever 22 componentes e revisar 40 telas — com risco de regressão numa
  operação que está vendendo.

**O que fazer em vez disso:** adotar **Radix como primitiva pontual** apenas
onde o comportamento é caro de acertar à mão — `Popover`, `DropdownMenu`,
`Tooltip` e `Tabs`. São ~15 kB, entram sem tocar na aparência (Radix é
headless) e resolvem `PeriodSelector`, `FilterDropdown`, `GlobalSearch` e as
abas de página de uma vez. O restante permanece artesanal.

**Motion:** não está instalado. Recomendo instalar (`motion`, ~18 kB com
`LazyMotion`) — a gramática do Pulse pede continuidade de layout que CSS puro
não entrega bem (reordenação de card, entrada de painel, mudança de etapa).
Decisão sua; não instalei nada.

---

## PARTE 2 — A gramática do Pulse

O que extraí como regra transferível (o detalhe está em `principios-visuais.md`):

- **Profundidade vem de três camadas incolores + uma colorida.** Grão e degradê
  não competem com dado; o ouro compete, por isso é raro.
- **O olhar é dirigido por tamanho, não por cor.** O número que decide a ação é
  3× o rótulo.
- **Dado vira acontecimento.** "Rafael falou no WhatsApp com Fulano · Garden
  Park", não "interações: 21". Sujeito, verbo, objeto.
- **O ponto focal é único por tela** e carrega o julgamento (VGL, meta do dia,
  score do período).
- **Agrupar sem mentir.** 200 disparos viram uma linha; a ligação que gerou
  interesse nunca é agrupada.
- **Movimento é ambiente.** Ciclos não múltiplos (48s/67s) para o loop não ser
  percebido; só `transform`; `prefers-reduced-motion` congela.
- **Nunca afirmar além do observado.** O que é autodeclarado vem com quanto
  ficou sem registro.

**O que é só do Pulse e não deve ser copiado:** densidade de quiosque (fonte
grande para 70 cm de distância), carrossel automático, proteção anti-burn-in,
e o orçamento de uma leitura por sessão.

---

## PARTE 3 — Mapa de rotas

21 rotas. 16 telas usam `PageLayout`; 5 têm layout próprio (`/login`,
`/pulse`, `/leads`, `/performance`, `/escritorio`).

| Rota | Tela | Objetivo | Ação principal | Prioridade |
|---|---|---|---|---|
| `/` | Dashboard | o que exige ação hoje | resolver prioridade | — |
| `/leads` | Leads (5 abas) | trabalhar o funil | avançar etapa | P1 |
| `/tarefas` | Tarefas | não perder follow-up | concluir | P2 |
| `/metas` | Metas | estou no ritmo? | — | refeita |
| `/contatos` | Contatos | achar alguém | WhatsApp | P2 |
| `/vendas` | Vendas | quanto entrou | nova venda | P2 |
| `/base-leads` | Base de Leads | preparar prospecção | ver leads | P2 |
| `/base-leads/:id` | Detalhe da lista | conferir e importar | importar | P2 |
| `/prospeccao/disparos` | Disparos | abordar em lote | disparar | P1 |
| `/prospeccao/ligacoes` | Ligações | ligar um a um | ligar | refeita |
| `/imoveis` · `/lancamentos` | Produtos | achar produto para o lead | ver ficha | P2 |
| `/performance` | Análise | quem produz | — | P2 |
| `/simulador` | Simulador | material para o cliente | exportar | P3 |
| `/escritorio` | Escritório Virtual | presença | — | exceção |
| `/pulse` | Pulse | painel de parede | — | referência |
| `/admin` | Admin | contas e permissões | — | P2 |
| `/notificacoes` | Notificações | o que perdi | — | P3 |
| `/metas/historico` | Histórico semanal | como fechei | — | P3 |
| `/login` | Login | entrar | entrar | P2 |
| `/campanhas` | redirect | — | — | ok |
| `/*` | **cai no app sem 404** | — | — | **P1** |

---

## PARTE 4 — Achados, com evidência

### P0-1 · Falha de carregamento é indistinguível de "não há dados"

**Evidência:** `useContactsStore.load()` termina em
`catch (err) { console.error('[contacts] load:', err) }` e o `finally` faz
`set({ loading: false })`. A tela então renderiza o `EmptyState` "Nenhum contato
encontrado". O mesmo padrão está em leads, tarefas e vendas.

**Impacto:** com o banco fora do ar ou RLS negando, o corretor lê **"você não
tem contatos"** — e age com base nisso. É indução a erro grave.

**Viola:** a regra da casa `feedback_db_source_of_truth` ("proibido try/catch
silencioso"), o princípio 8 ("nunca afirmar além do observado") e a heurística
de visibilidade do estado.

**Correção:** `erro: string | null` nos stores, e `PageLayout`/telas
distinguindo três estados — carregando, falhou (com "tentar de novo") e vazio
de verdade. O Dashboard já faz isso e serve de modelo.

### P1-1 · Sem fronteira de erro e sem 404

`/*` cai em `AppRoutes`; uma URL inválida renderiza o app vazio. Nenhuma rota
tem `errorElement` — um erro de render derruba a tela inteira para branco.

### P1-2 · Três overlays sem teclado completo

`PeriodSelector` (sem `role`, sem `aria`, sem Escape), `GlobalSearch` (sem
semântica de combobox) e `FilterDropdown` (sem setas). São controles usados
todos os dias.

### P1-3 · `xlsx` — 424 kB e sem manutenção

Maior artefato do bundle. Carrega em `/prospeccao/disparos` e no import de
lista. A versão publicada no npm está defasada em correções. Opções: mover para
import dinâmico dentro da ação (não do módulo), trocar por `exceljs`, ou passar
o parse para o servidor.

### P2-1 · Toast sem `aria-live`

`react-hot-toast` sem região viva anunciada — confirmações não chegam a leitor
de tela.

### P2-2 · `lint` quebrado

Falta `eslint.config.js` desde o ESLint 9. `npm run lint` não roda; regras de
hooks e a11y não são verificadas em nenhum ponto.

### P2-3 · Recharts em 7 telas, 404 kB

Chunk separado e carregado sob demanda, então não pesa no primeiro acesso — mas
é grande para o que se desenha (linha e barra). Avaliar depois dos P0/P1.

### P3-1 · Sem `prefers-reduced-motion` fora do global

A regra global cobre a aurora; transições novas de painel e barra não foram
verificadas individualmente.

---

## PARTE 5 — Scorecard (0–5)

Notas do que foi observado rodando. "Vida" = personalidade visual; "Pulse" =
aderência à gramática.

| Tela | Clareza | Hierarquia | Ação | Estados | A11y | Vida | Pulse | Pior nota |
|---|---|---|---|---|---|---|---|---|
| Pulse | 5 | 5 | — | 5 | 4 | 5 | 5 | — |
| Dashboard | 5 | 5 | 5 | 5 | 4 | 5 | 5 | a11y |
| Ligações (5 telas) | 5 | 5 | 5 | 4 | 5 | 5 | 5 | estados |
| Metas | 5 | 5 | 4 | 3 | 4 | 5 | 5 | **estados** |
| Leads · Kanban | 5 | 5 | 5 | 3 | 4 | 5 | 4 | **estados** |
| Leads · Dashboard | 4 | 4 | 3 | 3 | 4 | 4 | 4 | ação/estados |
| Disparos | 4 | 4 | 4 | 3 | 3 | 4 | 3 | **a11y** |
| Tarefas | 4 | 4 | 4 | 2 | 4 | 4 | 4 | **estados** |
| Vendas | 4 | 4 | 4 | 2 | 4 | 4 | 4 | **estados** |
| Contatos | 4 | 4 | 4 | 2 | 4 | 3 | 3 | **estados** |
| Base de Leads | 4 | 4 | 4 | 3 | 4 | 4 | 4 | estados |
| Produtos (2) | 4 | 4 | 3 | 2 | 4 | 4 | 4 | **estados** |
| Análise | 4 | 4 | 2 | 2 | 3 | 4 | 4 | **ação** |
| Admin | 3 | 3 | 3 | 3 | 3 | 2 | 2 | **vida/Pulse** |
| Notificações | 3 | 3 | 3 | 2 | 3 | 2 | 2 | **vida/Pulse** |
| Login | 4 | 4 | 5 | 3 | 4 | 4 | 4 | estados |
| Simulador | 4 | 4 | 4 | 3 | 3 | 4 | — | exceção |
| Escritório Virtual | 4 | 4 | — | 2 | 3 | 5 | — | exceção |

**O padrão que salta:** a coluna de **estados** é a mais fraca do sistema
inteiro. Não é falta de beleza — é falta de honestidade sobre o que está
acontecendo. Bate exatamente com o P0-1.

---

## PARTE 6 — Plano proposto

Na ordem que você definiu, um bloco coerente por vez, cada um com verificação:

1. **P0-1 — estados de verdade.** `erro` nos stores + tríade
   carregando/falhou/vazio nas 16 telas. É o maior ganho de confiança do
   sistema e não muda nenhuma composição.
2. **P1-1 — `errorElement` e 404.**
3. **P1-2 — Radix pontual** (`Popover`, `DropdownMenu`, `Tooltip`, `Tabs`) nos
   três overlays. Headless: a aparência não muda.
4. **P2-2 — `eslint.config.js`** com `jsx-a11y`, para a régua parar de depender
   de inspeção manual.
5. **P1-3 — `xlsx`** para import dinâmico.
6. **Admin e Notificações** — as duas telas fora do padrão.
7. **Motion**, se aprovado, e só então o acabamento de movimento.

O que **não** recomendo fazer: trocar a fundação de componentes. O sistema não
tem um problema de biblioteca; tem um problema de estados e três overlays.
