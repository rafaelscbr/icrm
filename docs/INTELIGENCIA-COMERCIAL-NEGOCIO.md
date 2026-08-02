# Inteligência Comercial de Leads — como vai funcionar

> Versão de negócio, revisada com as suas correções.
> A parte técnica está em `PLANO-INTELIGENCIA-COMERCIAL.md`. Nada implementado ainda.

---

## 1. O princípio que suas correções revelaram

Você corrigiu três coisas que, juntas, formam uma regra só — e é a mais importante do sistema:

- "Movido para Follow-up → continua **Novo**"
- "Receber o primeiro contato **não** deveria subir"
- "Só sobe se ele responder avançando etapa"

O que está por trás disso:

> ### A temperatura mede o que o LEAD faz. Nunca o que o corretor faz.
>
> O corretor mover o card, ligar, mandar mensagem ou agendar follow-up **não esquenta lead nenhum**. Isso é esforço da casa, não interesse do cliente.
>
> Só esquenta o que **partiu do lead**: ele respondeu, ele aceitou agendar, ele compareceu, ele preencheu outro formulário, ele voltou.

Isso resolve o vício clássico de CRM — o time trabalha muito, os números sobem, e no fim do mês não tem venda. Aqui, se o lead não se mexer, a temperatura não sobe, por mais que o corretor trabalhe.

---

## 2. A máquina de temperatura

Exatamente o caminho que você descreveu:

```
   Lead entra
       │
       ▼
   ┌────────┐   corretor move p/ Follow-up
   │  NOVO  │ ──────────────────────────────►  continua NOVO
   └───┬────┘   (o corretor agiu, o lead não)
       │
       ├──── lead JÁ ESTAVA na base interna ────►  entra direto MORNO
       │
       ├──── atendeu a ligação, foi p/ Atendimento ────►  MORNO
       │
       ├──── 2ª / 3ª tentativa sem resposta ────►  FRIO
       │                                            + ação: estratégia de reganho
       ▼
   ┌────────┐   aceitou agendar visita/vídeo
   │ MORNO  │ ────────────────────────────────►  QUENTE
   └───┬────┘
       │
       ├──── se cadastrou em OUTRO anúncio ────►  MORNO
       │     (mesmo estando em Follow-up)          + ação: reganhar, está procurando
       ▼
   ┌────────┐   COMPARECEU na visita/vídeo
   │ QUENTE │ ────────────────────────────────►  QUENTE FORTE
   └───┬────┘
       │
       ├──── não compareceu ────►  desce um pouco (continua Quente, mais baixo)
       │
       ├──── voltou de Visita p/ Follow-up ────►  ESFRIA
       │
       ├──── tempo passando sem sinal ────►  esfria sozinho
       ▼
   ┌────────┐   deu sinal novo depois de 30d parado
   │  FRIO  │ ────────────────────────────────►  REAQUECENDO
   └────────┘
```

---

## 3. A tabela de sinais, já com suas correções

### Sobe

| Sinal | Peso | Observação |
|---|---|---|
| **Compareceu** na visita ou videochamada | Muito alto | O sinal mais forte que existe |
| **Aceitou agendar** visita ou vídeo | Alto | **Sobe mesmo que não compareça** |
| Respondeu e avançou de etapa | Alto | O avanço é consequência da resposta dele |
| Preencheu formulário de outro empreendimento | Alto | Está procurando ativamente |
| Preencheu de novo, em outro dia | Médio-alto | |
| Voltou dizendo que a renda ou entrada melhorou | Alto | |
| Voltou dizendo que o prazo encurtou | Médio | |
| **Já estava na base interna** de listas | Médio | Entra Morno, não Novo |
| Pesquisou um segundo empreendimento | Médio | |

### Desce

| Sinal | Peso | Observação |
|---|---|---|
| Não respondeu na 2ª / 3ª tentativa | Alto | **Vai direto para Frio** |
| **Voltou no funil** (Visita → Follow-up) | Alto | Regressão é sinal duro |
| Faltou no agendamento | Médio | Desce, mas não zera — ele tinha aceitado |
| Descartado | Alto | Quanto mais duro o motivo, mais desce |
| Renda ou entrada piorou | Médio | |
| Tempo passando | Contínuo | Ver item 4 |

### Não mexe em nada

| Ação | Por quê |
|---|---|
| Corretor moveu o card para Follow-up | Ação do corretor |
| **Primeiro contato registrado** | Ação do corretor. Só conta se o lead responder |
| Corretor mandou mensagem, ligou, criou tarefa | Ação do corretor |

---

## 4. Esfriamento e regressão

**Pelo tempo:** todo sinal perde força. Uma visita feita ontem vale muito mais que a mesma visita há dois meses. Visita pesa forte por uns 2 meses; formulário novo, umas 3 semanas; melhora de renda, um mês e meio. Depois disso continua contando, cada vez menos. **O lead esfria sozinho, sem ninguém mexer.**

**Pela regressão** — sua correção: voltar no funil esfria de imediato, sem esperar o tempo passar.

> Lead estava em Visita, sumiu, não atende mais, o corretor volta ele para Follow-up.

Nesse momento a temperatura cai na hora. Ele tinha o sinal mais forte do funil (aceitou visita) e o desfez. Esperar 30 dias de silêncio para reconhecer isso seria tarde demais — o corretor já sabe hoje.

**A assimetria é de propósito:** avanço aquece devagar (precisa de sinal do lead), regressão esfria rápido. Sistema de vendas honesto é pessimista.

