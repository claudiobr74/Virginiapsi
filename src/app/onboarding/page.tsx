import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { Logo } from "@/components/ui/logo";
import { OnboardingForm } from "@/features/organizations/components/onboarding-form";
import {
  acceptPendingInvitations,
  getPlatformBootstrapState,
  listActiveMemberships,
} from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth/require-user";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("Consultório"),
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireUser();
  await acceptPendingInvitations();
  const memberships = await listActiveMemberships();

  if (memberships.length > 0) {
    redirect("/app");
  }

  const { isOperator, operatorsExist } = await getPlatformBootstrapState();
  const canCreateClinic = isOperator || !operatorsExist;

  return (
    <AuthScreen>
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo variant="stacked" width={220} priority />
        {canCreateClinic ? (
          <>
            <h1 className="font-serif text-2xl font-bold text-foreground">
              Vamos criar seu consultório
            </h1>
            <p className="text-sm text-muted-foreground">
              Você será a psicóloga administradora desta clínica. O prontuário
              de cada paciente fica só com a profissional responsável.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-2xl font-bold text-foreground">
              Aguardando convite
            </h1>
            <p className="text-sm text-muted-foreground">
              Sua conta está criada. Uma administradora da clínica precisa
              convidar este e-mail para você entrar no consultório. Criar uma
              clínica nova é só da operadora da plataforma.
            </p>
          </>
        )}
      </div>

      {canCreateClinic ? (
        <div className="mt-10">
          <OnboardingForm />
        </div>
      ) : null}
    </AuthScreen>
  );
}
