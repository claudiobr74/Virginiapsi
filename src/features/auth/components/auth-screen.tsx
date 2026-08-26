import type { ReactNode } from "react";

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[calc(50%-50px)] size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sage-light/70 blur-3xl"
      />
      <div className="relative z-10 w-full max-w-[440px] rounded-3xl border border-border bg-card p-8 shadow-[0_16px_24px_rgba(31,36,33,0.04)] sm:p-12">
        {children}
      </div>
    </main>
  );
}
