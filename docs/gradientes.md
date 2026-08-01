# Gradientes, texturas e brilhos — Souza Imobiliária

Receitas de profundidade visual do Souza OS. Documento autocontido: os valores
abaixo funcionam em CSS, Figma, Canva ou Illustrator, sem depender do código do
iCRM.

**Cores da marca usadas aqui**

| Nome | Hex |
|---|---|
| Carvão | `#070B1A` |
| Marinho | `#0F1730` |
| Marinho Claro | `#18224A` |
| Areia | `#E4B23C` |
| Areia Profundo | `#C2922A` |
| Areia Clara | `#F0CC78` |
| Papel | `#F6F3EC` |
| Papel 2 | `#ECE7DA` |

---

## O princípio

A profundidade vem de **três camadas independentes**, empilhadas. Cada uma tem
um trabalho e nenhuma faz o trabalho da outra:

1. **Grão** — textura. Tira o aspecto de plástico. Incolor.
2. **Gradiente de superfície** — volume. Simula uma fonte de luz. Incolor.
3. **Areia** — significado. Marca dinheiro, meta e marca. **Racionada.**

Separar isso é o que faz o conjunto não virar poluição: as duas primeiras podem
ir em qualquer lugar porque não têm cor, e a terceira é rara porque tem.

---

## 1. Brilho de superfície

O gradiente dos cards, listas, modais e do Kanban.

**Escuro** — luz branca entrando pela diagonal superior esquerda:

```css
linear-gradient(158deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0) 58%)
```

**Claro** — inverte: sombra fria de Marinho subindo do rodapé.

```css
linear-gradient(158deg, rgba(255,255,255,0) 45%, rgba(15,23,48,0.030) 100%)
```

**Achatado** (para ferramentas sem sobreposição com alfa):

- Escuro: `#1C243B` → `#0F1730`, a 158°
- Claro: `#FFFFFF` → `#F8F8F9`, a 158°

> No claro o degradê **muda de direção**. Luz branca sobre branco não existe —
> copiar o valor do escuro produz um card morto.

---

## 2. Superfície premium

Versão forte, para blocos executivos (hero de meta, painéis de receita). Em vez
de luz branca, usa os dois planos de Marinho, então o volume é maior.

```css
/* escuro */ linear-gradient(158deg, #18224A 0%, #0F1730 62%)
/* claro  */ linear-gradient(158deg, #F1EEE6 0%, #FFFFFF 62%)
```

---

## 3. Areia — filete, luz e barra

### Filete no topo do card

```css
/* completo */ linear-gradient(90deg, transparent, #E4B23C, transparent)  /* opacity .55 */
/* curto    */ linear-gradient(90deg, #E4B23C 0%, transparent 60%)        /* opacity .45 */
```

Altura: **1px**. Acima disso vira moldura e perde a sutileza.

### Luz difusa de canto

```css
radial-gradient(70% 60% at 6% -10%, rgba(228,178,60,0.13), transparent 60%)
```

O `at 6% -10%` coloca a fonte de luz **fora** do card, acima da borda — é isso
que faz parecer iluminação, e não uma mancha desenhada dentro do card.

Em CSS exige `isolation: isolate` no card **e** `z-index: -1` no pseudo-elemento,
juntos. Sem o isolate, o brilho escapa para trás do card e some. Sem o z-index
negativo, ele pinta por cima do texto e lava a leitura.

### Barra de progresso (meta / VGV)

```css
background: linear-gradient(90deg, #C2922A, #E4B23C 70%, #F0CC78);
box-shadow: 0 0 16px rgba(228,178,60,0.35);
```

O halo é o que faz o número parecer financeiro em vez de decorativo.

---

## 4. Aurora — brilho que se move no fundo

Dois focos de luz Areia, muito difusos, com deriva independente.