---

## 5. As travas para o número não mentir

**1. Formulário repetido em segundos não conta.** Duas submissões em 10 minutos é problema técnico. Só a primeira conta. Em dias diferentes, conta e pesa mais.

**2. Tem teto.** Três formulários contam. Do quarto em diante para de subir. Lead ansioso não pode ficar mais quente que lead que fez visita.

**3. Só avanço de verdade conta.** Na ordem do funil. Recuo não conta como avanço — conta como regressão (item 4).

**4. Card arrastado errado se apaga sozinho.** Moveu e desfez em poucos minutos: o sistema entende engano e apaga os dois movimentos. O corretor não precisa avisar nada.

**5. Comportamento nunca vira dado financeiro.** Lead pode estar quentíssimo e continuar com renda de R$ 3 mil. O sistema jamais supõe dinheiro a partir de comportamento.

---

## 6. Reconhecer quem já é da casa

Sua ideia, e ela tem lastro maior do que parece.

Hoje você tem **20 listas internas com 16.301 pessoas** — Lista RD Geral, Lançamento Homeset, Lançamento Guará, Living360, Art Tower, Apartamentos Fazenda e outras. E cada lista já carrega um perfil: região, tipologia, faixa de valor.

Cruzei com os leads do Meta:

> **50 dos 600 leads do Meta já estavam nessa base.**
> **22 deles em duas ou mais listas.**
> **6.370 contatos** já têm preferência de região registrada por essas listas.

Hoje esse lead entra como se fosse a primeira vez. Ninguém sabe que ele já se interessou por imóvel antes.

**Como passa a ser** — quando o lead entra, o sistema procura o telefone na base interna. Se achar, na hora que o corretor abre o lead:

```
  Já é da base — 3ª vez que demonstra interesse

  Lançamento Guará          Vila Operária · até R$ 615 mil     mar/2026
  Apartamentos Fazenda      Fazenda                            jan/2026

  Entra como MORNO, não como Novo
```

O corretor abre a conversa sabendo que a pessoa procura imóvel há meses. Muda completamente a abordagem.

**E tem o bônus:** essas listas dizem qual **região** e qual **tipologia** a pessoa buscava. Isso alimenta o perfil dela automaticamente — item 10.

---

## 7. FGTS: a correção que muda a regra

Você me corrigiu em duas frentes:

**No Rogga o FGTS não compõe a entrada** — eu tinha suposto errado no exemplo anterior.

**E a regra maior:** se FGTS importa ou não **depende do regime do produto**.

| Regime | FGTS | Por quê |
|---|---|---|
| **Associativo** | Critério de verdade | Entra na composição, muda a conta |
| **Pós-chaves** | Irrelevante | Só entra no financiamento lá na frente |

Então **o FGTS não é uma regra fixa do sistema — é uma configuração de cada empreendimento.**

Consequência prática, com o **Porto Velas** (pós-chave, você confirmou):

- O formulário dele não pergunta FGTS
- E não precisa perguntar
- O sistema **não pode** marcar esses leads como "dados insuficientes" por causa disso
- Nem sugerir ao corretor que descubra

Se fosse regra fixa, todo lead do Porto Velas nasceria com um alerta falso. Com a regra ligada ao regime, o sistema simplesmente não pergunta o que não importa.

**O mesmo vale para tipologia.** Você disse que vão tirar do formulário — o Dionata prefere perguntar direto. Então ela sai de critério e vira **preferência no perfil**. Nunca reprova ninguém.

---

## 8. A tela de Lançamentos

O que trava o projeto inteiro. Hoje Rogga, San Pelegrino, Porto Velas e Dotzero só existem como texto solto — não há onde registrar quanto cada um exige.

Uma tela nova, no menu, para cadastrar os lançamentos que vocês trabalham.

### O que cadastrar

**Identificação** — nome, construtora, região, status (lançamento / em obra / pronto), foto.

**Regime** — associativo ou pós-chaves. *É esse campo que liga ou desliga o FGTS na regra.*

**Régua de qualificação** — o coração:

| Campo | Para quê |
|---|---|
| Renda mínima | Abaixo disso, incompatível |
| Renda ideal | Acima disso, compatível com folga |
| Entrada mínima | Abaixo disso, incompatível |
| Entrada ideal | Acima disso, compatível com folga |
| FGTS compõe entrada? | Só aparece se for associativo |
| Aceita investidor? | Só morar, só investir, ou ambos |
| Faixa de valor das unidades | |

**Fluxos de pagamento sugeridos** — os que você já usa: "R$ 22 mil de entrada + R$ 2.000/mês", "R$ 30 mil de ato + R$ 1.500". Cada um com sua própria régua. É o que permite o sistema dizer *"não bate no fluxo A, mas bate no fluxo B"* em vez de simplesmente reprovar.

**Validade** — desde quando essa condição vale, até quando. Tabela muda, estoque muda, negociação muda. O sistema usa **a condição que valia no dia em que o lead entrou** — não a de hoje. Assim o histórico não é reescrito toda vez que a tabela muda.

**Público** — região e tipologias das unidades. Serve para o item 9.

### E as pistas antigas

Você autorizou usar o que achei nos formulários antigos como ponto de partida:

| Produto | Pista encontrada | Origem |
|---|---|---|
| Rogga | renda de R$ 13.000 comprovada | formulário de junho |
| Dotzero | R$ 22 mil de entrada + R$ 2.000/mês | formulário de junho |
| Porto Velas | R$ 30 mil de ato + R$ 1.500/mês | formulário de julho |

