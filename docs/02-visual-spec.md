# VirgíniaPsi — Especificação de Identidade Visual

## Intenção

A interface deve parecer um consultório digital acolhedor: calma, humana, sofisticada, com baixo ruído visual — **warm clinical modernism**. Evitar estética “SaaS azul genérico”, excesso de gradientes, cards compactos ou dashboard corporativo agressivo.

A marca visível do produto é **VirgíniaPsi**. O repositório e os contratos internos podem continuar usando o nome de código Tesseli.

## Tipografia

- Sans UI: **Inter** — 300 a 800.
- Serif editorial: **Playfair Display** — títulos da top bar, saudação, KPIs e headings de seção.
- Mono: **JetBrains Mono** — horários, CRP/códigos e dados que se beneficiem de alinhamento.

O arquivo Figma Serenità cita Newsreader + Instrument Sans. No produto, Playfair + Inter + JetBrains são os equivalentes canônicos.

## Paleta light

### Base warm/bone

- background principal: `#FBF9F6`
- superfície secundária: `#F3F0EA`
- card: `#FFFFFF`
- borda suave: `#EAE6DF`

### Sage / primary

- sage light / wash: `#EAEFEA`
- sage: `#C5D0C6`
- mid neutral sage: `#8A8F8A`
- sage 600: `#5D625E`
- **primary sage: `#3A4F43`**
- primary hover: `#2F4137`
- deep neutral / texto: `#1F2421`

### Warm accent

- cream: `#FBF9F6`
- soft amber: `#F8F1E9`
- accent: `#D6A374`

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

- cards principais: radius 16–20 px (`rounded-[16px]` / `rounded-[20px]`)
- modais: 24 px no desktop; fullscreen adequado no mobile
- botões: 8 px (`rounded-lg`)
- badges: 6–8 px / pill quando status
- logo/avatar: circular no perfil; mark com ratio do PNG
- sombras: discretas; card normal `shadow-card` (`0 2px 8px rgba(31, 42, 44, 0.04)`), hover clicável `shadow-card-hover`, modal `shadow-2xl`

## Shell desktop

- sidebar **260 px**, fundo branco/card;
- borda direita `#EAE6DF`;
- logo inline (mark 32 px + wordmark VirgíniaPsi);
- navegação em lista contínua: Início, Agenda, Pacientes, Sessões, Pendências, Financeiro, Conhecimento, Supervisor IA, Documentos, Indicadores, Configurações;
- item ativo: fundo sage wash `#EAEFEA`, texto `#3A4F43`, indicador vertical 3 px à esquerda;
- item inativo: texto `#1F2421`, hover bone;
- top bar 72 px: título serif da rota, busca ⌘K, “Nuvem sincronizada”, sino de pendências;
- perfil, tema, instalar app, bloquear tela e logout no rodapé da sidebar.

## Shell mobile

### Top bar

- fundo card claro;
- logo inline pequeno;
- botão menu.

### Bottom navigation

- superfície branca translúcida / dark equivalente;
- backdrop blur;
- Início, Agenda, Pacientes, Pendências;
- demais módulos no menu “Mais”;
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
| `Card` | superfície tonal Clinical Pastel (`tone`, `headed`, ícone) | `bg-[#…]` ou cards coloridos locais por tela |

### Clinical Pastel (V2)

A função do bloco define a família de cor. Tokens centrais em `src/app/globals.css`:

- Agenda / sessões: `--tone-agenda-*` (sage pastel)
- Clínico: `--tone-clinical-*` (lavender)
- Financeiro: `--tone-finance-*` (peach)
- Tarefas: `--tone-tasks-*` (amber)
- Documentos: `--tone-documents-*` (mist)
- Conhecimento / IA: `--tone-knowledge-*` (teal)
- Configurações: `--tone-settings-*` (sand)

Tons aceitáveis em `Card` / `DashboardWidget`: `neutral | agenda | clinical | finance | tasks | documents | knowledge | settings`.

Não usar verde `#34A853`, azul `#1A73E8` ou vermelho `#D93025` como decoração fora da Agenda V2. Essas cores permanecem semântica operacional de status.

Sombra padrão: `--elevation-card`. Hover clicável: `--elevation-card-hover` + `translateY(-1px)`, respeitando `prefers-reduced-motion`.

### Regra de enforcement

- Toda tela nova consome estes componentes; não os recria com Tailwind solto, mesmo que o resultado visual pareça idêntico.
- Se uma tela precisar de uma variação genuína (não coberta pela prop da API atual), a extensão é uma prop nova no componente canônico, nunca uma cópia local do componente.
- PR que introduz modal, drawer, empty state, loading state, campo de busca ou confirmação sem usar o primitivo correspondente falha revisão, independente de estar visualmente correto.
- Gate da Fase 1: os primitivos acima existem, têm página de referência mínima em `/design-system`, e cobrem os estados de todas as variantes desta especificação (Status, Botão, Modal, Drawer) antes de qualquer outra fase começar a consumi-los.

### Botão primary

- fundo `#3A4F43`;
- texto `#FBF9F6`;
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
- primary button “Entrar no VirgíniaPsi”;
- botão Google branco com ícone oficial (sem divisor “ou”);
- avisos de segurança em cards suaves.

## Logo — asset oficial

O arquivo oficial da marca (símbolo + wordmark **VirgíniaPsi** no mesmo PNG) é:

`public/brand/source/virginia-psi-lockup-original.png` (arquivo-fonte, byte-identical ao PNG enviado)

`public/brand/virginia-psi-lockup-transparent.png` (asset de exibição)

O lockup completo (símbolo + wordmark **VirgíniaPsi**) deve aparecer em todas as menções da logo. Não sobrepor `BrandWordmark` nem outro texto da marca.

É proibido:
- redesenhar ou gerar uma nova logo a partir de descrição textual;
- converter para SVG ou vetorizar;
- recortar, recolorir o foreground, alterar dimensões ou adaptar o desenho para dark mode;
- aplicar filtros, sombras, bordas, clip-path, `mix-blend-mode` ou placa cream no wrapper;
- apagar o arquivo-fonte arquivado.

A única alteração permitida no asset de exibição é converter o fundo off-white **conectado às bordas** para alpha 0 (flood fill determinístico). Contadores internos e cores do desenho permanecem. `LOGO_SRC` aponta para o PNG transparente.

Na interface, apenas o **container de exibição** pode ser redimensionado. Preserve a razão de aspecto, use `object-fit: contain` e mantenha a imagem íntegra.

O arquivo-fonte continua RGB opaco. O asset de exibição é RGBA, com o matte das bordas em alpha 0, para light, dark e fundos pastel sem workaround de blend.

## Critério de fidelidade

Antes de aceitar uma tela, o agente de UI deve responder:

1. O layout preserva a hierarquia Serenità / VirgíniaPsi?
2. Usa a paleta e tipografia acima?
3. Parece acolhedor e leve, não “dashboard genérico”?
4. Funciona em desktop e mobile sem mudar a identidade?
5. A ação principal é evidente e há poucos cliques?
