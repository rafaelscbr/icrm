# Redesenho Souza OS v4 — andamento

Pedido de 31/10/2026: redesenhar o sistema inteiro (claro e escuro), com
melhores práticas de UX/UI e performance. Este arquivo é o placar.

Pesos: fundação 35% · 18 telas ~3,5% cada (63%) · verificação final 2%.

**Progresso: 100%**

## v10 — topo em uma linha (01/11/2026)

- [x] Topo de toda tela numa linha só (título + abas + ação, 56px). Antes: seção, título grande, subtítulo e faixa de abas (~200px)
- [x] Leads: busca, atalhos, filtros, ordem, ganhos e descartados numa linha; atalho com zero leads some
- [x] Kanban: a régua de 240px virou uma linha (total + barra fina + controles); cabeçalho de coluna em uma linha (esfriando vira um número com floco); próxima ação sem caixa; trilhos sem borda tracejada
- [x] Painel: meta e previsão lado a lado na mesma altura; oito cartões de indicador viraram duas faixas de números clicáveis (`FaixaNumeros`); herói sem as barras semanais
- [x] Vendas: faixa de números no lugar de três cartões, gráfico mais baixo sem título duplo, busca e tipo (`Segmentado`) numa linha
- [x] Imóveis: faixa de números no lugar de quatro cartões, "Por região" recolhido, busca + situação + com tarefas numa linha
- [x] Resultado: o primeiro card do Kanban subiu de ~880px para ~370px do topo da janela

## v9 — "folha limpa": formulários e menos elementos (01/11/2026)

- [x] Causa de "o formulário não mudou": uma regra antiga do tema claro forçava todo campo a fundo branco + borda com !important — removida
- [x] Campos sem borda (fundo preenchido que acende no foco), pílulas de escolha sem contorno, rótulos em texto normal, divisórias soltas somem
- [x] Painel e modal: cabeçalho vira um sobretítulo pequeno, sem filetes; rodapé liso
- [x] Novo contato reescrito: nome grande no topo, telefone, e o resto atrás de "Mais detalhes" (de 11 controles para 3 à vista)
- [x] Nova tarefa: título sem caixa, como cabeçalho do formulário
- [x] Novo lead reescrito: uma página só (eram dois passos), busca do contato como título, origem e etapa em pílulas, imóvel e ticket, data de entrada e observação recolhidas
- [x] Nova venda reescrita: valor como título com a comissão calculada embaixo, comissão e divisão em pílulas, observação recolhida; abre por `/vendas?nova=1` e entrou no "Criar" da barra
- [x] Menos elementos nas telas: rótulos sem MAIÚSCULAS espaçadas no sistema inteiro, indicadores sem caixinha de ícone, títulos de seção sem filete e ícone

## v8 — limpeza, cor, formulários e Kanban (01/11/2026)

- [x] Tema escuro (e claro) com fundo liso: topo de página sem degradê, sem aurora, sem grão, sem brilhos dourados decorativos
- [x] Mais cor com significado: cada área tem a sua (Operação azul, Comercial violeta, Produtos turquesa, Prospecção laranja, Inteligência ouro) no selo do topo, no indicador das abas e no hover das linhas de tabela
- [x] Etapas do funil coloridas (índigo, violeta, celeste, turquesa, ouro, verde)
- [x] Formulários: um só visual de campo no sistema inteiro (inclusive campos escritos à mão dentro de diálogos), foco azul com anel suave, rótulos em texto normal em vez de MAIÚSCULAS espaçadas, rodapé de painel liso
- [x] Tabelas: sem sombra, cabeçalho sem faixa e em texto normal, hover na cor da área
- [x] Kanban: régua do funil (barra proporcional + atalho para cada coluna), colunas sem fundo pintado com filete da etapa, coluna vazia vira trilho estreito que abre ao arrastar, cards sem quadrado de iniciais e com ações fantasma

## v7 — topo de página, abas e fluxos (01/11/2026)

- [x] Topo de página novo em todas as telas: faixa azulada continuando a barra, seção escrita em cima ("Comercial"), título grande, ação principal à direita; no Kanban fica mais baixo
- [x] Abas coladas na base do topo (Leads, Tarefas, Disparos, Ligações, Base de Leads, Contatos, Notificações, Simulador); no desktop a faixa de abas gruda sob a barra azul
- [x] Tarefas: trilho "Seu dia" à direita (filtros em blocos grandes, próxima tarefa com Concluir/Abrir, concluídas nos últimos 7 dias, pendentes por tipo)
- [x] Contatos: tipos viraram abas com contagem; busca respeita o tipo escolhido (antes buscar zerava o filtro); "Só com tarefas abertas" ao lado da busca
- [x] Vendas: seletor de período foi para o topo, ao lado de "Nova Venda"
- [x] Bug: painel lateral (nova tarefa, lead) ficava por baixo da faixa de abas e cortava o primeiro campo — agora abre em portal no <body>
- [x] Números das abas com separador de milhar

