# Identidade visual Souza Imobiliária — "Folha Clara"

Versão 1.1 · 02/11/2026 (espaçamento, layout, estados, movimento e regras de UX) · nasce do iCRM (tema claro, padrão "Folha").

A identidade da Souza deixa de girar em torno do azul escuro e passa a girar em
torno do **claro**: uma folha limpa, levemente azulada, com tinta Marinho, uma
barra Marinho no topo e o **Champanhe** como a cor que marca dinheiro, ação e
marca. A assinatura é a **palavra em itálico serifado dourado** no meio de uma
frase sans — "Do primeiro contato à *chave* na mão".

O tema escuro continua existindo como alternativa, mas o claro é o padrão e a
referência de toda peça nova (sistema, site, apresentação, post, papelaria).

---

## 1. Essência

- **Clara e objetiva.** Fundo claro, muito espaço, poucas caixas. A informação
  que importa é grande; o resto é pequeno e cinza-azulado.
- **Uma ação por vez.** Toda tela, peça ou página diz o que fazer a seguir.
- **Marinho estrutura, Champanhe destaca.** O azul dá a moldura (barra, títulos,
  texto). O dourado aparece pouco e sempre com propósito: dinheiro, meta,
  ação principal, a palavra de destaque.
- **Cor com significado.** Verde = ganho/feito, âmbar = atenção, vermelho =
  risco, petróleo = informação. Nunca cor para enfeitar.

## 2. Paleta

### Fundos e superfícies

| Nome | Hex | Uso |
|---|---|---|
| Folha | `#F3F6FB` | Fundo de página. Branco levemente azulado — nunca branco puro, nunca bege. |
| Papel | `#FFFFFF` | Cartões, painéis, folhas laterais, campos em foco. |
| Névoa | `#EDF1F8` | Superfície secundária: blocos de destaque, faixa de abas, pílulas inativas. |
| Névoa forte | `#E0E7F2` | Hover de superfície, trilhos de barras de progresso. |
| Campo | `#EEF2F8` | Fundo de campo de formulário (sem borda). Hover `#E6ECF5`. |

### Marinho (estrutura e texto)

| Nome | Hex | Uso |
|---|---|---|
| Barra Marinho | `#0F2759` | Barra de navegação do topo, faixa de marca. Mesma cor nos dois temas. |
| Marinho Profundo | `#0B1A3A` | Texto principal (t1), texto sobre dourado, títulos. |
| Marinho Médio | `#2A3A5C` | Texto secundário forte (t2). |
| Ardósia | `#44557A` | Texto de apoio (t3). |
| Ardósia clara | `#5D6E8E` | Rótulos, metadados (t4, ≥ 4.5:1 sobre Folha). |
| Bruma | `#A6B3CB` | Só decorativo (t5) — nunca texto que informa. |
| Linha | `rgba(15,39,89,0.10)` | Divisórias. Forte: `0.18`. |
| Herói | `linear-gradient(140deg, #1A3F8F, #12306E 48%, #0C2153)` | Bloco-herói (meta do mês), painel de marca do login. |

### Champanhe (marca, dinheiro, ação)

| Nome | Hex | Uso |
|---|---|---|
| Champanhe | `#D6B26E` | **Botão principal**, pílula ativa, avatar, chip de destaque. Texto por cima: Marinho Profundo `#0B1A3A` (6.5:1). |
| Champanhe hover | `#CBA55F` | Hover do botão principal. |
| Champanhe claro | `#E8CD94` | Início do degradê do botão, dourado sobre fundo Marinho. |
| Ouro tinta | `#8F6B2C` | Ícone/marcador dourado sobre Folha. |
| Ouro texto | `#7A5A22` | Texto dourado pequeno sobre Folha (link, "Esqueci a senha"). |
| Ouro destaque | `#9C7430` | **A palavra em itálico serifado** sobre fundo claro. Sobre Marinho: `#E2C385`. |
| Champanhe tinta | `rgba(214,178,110,0.18)` | Fundo de item ativo, ícones de "criar". |

### Semânticas

| Nome | Hex | Fundo | Uso |
|---|---|---|---|
| Sucesso | `#1F8A62` | `#E7F5ED` | Venda, comissão, meta batida, feito. |
| Atenção | `#BD7A12` | `#FBF0DC` | Prazo hoje, sem contato há dias. |
| Risco | `#C7474F` | `#FBEAEB` | Atrasado, SLA vencido, excluir. |
| Informação | `#236B73` | `#E7F2F2` | Contexto neutro, retorno, reentrada. |
| WhatsApp | `#1FAE5B` | — | Só o botão de WhatsApp (texto branco). |

