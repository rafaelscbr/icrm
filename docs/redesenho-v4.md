# Redesenho Souza OS v4 — andamento

Pedido de 31/10/2026: redesenhar o sistema inteiro (claro e escuro), com
melhores práticas de UX/UI e performance. Este arquivo é o placar.

Pesos: fundação 35% · 18 telas ~3,5% cada (63%) · verificação final 2%.

**Progresso: 76%**

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
