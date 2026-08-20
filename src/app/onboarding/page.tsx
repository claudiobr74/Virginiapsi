import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { OnboardingForm } from "@/features/organizations/components/onboarding-form";
import { listActiveMemberships } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Criar consultório — SerenaPsi",
};

export default async function OnboardingPage() {
  await requireUser();
  const memberships = await listActiveMemberships();

  if (memberships.length > 0) {
    redirect("/app");
  }

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
            Vamos criar seu consultório
          </h1>
          <p className="text-sm text-muted-foreground">
            Você será a psicóloga administradora, com acesso completo aos dados
            clínicos e à equipe.
          </p>
        </div>

        <div className="mt-8">
          <OnboardingForm />
        </div>
      </div>
    </main>
  );
}
