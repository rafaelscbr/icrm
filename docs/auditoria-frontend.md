# Auditoria de front-end, UX e UI — Souza OS / iCRM

Levantamento feito em 04/08/2026 sobre `main`, com o sistema rodando e as telas
abertas no navegador (Chrome, tema claro e escuro, base real de 12.578 contatos
/ 847 leads / 20 listas), incluindo viewport de 390 × 844 e simulação de falha
de rede.

**Telas abertas:** Pulse, Dashboard, Leads (lista, kanban, dashboard), Metas,
Tarefas, Contatos, Vendas, Base de Leads, Lançamentos, Análise, Disparos,
Admin, Notificações e as cinco de Ligações.
**Telas NÃO abertas:** Login, Simulador, Escritório Virtual, Histórico semanal,
Detalhe de lista, Produtos · Prontos. Elas não recebem nota.

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

**Evidência de tela (04/08, navegador).** Interceptei `fetch` para rejeitar
apenas `/rest/v1/contacts` e entrei em Contatos por navegação interna, com a
store ainda vazia. Quatro requisições falharam (`window.__falhas === 4`) e a
tela renderizou:

- cabeçalho: **"Contatos · 0 contatos cadastrados"**
- corpo: **"Nenhum contato encontrado — Adicione seu primeiro contato para
  começar a gerenciar sua rede"**
- ação: **"Novo Contato"**

A base real tem **12.578 contatos**.

**Correção ao diagnóstico anterior (feito só por código):** o erro **não** é
totalmente silencioso. `db.ts` dispara `toast.error('Erro ao carregar contacts:
…')` antes de lançar (linha 723). O que acontece é pior de descrever e igual de
grave: **o aviso dura alguns segundos e some; a afirmação falsa fica na tela
para sempre.** O `catch` do store (`console.error`) é o que impede a tela de
saber que falhou.

**Impacto:** com o banco fora do ar ou RLS negando, o corretor lê "você não tem
contatos", o toast já sumiu, e ele age com base nisso. É indução a erro grave.

