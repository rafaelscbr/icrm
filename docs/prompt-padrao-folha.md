# Prompt — aplicar o padrão "Folha" e a identidade Souza em outro sistema

Cole o texto abaixo (inteiro) no Claude Code dentro do outro sistema.

---

Quero redesenhar este sistema de ponta a ponta no padrão "Folha" da Souza
Imobiliária. Não é só trocar cor: é mudar layout, hierarquia e a forma de
mostrar informação, mantendo toda a lógica e os dados como estão.

**Antes de mexer:** leia a estrutura do projeto (stack, tema/tokens, layout,
componentes compartilhados, telas) e me mostre em poucas linhas o plano. Depois
execute em etapas, verificando cada tela no navegador nos temas claro e escuro
e em largura de celular (375px). Não invente dados, não remova funcionalidade,
não grave nada no banco para testar.

## 1. Identidade visual ("Folha Clara") — o tema CLARO é o padrão

- Fundo de página `#F3F6FB` (branco azulado), superfícies `#FFFFFF`, superfície
  secundária `#EDF1F8`, hover `#E0E7F2`.
- Texto Marinho: `#0B1A3A` (principal), `#2A3A5C`, `#44557A`, `#5D6E8E`
  (rótulos), `#A6B3CB` só decorativo. Linhas `rgba(15,39,89,.10)`.
- Barra de navegação do topo Marinho `#0F2759`, texto branco 82%, item ativo em
  pílula Champanhe com texto Marinho. Bloco-herói com
  `linear-gradient(140deg,#1A3F8F,#12306E 48%,#0C2153)`.
- Champanhe `#D6B26E` = botão principal (texto `#0B1A3A`, hover `#CBA55F`),
  pílula ativa, avatar. Ouro de texto sobre claro `#7A5A22`; ícone `#8F6B2C`.
  Dourado é raro: dinheiro, meta, ação principal, palavra de destaque.
- Semânticas: sucesso `#1F8A62`, atenção `#BD7A12`, risco `#C7474F`,
  informação `#236B73` (cada uma com fundo claro próprio). WhatsApp `#1FAE5B`.
- Tipografia: **Plus Jakarta Sans** (títulos, números grandes, 700–800,
  tracking −0.025em), **Geist** (interface e texto), **Instrument Serif
  itálica** só para a palavra de destaque, sempre dourada (`#9C7430` sobre
  claro, `#E2C385` sobre Marinho), 12% maior. Rótulos nunca em MAIÚSCULAS
  espaçadas. Números tabulares.
- Tema claro como padrão: se houver preferência salva, migre todo mundo para o
  claro uma vez (subindo a versão do estado persistido) e ajuste o script
  anti-flash. O escuro continua disponível no botão.
- Defina tudo como tokens CSS (variáveis) num lugar só; nada de cor solta em
  componente.

## 2. Princípios de layout ("Folha")

1. **O que importa em destaque, o resto pequeno.** Cada tela responde primeiro
   à pergunta principal dela. Números-chave numa **faixa** de até 4 valores com
   filete fino entre eles — não em cartões soltos.
2. **Topo de tela em UMA linha:** título (17–19px) + abas inline + uma ação
   principal. Nada de cabeçalho empilhado com ícone, subtítulo e faixa.
3. **Sem caixa dentro de caixa.** Separe por espaço e por tom de fundo. Borda
   só onde ela identifica um objeto.
4. **Listas em linhas, não cards.** Nome em negrito, uma linha de metadados
   abaixo, números alinhados à direita, ações aparecem no hover. No celular a
   linha inteira é o toque (seta no fim).
5. **Filtros numa linha só** (busca + atalhos + seletor segmentado).
6. **Formulários "folha limpa":** campo sem borda (fundo `#EEF2F8`, foco com
   borda azul `#2563EB` e halo), rótulo pequeno em cima, o campo principal é o
   título do formulário (22px, sem caixa), escolhas em pílulas, detalhes
   opcionais recolhidos em "+ Mais detalhes", botão com carregamento, pergunta
   antes de descartar o que foi digitado.
7. **Fichas orientadas à ação** (toda tela de detalhe) respondem três perguntas
   nesta ordem:
   - *Quem é* — nome grande (26–28px) como título, uma linha de dados.
   - *Em que pé está* — régua de pontos/etapas na cor da etapa atual.
   - *O que fazer agora* — UM bloco com fundo levemente tingido, filete de 3px
     à esquerda na cor do momento (risco/atenção/sucesso/neutro), a frase da
     próxima ação e os botões que a executam ali dentro.
   O resto (perfil, histórico, listas) em abas.
8. **A palavra de destaque:** em títulos de seção, saudações e estados vazios,
   UMA palavra em Instrument Serif itálica dourada ("Prioridades de *hoje*",
   "Bom *dia*, Rafael", "Nenhuma *venda* no período"). Crie um componente
   `<Destaque>` e um marcador `*palavra*` nos títulos.
9. **Cor com significado:** uma cor por área só no sublinhado da aba ativa;
   etapas com cor própria; semânticas só onde há estado; cor nunca sozinha
   (sempre com texto ou ícone).
10. **Celular:** barra de baixo com no máximo 4 destinos (os 3 mais usados +
    "Mais" abrindo uma folha de baixo com criar, telas em grade, tema e conta);
    busca e avisos no topo de cada tela; alvos ≥ 44px; nada de rolagem lateral.
11. **Login** segue o tema: painel de marca Marinho com uma frase de destaque e
    o formulário na folha clara.
12. **Dados:** o banco é a fonte da verdade — a tela só muda depois que o
    banco confirma; erro sempre visível; nada de atualização otimista.

## 3. Como entregar

- Faça em etapas (tokens/tema → layout global → listas → formulários → fichas
  → celular → login), conferindo cada etapa no navegador.
- Registre as decisões num `docs/` e me mostre um antes e depois das telas
  principais.
- Ao final: testes e build passando, e um resumo do que mudou e do que não deu
  para conferir.