| | Foco A | Foco B |
|---|---|---|
| Cor (escuro) | `rgba(228,178,60,0.14)` | `rgba(228,178,60,0.09)` |
| Cor (claro) | `rgba(228,178,60,0.055)` | `rgba(196,146,42,0.035)` |
| Tamanho | 46vw | 38vw |
| Blur | 90px | 90px |
| Ciclo | 48s | 67s |

Cor de pico no centro do foco A sobre Carvão: `#26221F`.

```css
.aurora::before {
  background: radial-gradient(circle, rgba(228,178,60,0.14) 0%, transparent 70%);
  filter: blur(90px);
  animation: auroraA 48s ease-in-out infinite alternate;
}
@keyframes auroraA {
  0%   { transform: translate3d(0, 0, 0)      scale(1);    }
  50%  { transform: translate3d(12vw, 6vh, 0) scale(1.18); }
  100% { transform: translate3d(4vw, 14vh, 0) scale(1.05); }
}
```

**48s e 67s não são múltiplos de propósito.** Se fossem, os dois focos voltariam
à mesma posição em sincronia e o olho perceberia o loop.

**Anima só `transform`.** O compositor resolve na GPU, sem recalcular layout nem
repintar. Animar `background-position` — o caminho óbvio — custaria repaint de
tela cheia a cada frame, com o app inteiro por cima. Numa tela aberta 8h por dia,
isso aparece como lentidão.

Sempre acompanhado de `@media (prefers-reduced-motion: reduce)` congelando a
animação. O brilho continua; apenas para de se mover.

---

## 5. Grão

Ruído fractal em SVG inline, ~300 bytes, sem requisição de rede e sem imagem no
bundle.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
  <filter id="g">
    <feTurbulence type="fractalNoise" baseFrequency="0.85"
                  numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="160" height="160" filter="url(#g)" opacity="0.06"/>
</svg>
```

- `stitchTiles="stitch"` faz o ladrilho fechar sem emenda visível.
- `feColorMatrix saturate 0` tira a cor do ruído — turbulência crua sai colorida.
- A **opacidade vai dentro do `<rect>`**, não no CSS: `background-image` não
  aceita `opacity`.

Por isso existem duas versões: **0.06** no escuro, **0.035** no claro, onde o
ruído aparece quase o dobro.

---

## 6. A pilha completa

O hero da Dashboard empilha as quatro camadas. **A ordem importa** — em CSS, a
primeira da lista fica por cima:

```css
background-color: #0F1730;
background-image:
  var(--grain),                                   /* 1. grão, por cima */
  linear-gradient(158deg, #18224A, #0F1730 62%);  /* 2. volume */

/* 3. filete Areia   → ::before, 1px no topo */
/* 4. luz de canto   → ::after, com isolation:isolate + z-index:-1 */
```

---

## Regras para reusar

**1. O gradiente de superfície é incolor.** Luz e sombra, nunca matiz. Se
colorir, ele compete com vermelho de risco, verde de venda e âmbar de atenção —
que é justamente o que precisa ser visto primeiro.

**2. O dourado é racionado.** Dinheiro, meta e marca. Se todo card tiver filete
Areia, nenhum card destaca — e a peça vira o "painel gamer" que a marca evita.

**3. 158° em tudo.** O mesmo ângulo faz a peça inteira parecer iluminada pela
mesma fonte. Ângulo variado por componente é o que faz parecer colagem.

**4. Claro não é escuro invertido.** Cada receita tem valor próprio por tema.
Reaproveitar o valor do escuro no claro produz superfície morta ou tela manchada.

**5. Movimento só em `transform`**, e sempre respeitando
`prefers-reduced-motion`.

---

## Fora de tela — impressão e social

- **Grão**: em material impresso o ruído de 6% some. Subir para 10–12%, ou
  trocar por textura de papel real.
- **Aurora**: em peça estática, congelar num frame — o foco A a cerca de 30% do
  percurso é o enquadramento mais equilibrado.
- **Filete Areia**: em impressão, 1px desaparece. Usar 2–3pt.
- **Achatados**: usar sempre os valores já calculados acima onde a ferramenta
  não fizer sobreposição com alfa de forma confiável.