## v6 "Azul" — direção A (01/11/2026)

Rafael achou que a v5 não mudou nada de perceptível: trocou cor e fonte, mas
o esqueleto (menu lateral + cabeçalho + grade de cards) era o mesmo. Entre
três esboços escolheu a direção A, com azul no lugar do preto.

- [x] Menu lateral removido; navegação numa barra azul no topo (`TopBar.tsx`) com pílulas, ativo em champanhe, "Mais" para o resto
- [x] Busca ⌘K, Criar, visão do admin, tema, avisos e conta na mesma barra
- [x] Paleta azul: escuro marinho (`#0B1426`/`#111D35`), claro branco com cinzas azulados; login azul
- [x] Conteúdo em largura total com rolagem própria; cabeçalhos `sticky top-0` grudam sob a barra (também corrige o cabeçalho de Disparos/Ligações que passava por baixo da barra antiga)
- [x] Dashboard em mosaico: meta num bloco-herói azul de duas linhas com barras de VGV por semana, previsão e comissões ao lado, faixa de seis indicadores
- [x] Celular: `main` deixou de ser contêiner de rolagem — os cabeçalhos sticky passaram a grudar de fato

## Passada tela a tela (01/11/2026)

- [x] Tarefas — legenda do resumo sem roxo (cor cheia = concluída, clara = pendente, escrito)
- [x] Contatos — "em funil" virou rótulo neutro; avatares sem foto neutros (a paleta sorteava tons de status pela inicial)
- [x] Imóveis — KPIs compactos (R$ 90,9M, exato no title); valores por região e por imóvel neutros (verde = venda, não estoque)
- [x] Lançamentos — sem mudança: régua de renda/entrada já clara
- [x] Base de Leads — "Ver Leads" e responsável sem dourado repetido em 20 cards
- [x] Ligações — "Abrir fila" vira secundária; o destaque fica em "Ligar agora"
- [x] Disparos — KPIs neutros com separador de milhar, funil das campanhas sem arco-íris, abas no padrão deslizante
- [x] Notificações — links de ação neutros (o não lido segue marcado por filete e ponto); piso de 11px
- [x] Admin — sem mudança: hierarquia e semântica já corretas

- [x] Conferência final: tema claro (Disparos, Contatos, Imóveis, Notificações) e celular (Disparos, Imóveis) — sem rolagem lateral
- [x] Imóveis no celular: rótulos de KPI quebram linha em vez de cortar; busca ocupa a linha inteira e os filtros descem

- [x] Kanban v5: colunas neutras nos dois temas (claro `#F1F1F3`, sem bege), filete e tingimento da cor da etapa no topo (`--etapa`), card levanta 2px no hover e afunda no clique
- [x] Tabelas/listas: superfície limpa sem grão, cabeçalho em faixa neutra, linha inteira tingida no hover; `<table>` nativa dentro da folha herda o mesmo comportamento
- [x] Animações: abas com indicador deslizante (pílula neutra elevada ou linha champanhe), troca de tela 280ms com a curva do sistema, paleta padrão da marca no ECharts

- [x] v5.1: a serifa (Fraunces) saiu — títulos e números de destaque em **Plus Jakarta Sans**, interface em **Geist**

## v5 "Grafite" (01/11/2026) — "muda tudo"

- [x] Temas novos: escuro grafite neutro (`#111113`/`#18181B`), claro branco + cinzas neutros; marinho e bege fora das superfícies (login incluso)
- [x] Ouro champanhe só em marca, dinheiro, meta e ação principal
- [x] Barra global no topo (`components/layout/TopBar.tsx`): trilha "Seção › Tela", busca ⌘K, Criar (tarefa/lead/contato), tema e avisos
- [x] Menu lateral só navega (sino saiu para o topo); cabeçalho da tela só com título e ações dela
- [x] Tipografia por papel: `font-display` (Fraunces) só em título de tela, número-herói e título de seção; `font-heading` virou Geist — cards e listas em sans
- [x] Correção: o cabeçalho da tela nunca grudava (regra `.aurora-host > *` forçava `relative`); agora gruda sob a barra global
- [x] Correção: cada tela abria na rolagem da anterior — rolagem da folha zera ao trocar de rota
- [x] Kanban de Leads verificado (carregou nesta sessão)

