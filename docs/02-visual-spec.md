# SerenaPsi — Especificação de Identidade Visual

## Intenção

A interface deve parecer um consultório digital acolhedor: calma, humana, sofisticada, com baixo ruído visual. Evitar estética “SaaS azul genérico”, excesso de gradientes, cards compactos ou dashboard corporativo agressivo.

## Tipografia

- Sans UI: **Inter** — 300 a 800.
- Serif editorial: **Playfair Display** — usada principalmente em títulos, frequentemente itálica e bold.
- Mono: **JetBrains Mono** — horários, CRP/códigos e dados que se beneficiem de alinhamento.

## Paleta light

### Base warm/bone

- background principal: `#FAF9F6`
- superfície secundária: `#E8E4DF`
- borda suave: `#DCD8D3`

### Sage / primary

- sage light: `#B7B7A4`
- sage: `#A5A58D`
- mid neutral sage: `#8B8B88`
- sage 600: `#7A7F6B`
- sage 700: `#737864`
- **primary sage 800: `#6B705C`**
- deep neutral: `#4A4A48`
- texto principal: `#3D3D3C`

### Warm accent

- cream amber: `#FFF9F2`
- soft amber: `#FDEBD0`
- accent: `#D4A373`

Cores semânticas podem usar vermelho, azul e âmbar para erro/confirmado/atenção, mas não devem dominar o produto.

## Paleta dark

- background: `#131412`
- card: `#1C1D1A`
- input/superfície: `#171816`
- border: `#2B2D28`
- text: `#F4F7EE`
- text secondary: `#E2E3CE`
- sage inverso: `#CFD0B9`

## Formas

- cards principais: radius ~24 px (`rounded-3xl`)
- modais: 24 px no desktop; fullscreen adequado no mobile
- botões: 12–16 px de radius
- badges: 12 px / pill quando status
- logo/avatar: 12 px ou circular conforme contexto
- sombras: discretas; card normal `shadow-sm`, modal `shadow-2xl`

## Shell desktop

- sidebar 256 px;
- fundo branco/card;
- borda direita sage muito suave;
- logo + SerenaPsi + profissional no topo;
- navegação em três grupos: rotina, IA/conhecimento, sistema;
- item ativo: fundo `#6B705C`, texto branco;
- item inativo: sage escuro, hover bone;
- perfil, CRP, instalar app, bloquear tela e logout no rodapé.

## Shell mobile

### Top bar

- sage escuro;
- logo pequeno;
- “SerenaPsi” em Inter extra-bold;
- badge “Ativo” discreto;
- botão menu.

### Bottom navigation

- superfície branca translúcida / dark equivalente;
- backdrop blur;
- Meu Dia, Agenda, Pacientes, Mais;
- ícones Lucide;
- item ativo sage e bold.

## Page Header

Card amplo com:

- ícone branco sobre quadrado sage;
- título `Playfair Display`, italic, bold, 20–24 px;
- subtítulo Inter 12–14 px;
- ações à direita no desktop e abaixo no mobile;
- fundo branco/dark card;
- border suave + shadow-sm.

## Biblioteca de Componentes Canônica — obrigatória

Esta seção é normativa, não descritiva: define os primitivos de UI que existem exatamente uma vez no projeto, e a regra de que nenhuma tela pode reimplementar o próprio modal, drawer, estado vazio, estado de carregamento, busca ou confirmação.

### Lista canônica (Fase 1, `src/components/ui/`)

| Componente | Cobre | Nunca reimplementar em tela |
|---|---|---|
| `PageContainer` | largura máxima e padding de página | max-width inline por tela |
| `PageHeader` | cabeçalho de página conforme seção acima | header custom por tela |
| `SectionHeader` | título de subseção dentro de página | `<h2>` solto com classes repetidas |
| `Modal` | modal centralizado, conforme especificação de Modal acima | overlay + card feito à mão em tela |
| `Drawer` | painel lateral, conforme especificação de Drawer acima | drawer feito à mão em tela |
| `EmptyState` | estado vazio, com ícone + mensagem + ação opcional | `<p>Nenhum X ainda</p>` solto |
| `LoadingState` | carregamento em bloco/página | spinner com tamanho/cor inventados por tela |
| `SearchField` | campo de busca com ícone e clear | `<input>` de busca solto |
| `ConfirmDialog` | confirmação destrutiva (excluir, cancelar, estornar) | `window.confirm` ou modal de confirmação próprio |
| `StatusBadge` | badge de status, cores conforme seção Status acima | badge com classes de cor hardcoded por tela |
| `Button` | primary / secondary / destructive / ghost, conforme seção acima | `<button>` com classes de estilo completo repetidas |

