import type { ReactNode } from "react";

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-sage/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 size-[28rem] rounded-full bg-accent/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 size-72 -translate-x-1/2 rounded-full bg-sage-light/25 blur-3xl"
      />
      <div className="relative z-10 w-full max-w-[448px] rounded-3xl border border-border bg-card px-8 pb-10 pt-12 shadow-[0_8px_24px_rgba(0,0,0,0.04)] sm:px-10">
        {children}
      </div>
    </main>
  );
}