Entram **pré-preenchidas e marcadas como "a confirmar"**. Você abre a tela, corrige e salva. Nenhuma classificação roda em cima de condição não confirmada — senão o sistema classificaria a base inteira em cima de um palpite meu.

**Atenção:** essas pistas contradizem os formulários de hoje. O Rogga atual oferece "renda até R$ 5 mil" como alternativa, e a pista antiga diz R$ 13 mil. Ou a condição mudou, ou o anúncio está atraindo público fora da régua. Vale olhar.

---

## 9. Matching reverso — a sua melhor ideia

Você descreveu duas direções, e as duas valem:

**Direção 1 — cadastrou lançamento, o sistema traz os leads.**

Você termina de cadastrar um empreendimento novo e, antes de salvar, a tela já mostra:

```
  Este lançamento é compatível com 34 leads da sua base

    18   compatíveis
    16   compatíveis com ajuste
     9   estão quentes agora

    Região Fazenda · renda acima de R$ 8 mil · 2 dormitórios

    [ Gerar lista ]    [ Ver leads ]    [ Criar campanha ]
```

Um clique e vira lista de disparo. Sem exportar planilha, sem filtrar na mão.

**Direção 2 — o sistema avisa o lead.**

Quando um lançamento novo entra, todo lead que passa a fazer sentido para ele ganha a marca:

> *"O empreendimento Living360 agora faz sentido para este lead"*

Inclusive lead antigo, descartado por "sem condição" há seis meses — se o produto novo tem entrada menor, ele volta a ser oportunidade. Hoje ele está enterrado.

**E o dado que sai disso:** com região e tipologia estruturadas na base inteira, você passa a saber **o que o mercado de Itajaí está procurando** — quantas pessoas querem 2 dormitórios na Fazenda, com renda acima de X. Isso vale para escolher o próximo lançamento a trabalhar, e vale numa conversa com construtora.

---

## 10. Perfil rico: região e tipologia como preferências

Você pediu que região e tipologia entrem no perfil mesmo sem estar no formulário, como preferências múltiplas. Fechado.

**Três fontes alimentam:**

1. **O formulário**, quando perguntar
2. **As listas internas** — o Guará dá "Vila Operária"; Apartamentos Fazenda dá "Fazenda"; a lista de 1 dormitório + suíte dá a tipologia. **6.370 contatos já têm região por essa via**
3. **O corretor**, na conversa — o Dionata descobre no atendimento e marca ali mesmo, em dois cliques

**Múltiplas, com peso.** A pessoa pode querer Fazenda *e* Praia Brava. Cada preferência guarda de onde veio e quando:

```
  Regiões
    Fazenda            corretor · 28/07        forte
    Vila Operária      lista Guará · mar/26    média

  Tipologias
    2 dormitórios      formulário · 01/08      forte
    3 dormitórios      corretor · 28/07        média
```

Preferência dita pelo corretor no atendimento vale mais que a herdada de uma lista antiga — ele acabou de ouvir da pessoa.

**Guardado para sempre**, como você pediu. E aqui vale um aviso honesto: guardar renda e capacidade financeira de milhares de pessoas indefinidamente é uma decisão que precisa ser consciente. Isso é dado sensível pela LGPD, e a base vira um ativo que precisa ser protegido. Não estou pedindo para mudar — o valor comercial é claro. Só quero que fique registrado que o acesso a esses campos deve ser controlado e auditado. Vou desenhar assim.

---

## 11. Sugestão de ação

Já existe no iCRM uma "próxima ação" no card, mas ela responde só **o que é urgente** — SLA vencendo, tarefa atrasada, silêncio há X dias.

O que você está pedindo é outra pergunta: **qual é a jogada comercial certa para este lead agora?**

As duas convivem. Urgência manda no *quando*; a nova camada manda no *o quê*.

### As sugestões que você definiu

| Situação | Sugestão |
|---|---|
| Frio no Follow-up, não respondeu 2-3 tentativas | Estratégia de reganho — trocar canal, trocar horário, trocar abordagem |
| Morno em Atendimento | Criar conexão e rapport, encontrar o produto ideal, **converter em videochamada ou visita no decorado** |
| Enrolando no Atendimento, ou se cadastrou em outro anúncio | Reganhar — ele continua procurando, só não com você |
| **Visita feita e parado** | Identificar o produto ideal, buscar condição melhor de pagamento |
| Quente e incompatível com o produto de origem | Oferecer o alternativo que o sistema já achou |
| Compatível e frio | Reativar com o produto |
| Dados insuficientes e quente | Descobrir **só** o que falta — nada mais |

### O detalhe que faz diferença

A sugestão precisa citar o **motivo específico**, não uma frase genérica:

> **Ruim:** "Faça follow-up com este lead"
>
> **Bom:** "Visita feita há 12 dias, sem retorno. A trava é a entrada — ele tem até R$ 10 mil e o produto pede R$ 20 mil. Vale testar o fluxo de R$ 22 mil + R$ 2.000/mês, ou apresentar o Dotzero."

A primeira o Dionata ignora. A segunda ele usa.

**E a mais valiosa de todas** — o lead que estava enrolando e se cadastrou em outro anúncio:

> *"Preencheu o formulário do Porto Velas ontem, estando em atendimento com você no Rogga. Continua procurando — só não com você. Retomar hoje."*

Hoje isso é invisível. O lead entra como se fosse gente nova.

