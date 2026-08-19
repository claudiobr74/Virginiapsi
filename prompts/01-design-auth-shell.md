# Fase 1 — Design System, Auth e Shell

Leia `docs/02-visual-spec.md`, `docs/12-screen-fidelity-blueprint.md` e `VISUAL_MASTER_PROMPT.md` integralmente. Use `ui-fidelity`.

Implemente:
- uso do asset oficial `public/brand/Logo SerenaPsi em Gradiente Sereno(2).png` no login e shell, sem qualquer modificação do arquivo;
- tokens SerenaPsi light/dark;
- fonts Inter, Playfair Display e JetBrains Mono;
- Button, PageHeader, Modal, Drawer, StatusBadge, Input, Search, Loading, EmptyState;
- login email/senha, recuperar/redefinir senha e Google login opcional via Supabase Auth;
- inactivity lock configurável + lock manual;
- shell desktop 256px;
- top bar/bottom nav mobile;
- placeholders dos oito módulos;
- PWA básica se não prejudicar a fase.

Não implemente Calendar OAuth nesta fase.

Gate: E2E login shell + desktop/mobile + dark mode + `/visual-fidelity-check`. Pare.
