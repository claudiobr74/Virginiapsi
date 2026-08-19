import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/ui/logo";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Entrar — SerenaPsi",
};

export default function LoginPage() {
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

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl sm:p-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo width={168} priority />
          <h1 className="font-serif text-2xl italic font-bold text-foreground">
            Bem-vinda de volta
          </h1>
          <p className="text-sm text-muted-foreground">
            Entre para continuar cuidando do seu consultório com serenidade.
          </p>
        </div>

        <div className="mt-8">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-8 text-center text-[11px] leading-5 text-muted-foreground">
          Seus dados são protegidos conforme a LGPD. O acesso a informações
          clínicas é restrito e auditado.
        </p>
      </div>
    </main>
  );
}
