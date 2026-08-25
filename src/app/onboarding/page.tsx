import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { Logo } from "@/components/ui/logo";
import { OnboardingForm } from "@/features/organizations/components/onboarding-form";
import { listActiveMemberships } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth/require-user";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("Criar consultório"),
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireUser();
  const memberships = await listActiveMemberships();

  if (memberships.length > 0) {
    redirect("/app");
  }

  return (
    <AuthScreen>
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo variant="stacked" width={120} priority />
        <h1 className="font-serif text-2xl font-bold text-foreground">
          Vamos criar seu consultório
        </h1>
        <p className="text-sm text-muted-foreground">
          Você será a psicóloga administradora, com acesso completo aos dados
          clínicos e à equipe.
        </p>
      </div>

      <div className="mt-10">
        <OnboardingForm />
      </div>
    </AuthScreen>
  );
}