---

## 12. Compatibilidade — como fica

Quatro estados, por empreendimento (não do lead sozinho):

| Estado | Significa | Ação |
|---|---|---|
| **Bate com a régua** | A declaração atende tudo | Atender já sabendo o caminho |
| **Precisa confirmar** | Algo a apurar ou negociar | Consultivo, simular fluxos |
| **Fora da régua declarada** | A declaração não atende | Atender e testar outro produto |
| **Sem dado ainda** | Faltam respostas | Descobrir só o que falta |

> **Nenhum desses estados decide quem é atendido.** Todos são. O estado diz por onde começar a conversa e o que levar para ela — não se a conversa acontece. Ver seção 20.

**A régua trabalha com faixa.** O lead nunca diz valor exato — diz "de R$ 8 a 15 mil". Três resultados:

- **Passa** — a faixa inteira está acima do mínimo
- **Não passa** — a faixa inteira está abaixo
- **Indeterminado** — a faixa cruza a régua. O sistema **não chuta**: marca "compatível com ajuste" e escreve *"a faixa declarada cruza o mínimo — confirmar o valor exato com o cliente"*

**Nunca reprova:** prazo longo, "ainda preciso me planejar", campo em branco, tipologia.

**Dado que falta nunca vira dado ruim:**

| Situação | Como o sistema entende |
|---|---|
| Formulário não perguntou | Não se aplica |
| Perguntou e ficou em branco | Falta descobrir |
| "Ainda preciso me planejar" | Baixa prontidão, não baixa renda |
| Não é critério deste produto (FGTS em pós-chave) | Ignora, nem menciona |

---

## 12-B. Investidor: a renda significa outra coisa

Você perguntou se, para investidor, renda maior ser sempre melhor impacta em algo.
**Impacta, e é um furo no que eu tinha desenhado.** Eu tratei renda como uma coisa
só, e ela é duas.

### Para quem vai morar, a renda satura

Renda ali é **capacidade de pagar a parcela do financiamento**. Tem um mínimo real
(abaixo disso o banco não aprova) e tem um **teto de utilidade**: num produto de
R$ 550 mil, quem ganha R$ 30 mil não é melhor comprador que quem ganha R$ 15 mil.
Os dois financiam com folga. Passou do ideal, o número para de dizer algo.

### Para investidor, a renda não satura

Renda ali não paga moradia — é **capacidade de aportar e de carregar o fluxo até a
entrega**. Quem ganha R$ 50 mil é genuinamente melhor prospect que quem ganha R$ 15
mil: aguenta o fluxo sem apertar, compra mais de uma unidade e volta a comprar.

### E tem uma segunda diferença, talvez maior que a primeira

**Para investidor, a entrada pesa mais que a renda.** Investidor compra com capital
disponível, não com salário. Alguém com renda de R$ 8 mil e R$ 200 mil em caixa é
melhor investidor que alguém com renda de R$ 25 mil e R$ 20 mil em caixa.

Para quem vai morar é o contrário: a renda é que sustenta trinta anos de parcela, e
a entrada é só a porta de entrada.

### Como resolver sem criar campo novo

A saída elegante é que **a regra não vive no produto — vive na resposta do lead**.
O formulário já pergunta "morar ou investir". Então:

| O lead disse | Renda | Entrada |
|---|---|---|
| **Morar** | Critério principal · satura no ideal | Trava de entrada |
| **Investir** | Reforço · nunca satura | Critério principal |

Nenhum campo a mais na tela de Lançamentos. O mesmo produto, com a mesma régua,
é lido de dois jeitos conforme quem está do outro lado.

**O mínimo continua valendo para os dois** — investidor também financia, e o produto
tem o piso que tem. O que muda é o teto e o peso.

### O caso que isso já explicaria

O **Anderson** declarou renda de R$ 2 a 5 mil e comprou um Porto Velas de R$ 680 mil.
Se ele fosse investidor com capital, a régua de morador nunca ia enxergá-lo — e é
exatamente esse tipo de lead que a regra acima recupera.

**Fica para a fase 6**, quando a qualificação for ligada. Criar o campo agora seria
um controle que não faz nada.

---

## 13. Prioridade

| | **Quente / Reaquecendo** | **Morno** | **Frio** |
|---|---|---|---|
| **Bate com a régua** | **P1** — atacar hoje | **P2** — cadência ativa | **P3** — reativar com o produto |
| **Precisa confirmar** | **P1** — consultivo + simulação | **P3** — nutrir pela trava | **P4** — nutrição longa |
| **Sem dado ainda** | **P2** — descobrir só o que falta | **P4** — enriquecer no próximo toque | **P5** — nutrição leve |
| **Fora da régua declarada** | **P2** — testar outro produto | **P4** — nutrição | **P5** — base fria |

**P1 a P5 é ordem de ataque, não lista de aprovados.** P5 continua sendo atendido — só não é por onde o dia começa.

Canto de baixo à esquerda: **lead quente fora da régua não é lead perdido — é lead no produto errado.** Foi exatamente o caso do Anderson: entrou pelo Rogga com renda declarada de R$ 2 a 5 mil, comprou um Porto Velas de R$ 680 mil.

---

## 14. O que aparece na tela

Você quer sinalização clara sem árvore de Natal. A saída é hierarquia: informação diferente em profundidades diferentes.

### No card do funil — um elemento só