### Cores de etapa do funil (claro)

Lead `#4F46E5` · Followup `#7E22CE` · Atendimento `#0369A1` · Visita `#0F766E` ·
Proposta `#946200` · Venda `#15803D`.

### Cores de área (navegação e abas)

Operação `#2563EB` · Comercial `#7C3AED` · Produtos `#0F9488` · Prospecção
`#EA580C` · Inteligência `#B7862A` · Conta `#5D6E8E`. Aparecem só no
sublinhado da aba ativa e no hover de linhas de tabela — nunca como fundo.

### Proporção

Em qualquer tela ou peça: ~80% Folha/Papel, ~15% Marinho (texto, barra),
~5% Champanhe, semânticas só onde há estado.

## 3. Tipografia

| Papel | Família | Peso | Uso |
|---|---|---|---|
| Display | **Plus Jakarta Sans** | 700–800, tracking −0.025em | Títulos de tela, nome na ficha, números-herói. |
| Texto | **Geist** | 400–600 | Interface, corpo, rótulos, botões. |
| Destaque | **Instrument Serif itálica** | 400, +12% de tamanho | **Uma palavra por frase**, sempre em Ouro destaque. |

Escala: 12.5 (rótulo) · 14 (texto) · 15 (título de seção) · 17–19 (título de
tela) · 26–28 (nome da ficha) · 40–56 (manifesto/herói). Rótulos **nunca** em
MAIÚSCULAS espaçadas — texto normal, pequeno, Ardósia clara. Números sempre
tabulares.

### A palavra de destaque

- Uma por frase, nunca a frase inteira, nunca duas na mesma linha.
- Escolha a palavra que carrega o sentido: "Bom *dia*", "Prioridades de
  *hoje*", "Nenhuma *venda* no período", "Do primeiro contato à *chave* na mão".
- Sempre dourada (`#9C7430` no claro, `#E2C385` sobre Marinho).
- Não usar em botão, campo, tabela ou número.

## 4. Componentes da identidade

**Barra do topo.** Marinho `#0F2759`, 60px, logo "S" em quadrado Champanhe
(raio 24%), itens em pílula (texto branco 82%), item ativo em pílula
Champanhe com texto Marinho. Busca e "Criar" à direita.

**Botões.**
- Principal: fundo Champanhe `#D6B26E`, texto Marinho `#0B1A3A`, peso 600–700,
  raio 12px, altura 40–44px (52px em login/CTA de página). Um por tela.
- Secundário: fundo Papel, borda Linha, texto Marinho.
- Fantasma: sem fundo, texto Ardósia → Marinho no hover.
- Perigo: texto Risco, fundo Risco-fundo no hover.
- WhatsApp: verde `#1FAE5B`, texto branco.

**Campos.** Sem borda. Fundo Campo `#EEF2F8`, raio 10px, altura 44px. No foco:
fundo Papel + borda azul `#2563EB` + halo 3px. Rótulo em cima, 12.5px, 600,
Ardósia. O título do formulário é o próprio campo principal (22px, sem caixa).

**Pílulas de escolha.** Inativa: Névoa `#EDF1F8`, texto Marinho Médio. Ativa:
Champanhe com texto Marinho. Raio total.

**Cartões.** Papel, raio 14–18px, sombra mínima `0 1px 4px rgba(15,39,89,.08)`.
Nada de caixa com borda dentro de caixa: separar por espaço e por tom.

**Faixa de números.** Até 4 números lado a lado, divididos por filete fino;
rótulo 12.5px em cima, número 20–26px Plus Jakarta embaixo.

**Ficha (tela de detalhe).** Responde três perguntas nesta ordem:
1. *Quem é* — nome 26–28px como título, uma linha de dados.
2. *Em que pé está* — régua de pontos na cor da etapa atual.
3. *O que fazer agora* — um bloco com fundo Névoa tingido pelo tom, filete de
   3px à esquerda na cor do tom, a frase da próxima ação e os botões.
O resto em abas.

**Ícones.** Lucide, traço 1.8–2, 16–22px. Nunca emoji.