**Viola:** a regra da casa `feedback_db_source_of_truth` ("proibido try/catch
silencioso"), o princípio 8 ("nunca afirmar além do observado") e a heurística
de visibilidade do estado.

**Correção:** `erro: string | null` nos stores, e `PageLayout`/telas
distinguindo três estados — carregando, falhou (com "tentar de novo") e vazio
de verdade. O Dashboard já faz isso e serve de modelo.

**Status: corrigido (04/08).** `src/components/shared/EstadoTela.tsx` torna a
tríade obrigatória por construção — `erro` é prop obrigatória e a precedência
é **erro > carregando > vazio**, travada por seis testes em
`src/test/estado-tela.test.tsx`. `erro: string | null` foi para as 11 stores de
leitura; 11 telas passaram a consumi-lo, e os subtítulos que contavam registros
("12.578 contatos cadastrados") passam a dizer "não foi possível ler a base"
quando a leitura falhou. `EmptyState` foi **removido** do repositório: enquanto
existisse, seria possível reintroduzir um vazio sem checagem de erro sem
ninguém perceber.

Dois defeitos adicionais apareceram durante a correção e foram corrigidos junto:

- `useLeadListsStore.load` não tinha `try/catch` nenhum — a promise rejeitava
  sem tratamento e `loading` ficava `true` para sempre. Base de Leads girava
  indefinidamente sem dizer o que houve.
- O popover de notificações afirmava **"Tudo em dia · Nenhuma notificação por
  enquanto"** sobre uma leitura que podia ter falhado.

**Evidência da correção (04/08, navegador).** Mesmo método: `fetch` rejeitando
só `/rest/v1/lead_lists`, navegação interna para Base de Leads. A tela mostrou
"Carregando…" e em seguida:

- cabeçalho: **"Base de Leads · não foi possível ler as listas"**
- corpo: **"Não foi possível carregar / Falha de comunicação com o banco. / O
  que aparece nesta tela pode estar incompleto. Não tome decisão com base nela
  até recarregar."**
- ação: **"Tentar de novo"**

Com a rede restaurada a mesma tela voltou a "Nenhuma lista criada" — que aqui é
verdade e não engano: a conta usada (`e2e_test_dispatch`, perfil `broker`) é
dona de 0 das 20 listas do banco, e a RLS restringe às próprias. Vazio de
verdade e falha de leitura agora são visualmente inconfundíveis.

### P1-1 · Sem fronteira de erro e sem 404

`/*` cai em `AppRoutes`; uma URL inválida renderiza o app vazio. Nenhuma rota
tem `errorElement` — um erro de render derruba a tela inteira para branco.

**Status: corrigido (04/08).** Duas peças novas em `components/shared`:

- **`NaoEncontrada`** — `<Route path="*">` dentro de `AppRoutes`. Também é o que
  um corretor passa a ver ao abrir `/admin`, rota que só existe para admin.
- **`ErroDeTela`** — fronteira de erro de render envolvendo `<Routes>`.

Correção ao diagnóstico: **`errorElement` não se aplica aqui.** O router é o
declarativo (`BrowserRouter` + `Routes`), não o data router — `errorElement` só
existe em `createBrowserRouter`. O equivalente correto no modo declarativo é um
componente de classe com `componentDidCatch`, que é de todo modo o único
mecanismo de React capaz de capturar erro de render. Migrar para o data router
só por isso seria trocar a fundação de roteamento para ganhar a mesma coisa.

O boundary recebe `resetKey={location.pathname}`: sem isso um erro em uma tela
travaria todas as outras até o reload.

**Evidência (04/08, navegador).** `/rota-que-nao-existe` → "Esta página não
existe · Nada responde por /rota-que-nao-existe", com a sidebar intacta. Uma
rota temporária que lança no render → "Esta tela parou de responder · estouro
proposital de render", também com a sidebar intacta e com "Recarregar" e "Ir
para o início"; clicar em Tarefas na sidebar recuperou a navegação sem reload.
A rota temporária foi removida em seguida.

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

## PARTE 4-B — Inspeção de design (o que um designer vê)

Esta parte faltava na primeira versão. Feita olhando as telas renderizadas, não
o código.

### D-1 · Tudo é uma caixa com borda — e caixas dentro de caixas

**Onde mais dói: Disparos.** A tela empilha três níveis de borda:

    card da campanha (borda)
      └ 5 mini-caixas de métrica (borda cada)
          └ chip de status (borda)

Cinco retângulos de 60 px lado a lado, cada um com borda, ícone minúsculo e
número — parece planilha, não produto. A borda virou a única ferramenta de
separação do sistema: onde falta hierarquia, aparece uma borda.

**Regra que proponho:** borda separa o que é do MESMO nível. Para nível
diferente, usar superfície, espaço ou peso tipográfico. Métrica dentro de card
não precisa de caixa — precisa de rótulo pequeno e número grande.

### D-2 · O degradê de superfície esticado de ponta a ponta cansa

**Onde: todas as listas** (Contatos, Tarefas, Base de Leads, Admin).

O `--surface-sheen` é um degradê a 158° pensado para um **card** de 300–400 px.
Aplicado num container de 1.200 px, ele deixa de ser volume e vira **lavagem**:
o canto superior esquerdo fica claro e o inferior direito escuro ao longo da
tabela inteira. O resultado é que a linha 1 parece mais importante que a linha
20 sem nenhuma razão de dado, e a leitura de uma lista longa fica cansativa.

**Correção:** superfície de lista não deve usar o mesmo degradê do card. Ou o
degradê é limitado (por exemplo, só nos primeiros 200 px e depois plano), ou a
lista usa superfície plana e a separação vem da linha e do hover. O Pulse não
tem esse problema porque os painéis dele são estreitos.

### D-3 · Espaço morto abaixo da dobra

**Onde: Admin (3 linhas e ~500 px vazios), Notificações (tela inteira vazia),
Vendas sem vendas no período.**

Nenhuma dessas telas usa o espaço para dizer o que fazer em seguida. Um estado
vazio de produto bom ocupa o vazio com direção; aqui ele só sobra.

### D-4 · A ação mora a 1.000 px do nome

**Onde: Admin e Contatos (desktop largo).**

Nome à esquerda, ações no extremo direito. Em 1.512 px o olho e o mouse
atravessam a tela inteira para cada linha. Em lista longa isso é fadiga real.

**Correção:** ancorar as ações a uma coluna de largura fixa próxima ao
conteúdo, ou revelar no hover junto da linha.

### D-5 · Faixas quase vazias ocupando largura total

**Onde: Disparos, "Disparos hoje 0/50"** — uma faixa de 1.200 × 56 px com dois
textos pequenos nas pontas. É um dado de uma linha ocupando o espaço de um
painel.

### D-6 · Mobile: alvos de toque abaixo do mínimo e FAB sobrepondo ação

Medido em 390 × 844:

- **Contatos** — as quatro ações da linha ficam com ~28 px cada. O mínimo
  aceitável é 44 px. E o **FAB dourado cobre o botão de excluir da última
  linha visível**.
- **Disparos** — as cinco mini-caixas de métrica caem para ~55 px de largura;
  os rótulos "Agendados" e "Transf." ficam espremidos.

Estrutura responsiva funciona (bottom nav, cards empilham, FAB). O problema é
densidade e sobreposição, não layout.

### D-7 · Telas fora da linguagem

**Notificações** e **Admin** não receberam nada do vocabulário: sem ícone de
tom, sem número grande, sem seção com filete, superfície chapada. Ao lado de
Metas ou Ligações, parecem de outro produto.

### D-8 · Onde o sistema já está certo

Para não parecer crítica em bloco: **Pulse**, **Dashboard**, **Ligações**,
**Metas**, **Lançamentos** e o **kanban de Leads** têm ponto focal, hierarquia
por tamanho, cor com significado e profundidade. O padrão existe — o problema
é que ele cobre pouco mais da metade do sistema.

### Prioridade de design

| # | Achado | Alcance | Severidade |
|---|---|---|---|
| D-2 | degradê esticado nas listas | 6 telas | **P1** |
| D-6 | toque < 44 px e FAB sobrepondo | mobile inteiro | **P1** |
| D-1 | caixa dentro de caixa | Disparos, Base, Produtos | P2 |
| D-4 | ação longe do conteúdo | Admin, Contatos | P2 |
| D-7 | telas fora da linguagem | Admin, Notificações | P2 |
| D-3 | espaço morto | 3 telas | P3 |
| D-5 | faixa quase vazia | Disparos | P3 |

---

## PARTE 5 — Scorecard (0–5)

Notas **apenas do que foi aberto no navegador**, com data. Telas não abertas
ficam sem nota — a primeira versão deste documento atribuiu notas a cinco telas
que eu não tinha visto, o que contraria a regra "não atribua notas sem
evidências". Corrigido.

"Vida" = personalidade visual; "Pulse" = aderência à gramática.

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
| Produtos · Lançamentos | 4 | 4 | 3 | 2 | 4 | 4 | 4 | **estados** |
| Análise | 4 | 4 | 2 | 2 | 3 | 4 | 4 | **ação** |
| Disparos (aberta 04/08) | 4 | 3 | 4 | 3 | 3 | 3 | 3 | **hierarquia** |
| Admin (aberta 04/08) | 3 | 2 | 3 | 3 | 3 | 1 | 1 | **vida/Pulse** |
| Notificações (aberta 04/08) | 3 | 2 | 2 | 3 | 3 | 1 | 1 | **vida/Pulse** |
| Login | — | — | — | — | — | — | — | **não observada** |
| Simulador | — | — | — | — | — | — | — | **não observada** |
| Escritório Virtual | — | — | — | — | — | — | — | **não observada** |
| Histórico semanal | — | — | — | — | — | — | — | **não observada** |
| Detalhe de lista | — | — | — | — | — | — | — | **não observada** |
| Produtos · Prontos | — | — | — | — | — | — | — | **não observada** |

**O padrão que salta:** a coluna de **estados** é a mais fraca do sistema
inteiro. Não é falta de beleza — é falta de honestidade sobre o que está
acontecendo. Bate exatamente com o P0-1.

---

## PARTE 6 — Plano proposto

Na ordem que você definiu, um bloco coerente por vez, cada um com verificação:

1. ~~**P0-1 — estados de verdade.**~~ **Feito em 04/08** — `EstadoTela` +
   `erro` em 11 stores + 11 telas, `EmptyState` removido, 6 testes de
   precedência, verificado no navegador. Detalhe na PARTE 4.
2. ~~**P1-1 — `errorElement` e 404.**~~ **Feito em 04/08.** Ver PARTE 4.
3. **P1-2 — Radix pontual** ← próximo (`Popover`, `DropdownMenu`, `Tooltip`, `Tabs`) nos
   três overlays. Headless: a aparência não muda.
4. **P2-2 — `eslint.config.js`** com `jsx-a11y`, para a régua parar de depender
   de inspeção manual.
5. **P1-3 — `xlsx`** para import dinâmico.
6. **Admin e Notificações** — as duas telas fora do padrão.
7. **Motion**, se aprovado, e só então o acabamento de movimento.

O que **não** recomendo fazer: trocar a fundação de componentes. O sistema não
tem um problema de biblioteca; tem um problema de estados e três overlays.
