import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { OrganizationPicker } from "@/features/organizations/components/organization-picker";
import { listActiveMemberships } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Escolher consultório — Tesseli",
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
        className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-sage/30 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-xl sm:p-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo width={140} priority />
          <h1 className="font-serif text-2xl italic font-bold text-foreground">
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
