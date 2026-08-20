// Deliberately no <AppShell>: docs/12-screen-fidelity-blueprint.md §9 "Rota
// dedicada, sem sidebar normal" — the active clinical session is a
// distraction-free surface, not a page inside the normal app chrome.
export default function SessionLayout({ children }: LayoutProps<"/session/[sessionId]">) {
  return children;
}
