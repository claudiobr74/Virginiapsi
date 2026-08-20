import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";
import { RecoveryRequestForm } from "@/features/auth/components/recovery-request-form";

export const metadata: Metadata = {
  title: "Recuperar senha — Tesseli",
};

export default function RecoveryPage() {
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

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl sm:p-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo width={140} priority />
          <h1 className="font-serif text-2xl italic font-bold text-foreground">
            Recuperar senha
          </h1>
          <p className="text-sm text-muted-foreground">
            Informe seu e-mail para receber o link de redefinição de senha.
          </p>
        </div>

        <div className="mt-8">
          <RecoveryRequestForm />
        </div>
      </div>
    </main>
  );
}