Uma **barra fina vertical na borda esquerda** do card, com a cor da temperatura. Não é badge, não é emoji, não é etiqueta. É a mesma linguagem que o Salesforce e o Pipedrive usam: o olho lê a coluna inteira de uma vez sem ler nenhum texto.

```
┃ Ingrid Almeida                    P1
┃ San Pelegrino · R$ 600 mil
┃ Visita amanhã às 14h
```

A barra é a temperatura. O selo de prioridade **só aparece em P1 e P2** — o resto do funil fica limpo. Passou o mouse, um tooltip diz o porquê em uma linha.

**Nada de emoji, nada de fogo, nada de bolinha colorida solta.** Vai seguir a identidade que já está no sistema: Space Grotesk nos rótulos, cantos de 14px, ouro com parcimônia, ícones Lucide finos.

### Ao abrir o lead — a aba Inteligência

```
  Temperatura                                    calculado há 4 min

  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━●
  Frio            Morno            Quente     ▲

  Subiu de Morno para Quente há 2 dias

  +  Aceitou videochamada                            28/07
  +  Já era da base — 2 listas desde mar/2026        01/08
  +  2º formulário em 14 dias                        01/08
  −  Não compareceu na videochamada                  30/07
  −  7 dias sem sinal novo


  Compatibilidade

  San Pelegrino   ● Compatível          origem
    Renda R$ 8-15 mil, acima do mínimo
    Entrada R$ 20-50 mil, acima do mínimo
    Objetivo "morar" aceito

  Rogga           ◐ Com ajuste
    A faixa de renda cruza o mínimo — confirmar valor exato

  Porto Velas     ○ Sem compatibilidade hoje
    Entrada abaixo do mínimo                    ← a trava


  Próxima jogada

  Não compareceu na videochamada há 2 dias, mas segue quente —
  preencheu outro formulário ontem. Continua procurando.
  Reagendar hoje, oferecendo visita no decorado.

  [ Abrir WhatsApp ]    [ Agendar visita ]
```

**A barra de temperatura anima** quando muda de faixa. **A trava vem destacada** — é a única linha que o corretor precisa ler para saber o que resolver.

### Padrão de interação

Sem tela de configuração para o corretor. Sem formulário de inteligência. Tudo que ele faz na aba é **agir**: abrir WhatsApp, agendar, marcar preferência de região. Dois cliques no máximo, sempre.

---

## 15. As listas — respondendo sua dúvida

Você perguntou onde elas aparecem. Não é tela nova: é **a sua tela de Leads ganhando filtros que hoje não existem**.

Hoje você filtra por etapa e corretor. Vai passar a filtrar também por temperatura, compatibilidade, renda, entrada, FGTS, região, tipologia, "preencheu 2 formulários em 30 dias", "melhorou de renda".

E **filtro usado vira lista salva**. Aparece como atalho no topo da tela de Leads:

```
  Quentes compatíveis · 12      Melhoraram de renda · 5      Reaquecendo · 8
```

Um clique e o funil filtra. É a fila de trabalho do dia.

**E conecta com o que já existe:** qualquer filtro desses vira lista de disparo com um botão, direto no seu módulo de campanhas. O caminho de "quero falar com os quentes compatíveis com Porto Velas" até a mensagem sair fica em três cliques.

---

## 16. Bloqueio de teste — melhor do que a gente imaginava

Você sugeriu detectar por nome ou e-mail contendo "test"/"teste". Funcionaria, mas achei uma coisa melhor: **o próprio Meta marca o lead de teste**.

Todos os 10 casos chegam assim:

```
  nome:      <test lead: dummy data for full_name>
  e-mail:    test@meta.com
  telefone:  <test lead: dummy data for whatsapp_number>
```

É um marcador do Meta, não um texto que a pessoa digitou. Ou seja: **detecção sem erro possível**, e o cliente real chamado "Teste Silva" nunca é bloqueado por engano.

Os 10 estão espalhados por todos os formulários — Rogga, San Pelegrino, Porto Velas, Dotzero — e todos viraram lead de verdade: consumiram a vez de um corretor no rodízio, dispararam notificação e criaram prazo de SLA. Depois alguém apagou na mão.

**Como passa a ser:** o teste entra e fica registrado, mas marcado. Não entra no rodízio, não notifica, não cria SLA, não conta em métrica, não classifica. Fica numa listinha para você excluir quando quiser.

A sua regra por nome/e-mail fica como **segunda linha**, para o caso de alguém testar pelo anúncio real em vez do preview do Meta — aí o marcador não vem, mas a pessoa costuma digitar "teste" mesmo. Nesse caso o lead entra normal, só marcado como suspeito, para você decidir. Nunca bloqueia sozinho.

---

## 17. Formulário San Pelegrino — confirmado

Print conferido contra o que chegou no sistema. As 6 perguntas, na ordem:

| # | Pergunta | Alternativas |
|---|---|---|
| 1 | Você procura imóvel para: | Morar com a família · Morar sozinho(a)/casal · Investir |
| 2 | Qual configuração faz mais sentido para você? | 2 dormitórios · 3 dormitórios |
| 3 | Você pretende utilizar FGTS? | Sim · Não |
| 4 | Qual faixa de entrada consegue organizar hoje? | Até R$ 25 mil · Entre R$ 20 mil e R$ 50 mil · Acima de R$ 50 mil · Ainda preciso me planejar |
| 5 | Qual é a renda familiar aproximada? | Até R$ 8 mil · R$ 8 a 15 mil · R$ 15 a 20 mil · Acima de R$ 20 mil |
| 6 | Quando pretende avançar na compra? | Nos próximos 30 dias · Em 1 a 3 meses · Em 3 a 6 meses · Estou só conhecendo opções |