**Raios.** 10 (campo, botão pequeno) · 12 (botão) · 14 (lista) · 18 (bloco) ·
22–26 (painel, folha, doca). **Sombras** sempre em Marinho diluído, nunca preto.

**Movimento.** Entradas de 150–420ms com desaceleração; nada que pisque;
respeitar "reduzir movimento".

## 5. Espaçamento

Tudo em múltiplos de **4px**; o ritmo de leitura vem dos múltiplos de 8.

| Token | Valor | Uso |
|---|---|---|
| `esp-1` | 4px | Entre ícone e texto colado, entre linhas de um mesmo dado. |
| `esp-2` | 8px | Entre botões vizinhos, entre pílulas, entre rótulo e campo (6–8). |
| `esp-3` | 12px | Entre itens de uma lista compacta, padding de chip. |
| `esp-4` | 16px | Padding interno de bloco pequeno, margem lateral no celular. |
| `esp-5` | 20px | Padding interno de bloco médio, distância entre campos de formulário. |
| `esp-6` | 24px | Margem lateral no tablet e dentro de painéis, entre seções de formulário. |
| `esp-8` | 32px | Margem lateral no computador, entre seções de uma tela. |
| `esp-12` | 48px | Entre grandes blocos de uma página de marca. |
| `esp-16` | 64px | Entre seções de site/apresentação. |

**Regras**
- Agrupar por proximidade: coisas da mesma família ficam a 4–8px; grupos diferentes a 24–32px. A distância é o que separa — não a borda.
- Espaço interno de bloco: 16–20px no celular, 20–24px no computador.
- Linha de lista: 14px em cima e embaixo (altura ~56–64px) — confortável para o dedo.
- Nunca colar texto na borda de um bloco colorido: mínimo 16px.

## 6. Layout

| Medida | Valor |
|---|---|
| Largura máxima do conteúdo | 1280px (`max-w-7xl`), centralizado; telas de quadro (Kanban) usam a largura toda. |
| Margem lateral | 16px celular · 24px tablet · 32px computador. |
| Barra do topo (computador) | 60px de altura. |
| Topo de cada tela | 56px, uma linha: título + abas + ação principal. Gruda no topo ao rolar. |
| Barra de baixo (celular) | 64px, flutuando 8px acima da borda, 4 destinos. |
| Painel lateral (ficha/formulário) | 544–576px de largura no computador; tela cheia no celular. |
| Pontos de quebra | 640 (celular grande) · 768 (tablet) · 1024 (computador: barra do topo aparece) · 1280 (tela larga: painéis extras) · 1536. |
| Altura de linha do texto | 1.5–1.6 no corpo; 1.05–1.2 em títulos. |
| Largura de leitura | até ~65 caracteres por linha em textos corridos. |

**Hierarquia de uma tela, de cima para baixo**
1. Topo de uma linha (o que é a tela e a ação principal).
2. Faixa de números — só se os números forem o assunto da tela.
3. Uma linha de filtros (busca + atalhos + seletor).
4. O conteúdo (lista em linhas, quadro, ficha).
Nada de faixas, banners ou resumos grandes antes do conteúdo.

## 7. Elevação e superfícies

| Nível | Como | Uso |
|---|---|---|
| 0 · Folha | `#F3F6FB`, sem sombra | Fundo da página. |
| 1 · Cartão | Papel + `0 1px 4px rgba(15,39,89,.08)` | Listas, faixas de números, blocos. |
| 2 · Flutuante | Papel + `0 10px 30px rgba(15,39,89,.12)` | Menus, popovers, seletores. |
| 3 · Painel | Papel + `0 25px 50px rgba(15,39,89,.18)` | Ficha lateral, modal, folha de baixo. |

Fundo escurecido atrás de painel: preto 25% (painel lateral) a 45% (folha do celular). Sombras sempre em Marinho diluído; desfoque só para indicar que o fundo está em segundo plano.

## 8. Ícones

- Família única: **Lucide** (contorno), traço **1.8** (2.0–2.3 no item ativo).
- Tamanhos: **13–15px** ao lado de texto pequeno · **16–17px** em botões · **20–22px** na navegação e em ações de toque.
- Ícone ao lado de texto é decorativo (escondido do leitor de tela); ícone sozinho precisa de nome acessível.
- Ícone não carrega cor sozinho — a cor vem do estado (ativo, risco, sucesso).
- Nunca emoji como ícone.

