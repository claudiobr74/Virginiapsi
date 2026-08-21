import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { RecoveryRequestForm } from "@/features/auth/components/recovery-request-form";

export const metadata: Metadata = {
  title: "Recuperar senha — Tesseli",
};

export default function RecoveryPage() {
  return (
    <AuthScreen>
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo width={160} priority />
        <h1 className="mt-4 font-serif text-[28px] italic font-medium leading-tight text-foreground">
          Recuperar senha
        </h1>
        <p className="text-sm text-muted-foreground">
          Informe seu e-mail para receber o link de redefinição.
        </p>
      </div>
      <div className="mt-8">
        <RecoveryRequestForm />
      </div>
    </AuthScreen>
  );
}