### Regra de enforcement

- Toda tela nova consome estes componentes; não os recria com Tailwind solto, mesmo que o resultado visual pareça idêntico.
- Se uma tela precisar de uma variação genuína (não coberta pela prop da API atual), a extensão é uma prop nova no componente canônico, nunca uma cópia local do componente.
- PR que introduz modal, drawer, empty state, loading state, campo de busca ou confirmação sem usar o primitivo correspondente falha revisão, independente de estar visualmente correto.
- Gate da Fase 1: os onze componentes acima existem, têm Storybook ou página de referência mínima, e cobrem os estados de todas as variantes desta especificação (Status, Botão, Modal, Drawer) antes de qualquer outra fase começar a consumi-los.

### Botão primary

- fundo `#6B705C`;
- texto branco;
- bold;
- hover um tom mais escuro;
- active scale 0.98;
- disabled com opacidade reduzida.

### Botão secondary

- bone/sage light;
- texto sage deep;
- border sutil.

### Modal

- backdrop slate/black ~50% + blur;
- entrada opacity + scale 0.95 + y 10;
- header com título serif italic;
- body Inter;
- footer bone translúcido.

### Drawer

- lateral direita por padrão;
- animação spring sutil;
- largura ~420 px no desktop;
- fullscreen no mobile quando necessário.

### Inputs

- background branco/light ou `#171816` dark;
- border suave;
- focus sage;
- labels 11–12 px bold;
- placeholders discretos.

### Status

- Ativo: sage/verde com ponto pulsante;
- Pendente: amber/clock;
- Concluído: sage strong/check;
- Confirmado: blue/check;
- Falhou: red;
- Cancelado: gray;
- Informação: sky;
- Atenção: amber.

## Movimento

- transição entre módulos: opacity 0→1 e y 15→0, ~220 ms;
- fade-in de elementos: ~250 ms;
- scale-up de modais: ~300 ms;
- animação nunca deve chamar mais atenção que o conteúdo.

## Login

- fundo bone;
- blobs grandes, muito suaves e desfocados em sage/teal;
- card central max ~448 px, branco, rounded-3xl, shadow-xl;
- logo grande;
- texto de acolhimento;
- campos e-mail/senha;
- primary button “Entrar”;
- divisor “ou”;
- botão Google branco com ícone oficial;
- avisos de segurança em cards suaves.

## Logo — asset oficial

O arquivo oficial da marca é:

`public/brand/Logo SerenaPsi em Gradiente Sereno(2).png`

Esse arquivo deve ser usado **exatamente como fornecido**. Ele é a fonte de verdade para símbolo, wordmark, tipografia, cores, gradientes, fundo, proporções e espaçamento da marca.

É proibido:
- redesenhar ou gerar uma nova logo a partir de descrição textual;
- converter para SVG ou vetorizar;
- remover ou substituir o fundo;
- recortar a arte;
- recolorir ou adaptar para dark mode;
- alterar símbolo ou wordmark;
- aplicar filtros, sombras, bordas ou efeitos à própria imagem;
- comprimir ou reprocessar de modo destrutivo.

Na interface, apenas o **container de exibição** pode ser redimensionado. Preserve a razão de aspecto, use `object-fit: contain` e mantenha a imagem íntegra.

## Critério de fidelidade

Antes de aceitar uma tela, o agente de UI deve responder:

1. O layout preserva a hierarquia SerenaPsi?
2. Usa a paleta e tipografia acima?
3. Parece acolhedor e leve, não “dashboard genérico”?
4. Funciona em desktop e mobile sem mudar a identidade?
5. A ação principal é evidente e há poucos cliques?