**Eu estava errado na mensagem anterior:** a opção "Até R$ 25 mil" existe sim. O que aconteceu é outra coisa, e é mais interessante.

### A opção que ninguém escolhe

Das 9 respostas reais de entrada que chegaram:

| Resposta | Quantas vezes |
|---|---|
| Entre R$ 20 mil e R$ 50 mil | 5 |
| Ainda preciso me planejar | 3 |
| Acima de R$ 50 mil | 1 |
| **Até R$ 25 mil** | **zero** |

Zero. E dá para entender por quê: quem tem R$ 22 mil olha as duas primeiras opções, vê que se encaixa nas duas, e escolhe a que soa melhor — "entre R$ 20 e 50 mil". Quem tem R$ 8 mil olha "até R$ 25 mil", não se sente representado, e vai em "ainda preciso me planejar".

**A opção está morta e está empurrando gente para os dois extremos.** Você perde justamente a distinção mais útil: quem tem pouco mas tem alguma coisa.

### E ela é a pior opção possível para qualificar

"Até R$ 25 mil" cobre de zero a 25 mil. Se o produto pedir R$ 20 mil de entrada, quem marcasse essa opção seria **sempre indeterminado** — pode ter R$ 3 mil, pode ter R$ 24 mil. O sistema nunca conseguiria decidir.

### O que sugiro

Trocar as faixas por opções que não se sobreponham e não tenham buraco:

```
   Até R$ 10 mil
   R$ 10 mil a R$ 25 mil
   R$ 25 mil a R$ 50 mil
   Acima de R$ 50 mil
   Ainda preciso me planejar
```

Cada resposta passa a significar uma coisa só. E "ainda preciso me planejar" deixa de ser o lixão onde cai todo mundo que não se encaixou.

**Enquanto não mudar**, o sistema trata "até R$ 25 mil" como zero a 25 mil e marca "compatível com ajuste — faixa larga demais, confirmar valor" sempre que cruzar a régua. Não inventa.

**Decisão tomada: não mexer agora.** A campanha está rodando e performando — mexer em anúncio que performa para consertar um detalhe de dado é trocar receita certa por precisão futura. Alimenta assim, troca depois, numa janela em que a campanha já tenha cumprido o papel.

**O que isso exige do sistema.** Como as opções vão mudar em algum momento, o sistema precisa guardar **qual conjunto de opções valia no dia em que cada lead respondeu**. Senão, no dia da troca, todo o histórico passa a ser lido pela régua nova e as respostas antigas viram lixo.

Na prática: "até R$ 25 mil" respondido em agosto continua significando 0-25 mil para sempre, mesmo depois de a opção deixar de existir. O lead de agosto não é reinterpretado pela régua de dezembro.

Isso vale a mesma disciplina que já vale para a condição comercial do produto — **a régua é sempre a que valia na data**, nunca a de hoje. É o que permite mexer no formulário sem medo depois.

### De quebra, o que esses 9 leads dizem

7 dos 9 querem **3 dormitórios**, 7 dos 9 querem comprar **nos próximos 30 dias**, e 7 dos 9 são **morar com a família**. É público bom e com pressa.

---

## 18. Formulário Porto Velas — confirmado

Três perguntas, exatamente como você disse:

| # | Pergunta | Alternativas |
|---|---|---|
| 1 | Você busca imóvel para: | Morar · Investir |
| 2 | Qual é a renda familiar aproximada? | Até R$ 5 mil · R$ 5 a 10 mil · R$ 10 a 15 mil · Mais de R$ 15 mil |
| 3 | Qual entrada você consegue organizar hoje? | Até R$ 15 mil · Entre R$ 15 e 30 mil · Mais de R$ 30 mil |

**Sem FGTS, sem prazo, sem tipologia** — coerente com ser pós-chave.

**E as faixas aqui estão limpas.** Renda: até 5 / 5-10 / 10-15 / +15. Entrada: até 15 / 15-30 / +30. Contíguas, sem sobreposição, sem buraco. Cada resposta significa uma coisa só. O problema do San Pelegrino não se repete aqui.

**Dois detalhes que valem registro:**

**Não existe "ainda preciso me planejar".** Quem não tem entrada nenhuma é obrigado a marcar "até R$ 15 mil". Então essa opção mistura quem tem R$ 14 mil com quem tem zero. Não é erro grave — só significa que a faixa mais baixa do Porto Velas é menos confiável que as outras duas.

**Não perguntar prazo tem um custo pequeno na temperatura.** Prazo não reprova ninguém (nunca foi critério de compatibilidade), mas é sinal de urgência. O lead do Porto Velas entra com um sinal a menos que o do San Pelegrino. Nada bloqueante — só significa que a temperatura dele vai depender mais do comportamento e menos da declaração.

---

## 18. Ordem de implementação

**1. Parar a sangria.** Entram ~18 leads/dia e as respostas do formulário não estão sendo guardadas de forma utilizável. Um lugar só, não muda nada na tela, **não depende de decisão sua**. Junto vai o bloqueio de teste.

**2. Recuperar o histórico.** 493 leads voltam a ter perfil estruturado, incluindo os 17 dos formulários novos.

