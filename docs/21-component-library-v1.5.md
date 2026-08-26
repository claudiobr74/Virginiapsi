# Adição v1.5 — Biblioteca de Componentes Canônica

Não é correção de auditoria. É adição de escopo pedida pelo usuário, motivada por um achado da extração de layout do app legado (`EXTRACAO_LAYOUT_CODIGO.md` §2): o app antigo criou primitivos de UI reutilizáveis mas metade nunca foi adotada — `EmptyState` e `LoadingState` não são usados em nenhuma tela; cada uma reimplementou modal, loading e vazio à mão.

## O que mudou

- `docs/02-visual-spec.md`: nova seção normativa "Biblioteca de Componentes Canônica", com os onze primitivos obrigatórios (`PageContainer`, `PageHeader`, `SectionHeader`, `Modal`, `Drawer`, `EmptyState`, `LoadingState`, `SearchField`, `ConfirmDialog`, `StatusBadge`, `Button`) e a regra de que nenhuma tela pode recriá-los localmente.
- `.cursor/rules/02-visual-identity.mdc`: a linha vaga "use reusable primitives" virou lista nomeada + proibição explícita.
- `docs/08-implementation-phases.md`: Fase 1 agora exige os onze primitivos nomeados e páginas placeholder já consumindo-os; gate inclui verificação de que nenhuma reimplementa componente à mão.
- `docs/10-acceptance-checklist.md`: item de verificação por busca de padrão (overlay/spinner/`window.confirm` fora de `src/components/ui/`).

## Por que isso não é um P1

Não afeta segurança, RLS, LGPD nem contrato de IA — é disciplina de front-end. Não exige reexecução do `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md` inteiro. Recomendo revisão leve: confirmar que a nova seção de `docs/02` não contradiz nada em `docs/12-screen-fidelity-blueprint.md` antes da Fase 1 começar — verificado nesta sessão, sem conflito encontrado.

## Nomes propostos, não herdados do legado

Os onze nomes acima são novos (`Modal`/`Drawer` em vez de `SerenaModal`/`SerenaDrawer` do app antigo) — decisão deliberada para não carregar a API específica do app legado para o projeto novo. A Fase 1 tem liberdade para desenhar a API de props de cada primitivo do zero, desde que cubra as variantes já descritas em `docs/02-visual-spec.md`.
