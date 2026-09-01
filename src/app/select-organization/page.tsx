import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { OrganizationPicker } from "@/features/organizations/components/organization-picker";
import { listActiveMemberships } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth/require-user";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("Escolher consultório"),
};

export const dynamic = "force-dynamic";

export default async function SelectOrganizationPage() {
  await requireUser();
  const memberships = await listActiveMemberships();

  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[calc(50%-50px)] size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sage-light/70 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-[0_16px_24px_rgba(31,36,33,0.04)] sm:p-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo variant="stacked" width={180} priority />
          <h1 className="font-serif text-2xl font-bold text-foreground">
            Escolha o consultório
          </h1>
          <p className="text-sm text-muted-foreground">
            Você tem acesso a mais de um consultório. A escolha define apenas o
            contexto de navegação — as permissões continuam sendo as do seu
            papel em cada um.
          </p>
        </div>

        <div className="mt-8">
          <OrganizationPicker memberships={memberships} />
        </div>
      </div>
    </main>
  );
}
