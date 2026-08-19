# Prompt Mestre de Fidelidade Visual — SerenaPsi

Use este prompt sempre que criar ou revisar a interface do SerenaPsi.

Você é o responsável pela fidelidade visual do SerenaPsi. Não invente uma identidade diferente e não transforme o produto em um dashboard SaaS genérico. Implemente com alta fidelidade a linguagem visual descrita em `docs/02-visual-spec.md` e `docs/12-screen-fidelity-blueprint.md`.

## Objetivo estético

O SerenaPsi deve transmitir acolhimento, serenidade, privacidade e sofisticação clínica. A interface é warm, leve e humana. O espaço vazio é parte do design. Sage green é a identidade funcional; bone/cream é o ambiente; títulos editoriais em Playfair Display criam assinatura própria. Inter é a tipografia operacional.

## Tokens obrigatórios

Light:
- background `#FAF9F6`
- surface/bone `#E8E4DF`
- border `#DCD8D3`
- sage light `#B7B7A4`
- sage `#A5A58D`
- sage 600 `#7A7F6B`
- sage 700 `#737864`
- primary `#6B705C`
- deep neutral `#4A4A48`
- text `#3D3D3C`
- warm accent `#D4A373`

Dark:
- background `#131412`
- card `#1C1D1A`
- input `#171816`
- border `#2B2D28`
- text `#F4F7EE`
- secondary `#E2E3CE`
- sage inverse `#CFD0B9`

Fonts:
- Inter: UI/body
- Playfair Display: títulos editoriais, muitas vezes italic + bold
- JetBrains Mono: horários/códigos quando útil

## Formas e interação

- cards principais ~24 px radius;
- botões 12–16 px radius;
- bordas suaves e sombras discretas;
- microanimações 220–300 ms, opacity/translate/scale leves;
- sidebar desktop 256 px;
- mobile top bar + bottom nav com Meu Dia, Agenda, Pacientes e Mais;
- PageHeader como card amplo: ícone branco em quadrado sage, título Playfair italic bold, subtítulo e ações;
- modais com backdrop escuro ~50% + blur e container `rounded-3xl`;
- drawer direito ~420 px no desktop.

## Marca

O SerenaPsi possui um único asset oficial de marca neste repositório:

`public/brand/Logo SerenaPsi em Gradiente Sereno(2).png`

Regras absolutas para a logo:
- use **esse arquivo diretamente**, sem recriar, redesenhar ou interpretar a marca;
- não converter para SVG;
- não recortar, remover o fundo, aplicar transparência, recolorir, retocar ou alterar contraste;
- não alterar tipografia, símbolo, gradiente, proporções, espaçamento interno ou composição;
- não gerar variações para dark mode; o arquivo permanece visualmente idêntico;
- para adaptar ao layout, altere somente o tamanho do elemento/container por CSS mantendo `object-fit: contain` e proporção original;
- nunca editar o arquivo original por pipeline de otimização destrutiva.

A imagem fornecida é a fonte de verdade da identidade da marca. Descrições textuais não substituem nem autorizam reinterpretar o asset.

## Regras de implementação

1. Antes de criar a tela, leia a seção equivalente em `docs/12-screen-fidelity-blueprint.md`.
2. Reuse primitives do design system; não crie tokens locais divergentes.
3. Não introduza azul como primary.
4. Não use gradientes fortes em cards/botões; gradiente é reservado à marca/blobs suaves quando apropriado.
5. Não compacte formulários clínicos/administrativos além do necessário.
6. Desktop e mobile devem parecer o mesmo produto, não dois designs distintos.
7. A Secretaria recebe uma experiência administrativa segura; não renderize conteúdo clínico e apenas esconda por CSS.
8. Toda tela deve ter loading, empty, error e success states com a mesma linguagem visual.
9. Ícones lineares simples; evitar ilustrações decorativas que competem com o conteúdo.
10. Nunca declare fidelidade sem revisar screenshots desktop/mobile.

## Definition of Done visual

Só considere uma rota pronta quando:
- a hierarquia visual corresponde ao SerenaPsi;
- todos os tokens principais vêm do design system;
- PageHeader/navigation/cards seguem a linguagem definida;
- light/dark não têm contrastes quebrados;
- mobile não tem overflow ou ações inacessíveis;
- nenhum elemento parece ter vindo de um template genérico;
- `ui-fidelity` e `/visual-fidelity-check` aprovaram a rota.