## 9. Estados

| Estado | Como aparece |
|---|---|
| Normal | Como descrito nos componentes. |
| Passar o mouse | Superfície um degrau acima (Névoa → Névoa forte; Papel → Névoa). Botão principal: `#CBA55F`. Linha de lista: fundo levemente tingido pela cor da área (7%). |
| Pressionar | Escala 0.98 por 120ms, sem mover o resto da tela. |
| Foco (teclado) | Anel de 2px na cor da marca ou azul `#2563EB`, afastado 2px. Nunca remover. |
| Selecionado / ativo | Champanhe com texto Marinho (pílulas, item de navegação) ou sublinhado de 2.5px na cor da área (abas). Sempre com texto em negrito — cor nunca sozinha. |
| Desabilitado | Opacidade 40–50%, cursor de proibido, sem resposta ao toque. |
| Carregando (botão) | Giro de 15px à esquerda do texto, texto vira "Salvando…", botão travado. |
| Carregando (tela) | Esqueleto com o formato do conteúdo (linhas para lista, blocos para cartões). Nunca tela branca com giro. |
| Vazio | Ícone discreto + título com palavra de destaque ("Nenhuma *venda* no período") + uma frase do que fazer + o botão que faz. |
| Erro de campo | Borda e halo vermelhos, mensagem embaixo do campo com a causa e como resolver. |
| Erro de gravação | Aviso com a causa; o formulário continua aberto com o que foi digitado. |
| Sucesso | Aviso curto ("Venda registrada"), 3–5s, sem roubar o foco. |

## 10. Movimento

| Token | Valor | Uso |
|---|---|---|
| Rápido | 140ms | Cor, fundo e borda no passar do mouse; pressionar. |
| Padrão | 220ms | Abrir menu, trocar aba, mostrar/ocultar seção. |
| Lento | 420ms | Painel entrando, tela chegando, barras de progresso enchendo. |
| Curva | `cubic-bezier(0.16, 1, 0.3, 1)` | Desaceleração ao chegar. Sair é mais rápido que entrar. |

- Animar só posição/escala/opacidade — nunca largura ou altura.
- No máximo 1–2 elementos animados por tela.
- Painéis entram de onde vieram (lateral pela direita, folha de baixo por baixo).
- Com "reduzir movimento" ligado no aparelho, tudo fica instantâneo.

## 11. Regras de UX

**Ação e hierarquia**
- Cada tela responde primeiro à pergunta principal dela; o resto vem depois ou em abas.
- **Um** botão principal por tela/painel. Secundários em contorno ou fantasma.
- Toda tela de detalhe é uma **ficha orientada à ação**: quem é → em que pé está → o que fazer agora (com os botões ali).
- Revelação progressiva: o que é opcional fica em "+ Mais detalhes".

**Toque e acesso**
- Área de toque mínima **44×44px**, com 8px entre alvos.
- Contraste mínimo **4.5:1** para texto normal e **3:1** para texto grande e ícones que informam.
- Tudo funciona pelo teclado, na ordem visual; Esc fecha painéis.
- Cor nunca é a única pista: sempre com texto ou ícone.
- Celular: barra de baixo com no máximo 4 destinos; busca e avisos no topo; nada de rolagem lateral; texto de corpo ≥ 14px (campos 16px para o iPhone não dar zoom).

**Formulários**
- Rótulo sempre visível em cima do campo (placeholder não é rótulo).
- Validar ao sair do campo e ao enviar, nunca a cada tecla.
- Erro embaixo do campo, com causa e saída; o foco vai para o primeiro campo com problema.
- Teclado certo para cada campo (telefone, e-mail, número).
- Valores em dinheiro sempre em R$ com separador brasileiro, digitados como texto mascarado.
- Fechar com algo digitado pergunta antes de descartar.

**Dados e confiança**
- O banco é a fonte da verdade: a tela só mostra "salvo" depois que o banco confirma. Se falhar, o erro aparece e nada some ou muda.
- Exclusão pede confirmação; quando não apaga nada em cascata, oferece **Desfazer**.
- Números: tabulares, abreviados em faixas (R$ 1,2M) e completos no detalhe (R$ 1.200.000,00).
- Datas em português ("19 de out."), relativas quando ajudam ("há 6 dias").
- Nunca mostrar número inventado; sem dado, mostrar "—".

## 12. Como escrever