Escopo ampliado em 31/10: rebranding geral, layout geral novo, hierarquia de
informação, dashboards e biblioteca de gráficos. Direção escolhida: **Signature**
— Marinho profundo, ouro champanhe `#D6B26E`, Fraunces (títulos e números) +
Geist (interface). Simulador e Escritório ficam fora (material do cliente e
pixel art).

## Rebranding Signature

- [x] Paleta nova nos dois temas (champanhe, marinho profundo, marfim no claro)
- [x] Tipografia: Fraunces + Geist; botão, aba e chip ficam em Geist mesmo com `font-heading`
- [x] Menu: itens de 40px/14px, ativo elevado com ícone champanhe, sem filete duplicado
- [x] Gráficos: Recharts → Apache ECharts (`components/charts/Grafico.tsx`), tema lido dos tokens, valor escrito nas barras, abas de gráfico carregadas sob demanda
- [x] Dashboard: selo "Meta batida" coerente, linha "Agora" (próxima ação + prioridades), gráfico de evolução com escala em R$
- [ ] Kanban de Leads — não verificado (leitura da tabela de leads estourou o tempo limite na sessão de teste)
- [ ] Passada de hierarquia tela a tela (Contatos, Imóveis, Lançamentos, Base de Leads, Ligações, Disparos, Notificações, Admin)

## Fundação (35%)

- [x] Performance — fontes: saíram 3 famílias baixadas sem uso; Sora/Inter no HTML em vez de `@import` encadeado
- [x] Performance — aurora animada desligada no celular
- [x] Tokens v4 — moldura (`--frame-bg`), folha (`--sheet-*`), doca (`--dock-*`), raios (`--r-*`) e movimento (`--ease-out`, `--dur*`)
- [x] Moldura — desktop vira moldura + folha flutuante com rolagem própria (`.app-frame` / `.app-sheet`)
- [x] Navegação — trilho sem borda sobre a moldura; item ativo "sobe" para a folha
- [x] Cabeçalho de tela — título maior, busca ⌘K sempre visível (xl+), CTA em Areia sólida
- [x] Celular — barra inferior vira doca flutuante; gaveta "Mais" flutua acima dela
- [x] Primitivas — Card, Button, Input, Select, Textarea, Modal, SidePanel, Painel
- [ ] Verificação visual logada (claro/escuro, desktop/celular)

## Telas (63%)

| Tela | Rota | Status |
|---|---|---|
| Login | `/login` | feito |
| Dashboard | `/` | pendente |
| Leads (Kanban) | `/leads` | pendente |
| Tarefas | `/tarefas` | pendente |
| Ligações | `/prospeccao/ligacoes` | pendente |
| Disparos | `/prospeccao/disparos` | pendente |
| Simulador | `/simulador` | pendente |
| Contatos | `/contatos` | pendente |
| Vendas | `/vendas` | pendente |
| Metas | `/metas` | pendente |
| Histórico de metas | `/metas/historico` | pendente |
| Performance | `/performance` | pendente |
| Imóveis | `/imoveis` | pendente |
| Lançamentos | `/lancamentos` | pendente |
| Base de leads | `/base-leads` | pendente |
| Notificações | `/notificacoes` | pendente |
| Admin | `/admin` | pendente |
| Escritório virtual | `/escritorio` | exceção (pixel art) |
| Pulse | `/pulse` | exceção (quiosque, já é a referência) |

### v10.1 — Ligações, Disparos, Base de Leads e Metas (01/11/2026)

- **Ligações:** meta do dia vira uma linha (`LinhaMetaDia`, usada também na fila); campanhas viram lista com "Abrir fila".
- **Disparos:** KPIs em `FaixaNumeros`, limite diário em uma linha, campanhas em lista com o funil em 4 números (lg+).
- **Base de Leads:** KPIs em `FaixaNumeros`, ordem por `Segmentado`, listas em linhas (score e tamanho à direita); o emoji do score saiu da tela.
- **Metas:** abas de período no padrão `Abas`; score e indicadores numa faixa só (anel de 60px).
- **Banco primeiro:** excluir/transferir campanha, criar/editar/pausar/excluir meta, arquivar lista e limpeza de órfãos agora esperam o banco e mostram o erro — antes eram otimistas ou engoliam a falha.
