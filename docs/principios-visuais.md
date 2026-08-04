# Princípios visuais — a linguagem do Pulse aplicada ao Souza OS

O Pulse foi a primeira tela desenhada com regra em vez de gosto, e virou a
referência do sistema. Este documento é o "porquê" por trás dela: as decisões
que fazem a tela funcionar, escritas de forma que qualquer tela nova possa
segui-las sem copiar código.

Complementa `design-system.md` (tokens e componentes) e `gradientes.md`
(receitas de profundidade). Se houver conflito, o token manda.

---

## 1. Cor é significado. Nunca decoração.

Existem seis tons e cada um tem um trabalho:

| Tom | Significa | Onde aparece |
|---|---|---|
| **Ouro** | marca, dinheiro, meta | VGL, meta do dia, ação principal |
| **Verde** | ganho, feito | venda, meta atingida, transferido |
| **Âmbar** | atenção, prazo | tarefa vencendo, tentativa de contato |
| **Vermelho** | risco | SLA estourado, número inválido |
| **Azul** | informação | retorno agendado, contexto neutro |
| **Neutro** | sem julgamento | o que ainda não aconteceu |

Duas consequências práticas:

- **Não se inventa cor para diferenciar itens.** Se dois blocos precisam ser
  distinguidos e nenhum é melhor que o outro, a diferença é de posição ou
  tamanho — não de matiz.
- **Cor cara não se gasta à toa.** Na tela de Metas o vermelho ficou de fora
  inteiro: meta de esforço em andamento não é risco, e usar vermelho ali tiraria
  força do vermelho que significa "SLA estourado" no Dashboard.

---

## 2. O dourado é racionado — uma vez por tela

O ouro marca **dinheiro, meta e marca**. Se todo card tem filete dourado,
nenhum card tem destaque, e a peça vira o "dashboard gamer" que a identidade
evita.

Na prática: um bloco dourado por tela, no número que carrega o julgamento.
No Pulse é o VGL do mês. Na fila de ligação é a meta do dia. Em Metas é o
bloco de desempenho. Tudo o mais é neutro ou semântico.

---

## 3. Cor sozinha nunca comunica status

Toda cor vem acompanhada de ícone ou texto. É requisito de acessibilidade, mas
é sobretudo de leitura: numa tela vista de longe, o ícone chega antes da cor.

---

## 4. Superfície nunca é chapada

Três camadas empilhadas, com papéis separados:

1. **Grão** — textura incolor, tira o aspecto de plástico.
2. **Degradê de superfície** — volume, simula uma fonte de luz. Incolor.
3. **Ouro** — significado. Racionado.

As duas primeiras podem ir em qualquer lugar porque não têm cor; a terceira é
rara porque tem. **158° em tudo** — o mesmo ângulo faz a tela inteira parecer
iluminada pela mesma fonte. Ângulo variado por componente parece colagem.

---

## 5. Hierarquia é tamanho, não negrito

O número que decide a ação é grande (26–38px, extrabold, tabular). O rótulo é
pequeno, maiúsculo e discreto. O apoio é menor ainda.

Três papéis tipográficos, e só:

- **Sora** (`font-heading`) — número e título
- **Space Grotesk** (`font-label`) — rótulo, 11px, tracking 0.14em, maiúsculo
- **Corpo** — 13–16px, com piso de 11px

Onze variações do mesmo rótulo (que era o estado do sistema até hoje) não se
percebem item a item, mas somadas fazem a tela parecer "sem tipografia".

---

## 6. Números alinham. Sempre.

`tabular-nums` em todo número que aparece em lista, coluna ou que muda no
tempo. Sem isso a coluna "dança" a cada atualização e o olho perde a
comparação, que é justamente para o que a coluna existe.

---

## 7. A tela diz o que está acontecendo, não o que ela mede

O Pulse não escreve "interações: 21". Escreve "Rafael falou no WhatsApp com
Fulano · Garden Park". A leitura de dois segundos exige sujeito, verbo e
objeto.

Corolário: **evento agrupado nunca vira mentira**. 200 disparos em sequência
viram uma linha "disparou para 200 contatos" — mas a ligação que gerou
interesse nunca é agrupada, porque é o evento raro que justifica a operação.

---

## 8. Nunca afirmar mais do que se observou

O sistema só sabe que o corretor **abriu a conversa** — não que ligou, nem que
foi atendido. Então o feed diz "ligou para", e a taxa de atendimento vem
acompanhada de quantas ligações ficaram **sem desfecho**.

Um painel que arredonda a verdade para parecer melhor deixa de servir para
decidir qualquer coisa. É a regra que mais custa e a que mais protege.

---

## 9. Movimento é ambiente, não evento

A aurora do fundo se move em ciclos de 48s e 67s — propositalmente não
múltiplos, para o olho nunca perceber o loop. Anima só `transform`, que o
compositor resolve na GPU. `prefers-reduced-motion` congela tudo.

Animação que chama atenção para si mesma está errada. A exceção é a
comemoração de venda, que **deve** interromper.

---

## 10. Contexto acima de foco total

Painel lateral, não modal centralizado. Modal cobre a tela e diz "pare tudo e
resolva isto" — quase nada no dia a dia é assim. O corretor mexe num lead sem
querer perder o Kanban de vista.

Modal central fica para **confirmação curta e destrutiva**, onde o "pare tudo"
é exatamente a intenção.

---

## 11. Menos cliques que a explicação

A ação principal fica a um toque, sem menu intermediário. Se uma regra não é
óbvia (reserva de lead, cadência, o que conta como ligação), ela vira uma
**dica escrita** na tela — porque sem a regra escrita quem usa inventa a
própria, e ela costuma estar errada.

---

## 12. O custo faz parte do desenho

A tela do Pulse roda 12h/dia num iPad. Isso definiu: uma leitura por sessão,
arrays com teto fixo, só INSERT no realtime, nenhum `setInterval` que toque a
rede. Beleza que custa egress todo mês não é beleza — é dívida.

---

## Como aplicar numa tela nova

1. Qual é **o número que decide a ação**? Ele é o maior e recebe o único ouro.
2. O que é **status**? Ganha tom semântico + ícone.
3. O que é **contexto**? Fica em 11px, neutro.
4. Toda seção recebe **filete + ícone** — é o que faz o olho achar a divisão
   sem ler.
5. Formulário e edição abrem **à direita**.
6. Passe no teste do modo claro. É onde os bugs moram: o sistema nasceu escuro
   e degradê copiado do escuro vira barro no papel.