**3. Perfil + histórico + reconhecimento da base.** Aqui já entra o cruzamento com as 20 listas e as preferências de região/tipologia. A aba Inteligência já aparece, **mesmo sem nota nenhuma** — só o perfil organizado e o "já é da casa" já muda o atendimento.

**4. Tela de Lançamentos.** Você cadastra as condições. É aqui que eu preciso de você.

**5. Compatibilidade.** Régua por faixa, fluxos de pagamento, FGTS por regime.

**6. Temperatura.** A máquina de estados deste documento.

**7. Tela, filtros e listas salvas.**

**8. Matching reverso.** Lançamento novo puxa leads; lead antigo recebe produto novo.

**9. Calibragem com resultado real** — quais classificações viraram visita, proposta e venda.

Cada etapa funciona sozinha e pode ser desfeita sem quebrar a anterior. As três primeiras não dependem de nada seu.

---

## 19. Formulário Rogga — confirmado

Cinco perguntas:

| # | Pergunta | Alternativas |
|---|---|---|
| 1 | Qual seu objetivo hoje? | Comprar para morar · Investir |
| 2 | Você pretende usar FGTS na compra? | Sim · Não |
| 3 | Hoje, qual faixa de entrada você consegue organizar? | Até R$ 10 mil · Entre R$ 10 e 20 mil · Acima de R$ 20 mil · Ainda preciso me planejar |
| 4 | Quando você gostaria de avançar na compra? | Nos próximos 30 dias · Em 1 a 3 meses · Em 3 a 6 meses · Estou apenas conhecendo opções |
| 5 | Qual é a renda familiar bruta? | Até R$ 5 mil · De R$ 5 a 10 mil · Mais de R$ 10 mil |

**Faixas limpas também** — entrada e renda contíguas, sem sobreposição. **O problema da sobreposição é exclusivo do San Pelegrino.** Os outros dois estão bem desenhados.

Um detalhe: a faixa mais alta de renda do Rogga é **"Mais de R$ 10 mil"**, aberta. Ela junta quem ganha R$ 11 mil com quem ganha R$ 40 mil. Se a régua do produto ficar acima de R$ 10 mil, essa faixa vira sempre indeterminada. Não é urgente — só entra na lista de ajustes para quando você mexer nos formulários.

### As três réguas, lado a lado

| | Rogga | San Pelegrino | Porto Velas |
|---|---|---|---|
| Objetivo | morar / investir | morar família / sozinho-casal / investir | morar / investir |
| Renda | até 5 · 5-10 · **+10** | até 8 · 8-15 · 15-20 · **+20** | até 5 · 5-10 · 10-15 · **+15** |
| Entrada | até 10 · 10-20 · +20 · planejar | **até 25 · 20-50** · +50 · planejar | até 15 · 15-30 · +30 |
| FGTS | sim | sim | — |
| Prazo | sim | sim | — |
| Tipologia | — | 2 ou 3 dorm | — |

Três formulários, três escalas de renda diferentes, três escalas de entrada diferentes. **Isso não é problema** — cada produto tem seu público. Mas significa que "renda alta" quer dizer coisas diferentes em cada um, e o sistema tem que trabalhar com valores em reais, não com rótulos.

---

## 20. O caso Anderson — e o que ele muda no desenho

Você me corrigiu dizendo que lead mente e que a classificação não define quem atender. Fui procurar o Anderson no banco. Achei, e o caso é mais forte do que você lembrava:

> **Anderson Dahmer e Souza**
> Declarou renda **R$ 2.000 a R$ 5.000** — a faixa mais baixa do formulário
> Entrou pelo formulário do **Rogga** em 13/06
> Comprou um **Porto Velas de R$ 680.815** em 13/07
> **30 dias** entre entrar e fechar

Ele erra em **duas** dimensões ao mesmo tempo: a renda declarada não tem relação com o que comprou, e o produto que o atraiu não foi o produto que ele levou.

### As três vendas com formulário

São as únicas do banco com lead vinculado — as outras 19 são anteriores ao webhook:

| Cliente | Renda declarada | Entrou por | Comprou | Valor | Dias |
|---|---|---|---|---|---|
| Anderson | R$ 2 a 5 mil | Rogga | **Porto Velas** | R$ 680.815 | 30 |
| Renato | Mais de R$ 10 mil | Rogga | Rogga | R$ 530.947 | 13 |
| Geovane | **não respondeu** | San Pelegrino | San Pelegrino | R$ 667.000 | 5 |

Três casos não provam nada estatisticamente. Mas mostram o suficiente para decidir o desenho:

- **Dois dos três** teriam sido classificados como fracos pelo dado declarado — um pela renda baixíssima, outro por não responder renda nenhuma
- **Um dos três** comprou produto diferente do que o atraiu
- E o **prazo declarado também erra**: o Geovane disse "até o final do ano" e fechou em **5 dias**

O único campo que acertou em dois casos foi a urgência ("não quero perder essa oportunidade" nos dois que declararam). Mas com três casos isso é coincidência tanto quanto padrão.

### O que muda no desenho

**1. Os estados mudam de nome.**

"Sem compatibilidade hoje" soa como veredito sobre a pessoa. Não é — é um veredito sobre **uma declaração de formulário**, feita por alguém que tinha todo incentivo para responder o que achou que daria certo.

| Antes | Agora |
|---|---|
| Compatível | **Bate com a régua** |
| Compatível com ajuste | **Precisa confirmar** |
| Sem compatibilidade hoje | **Fora da régua declarada** |
| Dados insuficientes | **Sem dado ainda** |