- Falar como o corretor fala: "Ligar", "Registrar venda", "Agendar visita" — verbo no botão, dizendo exatamente o que acontece.
- Avisos curtos e no passado depois da ação: "Venda registrada", "Tarefa criada".
- Erro diz o que houve e o que fazer: "Não foi possível salvar. Verifique a internet e tente de novo."
- Tela vazia diz o que vai aparecer ali e como começar.
- Sem jargão de sistema, sem MAIÚSCULAS, sem exclamação em excesso, sem emoji.
- A palavra de destaque em serifa vai na palavra que carrega o sentido.

## 13. Tema escuro (alternativa)

Fundo `#0B1426`, superfície `#111D35`, texto `#EEF2F9`, a mesma barra Marinho
e o mesmo Champanhe; destaque em `#E2C385`. Existe para quem prefere — não é a
referência da marca.

## 14. Não fazer

- Fundo branco puro de página ou bege/creme.
- Dourado em tudo (se tudo é dourado, nada é destaque).
- Mais de uma palavra serifada por frase; serifa em título inteiro.
- Rótulos em MAIÚSCULAS com espaçamento largo.
- Caixa com borda dentro de caixa com borda.
- Preto puro em texto ou sombra.
- Cor sem significado (diferenciar itens por matiz à toa).

## 15. Tokens prontos (CSS)

```css
:root {
  /* Folha Clara — padrão */
  --page-bg: #F3F6FB;  --surface: #FFFFFF;  --surface-2: #EDF1F8;  --surface-3: #E0E7F2;
  --t1: #0B1A3A;  --t2: #2A3A5C;  --t3: #44557A;  --t4: #5D6E8E;  --t5: #A6B3CB;
  --line: rgba(15,39,89,.10);  --line-strong: rgba(15,39,89,.18);
  --bar-bg: #0F2759;  --bar-text: rgba(255,255,255,.82);
  --hero-bg: linear-gradient(140deg, #1A3F8F 0%, #12306E 48%, #0C2153 100%);
  --brand-fill: #D6B26E;  --brand-fill-hover: #CBA55F;  --brand-fill-text: #0B1A3A;
  --brand: #8F6B2C;  --brand-text: #7A5A22;  --brand-tint: rgba(214,178,110,.18);
  --destaque: #9C7430;
  --field-bg: #EEF2F8;  --field-bg-hover: #E6ECF5;  --field-focus: #2563EB;
  --success: #1F8A62;  --success-bg: #E7F5ED;
  --warning: #BD7A12;  --warning-bg: #FBF0DC;
  --error:   #C7474F;  --error-bg:   #FBEAEB;
  --info:    #236B73;  --info-bg:    #E7F2F2;
  --whatsapp: #1FAE5B;
  --font-display: "Plus Jakarta Sans", Geist, system-ui, sans-serif;
  --font-body: Geist, system-ui, sans-serif;
  --font-destaque: "Instrument Serif", Georgia, serif;
  /* espaço */
  --esp-1: 4px; --esp-2: 8px; --esp-3: 12px; --esp-4: 16px; --esp-5: 20px;
  --esp-6: 24px; --esp-8: 32px; --esp-12: 48px; --esp-16: 64px;
  /* raio */
  --r-campo: 10px; --r-botao: 12px; --r-lista: 14px; --r-bloco: 18px; --r-painel: 22px;
  /* sombra */
  --sombra-cartao: 0 1px 4px rgba(15,39,89,.08), 0 1px 2px rgba(15,39,89,.05);
  --sombra-flutuante: 0 10px 30px rgba(15,39,89,.12), 0 4px 10px rgba(15,39,89,.08);
  --sombra-painel: 0 25px 50px rgba(15,39,89,.18), 0 10px 20px rgba(15,39,89,.10);
  /* movimento */
  --dur-rapido: 140ms; --dur: 220ms; --dur-lento: 420ms;
  --curva: cubic-bezier(0.16, 1, 0.3, 1);
  /* medidas */
  --largura-max: 1280px; --altura-barra: 60px; --altura-topo-tela: 56px;
  --altura-doca: 64px; --toque-min: 44px;
}
.destaque { font-family: var(--font-destaque); font-style: italic; font-weight: 400;
            font-size: 1.12em; color: var(--destaque); }
```

Google Fonts:
`https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500..800&family=Geist:wght@400..700&family=Instrument+Serif:ital@1&display=swap`
