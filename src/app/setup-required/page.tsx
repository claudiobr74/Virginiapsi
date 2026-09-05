import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Preparar banco — VirgíniaPsi",
};

export default function SetupRequiredPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl sm:p-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo width={200} priority />
          <h1 className="font-serif text-2xl italic font-bold text-foreground">
            O consultório ainda não tem banco
          </h1>
          <p className="text-sm text-muted-foreground">
            O login funcionou. Falta criar as tabelas do VirgíniaPsi neste projeto
            Supabase. Aplique as migrations e recarregue esta página.
          </p>
        </div>
      </div>
    </main>
  );
}