"Fora da **régua declarada**" carrega a ressalva dentro do próprio nome. Quem lê entende na hora que o problema pode estar na declaração, não na pessoa.

**2. A compatibilidade nunca ordena a fila de atendimento.**

Todo lead é atendido. Sempre. A compatibilidade serve para três coisas, nenhuma delas é filtrar:

- **Preparar a conversa** — saber onde provavelmente está a trava antes de ligar
- **Escolher o que apresentar** — o Anderson mostra por que isso importa: entrou pelo Rogga, o Porto Velas é que era dele
- **Medir campanha** — qual anúncio traz gente dentro da régua e qual não traz

**Onde ela decide de verdade é na mídia, não no atendimento.** Se um anúncio traz 80% fora da régua, isso é decisão de campanha — trocar criativo, trocar público, trocar verba. Nunca "não atender esses leads".

**3. Cada dado carrega o quanto vale.**

| Origem | Confiança |
|---|---|
| Declarado no formulário | **Baixa** — é o caso do Anderson |
| Confirmado pelo corretor na conversa | **Alta** |
| Comprovado em documento | **Máxima** |

O que o Dionata apurar na conversa **sobrepõe** o formulário, sempre. E a tela mostra a diferença:

```
  Renda    R$ 2 a 5 mil       formulário · 13/06     declarado
  Renda    R$ 14 mil          Dionata · 20/06        confirmado   ← vale esta
```

O formulário não some — vira histórico. E a divergência entre os dois é informação: diz que aquele lead subdeclarou, e que a fonte formulário merece menos peso naquele perfil.

**4. A régua aprende com quem fecha fora dela.**

Toda venda registra em que estado o lead estava quando fechou. Quando aparecer padrão, o sistema avisa:

> *"Nos últimos 90 dias, 34 leads ficaram fora da régua do Rogga por renda. 3 compraram — 2 no Porto Velas. Revisar a régua ou o roteamento."*

É assim que a régua deixa de ser palpite e vira número calibrado — com os seus dados, não com achismo meu. E é o caminho para o Anderson deixar de ser exceção anedótica e virar padrão detectado.

**5. Nunca esconder lead por classificação.**

Nenhuma tela vai ter "ocultar incompatíveis". Filtro para trabalhar em cima, sim. Sumir da vista, não. É a proteção contra o sistema criar um ponto cego onde estava o próximo Anderson.

### Sobre o alerta do Rogga que levantei antes

Continua valendo, mas com a moldura certa. Onze leads: 8 declaram renda até R$ 5 mil, 8 declaram entrada até R$ 10 mil.

**Não é "73% dos leads são ruins".** É: *73% dos leads declaram estar fora da régua que eu supus para o Rogga.* Três leituras possíveis, e só você sabe qual é:

1. A régua de R$ 13 mil está velha e hoje o Rogga atende menos
2. A campanha está atraindo público fora da régua — decisão de mídia
3. As pessoas subdeclaram na hora de preencher, como o Anderson

**A terceira é a que o próprio Anderson sugere.** E se for ela, o número não é sinal de problema de campanha — é sinal de que a pergunta de renda num formulário do Meta vale menos do que parece, e a régua deveria pesar mais no comportamento e menos na declaração.

É por isso que o item 4 acima existe: em vez de escolher entre as três leituras agora, o sistema mede e responde sozinho em uns dois meses.

---

## 20. O que eu preciso de você

### Os três formulários estão mapeados

San Pelegrino, Porto Velas e Rogga — conferidos contra os prints e contra o que chegou no banco. Não preciso de mais nada de formulário.

### O que falta é uma coisa só

As **condições comerciais dos empreendimentos** — e elas só podem ser preenchidas depois que a tela de Lançamentos existir (fase 4).

Até lá, as três primeiras fases não dependem de nada seu.

### Depois, quando a tela de Lançamentos estiver de pé

Para cada empreendimento: regime (associativo ou pós-chave), renda mínima e ideal, entrada mínima e ideal, se aceita investidor, os fluxos de pagamento com suas réguas, e desde quando vale.

Já vou deixar pré-preenchido com as pistas dos formulários antigos, marcadas como "a confirmar".

### Três coisas registradas das suas respostas

**Tipologia sai de critério** e vira preferência no perfil — nunca reprova.

**Termômetro antigo aposentado.** O que existe hoje na tela de contatos vai sair junto com a entrada do novo, para não ficarem dois números com o mesmo nome.

**Guardar para sempre**, com acesso controlado e auditado nos campos financeiros.

---

## Resumo em sete linhas

1. **A temperatura mede o que o lead faz, nunca o que o corretor faz.** Follow-up e primeiro contato não esquentam ninguém.
2. Aceitar agendar já sobe, mesmo sem comparecer. Faltar desce um pouco. Voltar no funil esfria na hora.
3. Quem já estava na base entra Morno — e traz de quebra sua região e tipologia preferidas.
4. FGTS só é critério em produto associativo. Em pós-chave o sistema nem pergunta.
5. **A classificação nunca decide quem é atendido.** Todos são. Ela decide por onde começar a conversa, o que levar, e onde colocar verba de mídia.
6. **O declarado vale pouco** — o Anderson declarou R$ 2 a 5 mil e comprou R$ 680 mil. O que o corretor apura sobrepõe o formulário, e a régua aprende com quem fecha fora dela.
7. **O que trava:** as condições comerciais dos empreendimentos. A tela de Lançamentos é a fase 4 — as três primeiras eu toco sem você.
