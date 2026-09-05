import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { SignupForm } from "@/features/auth/components/signup-form";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("Criar conta"),
};

export default function SignupPage() {
  return (
    <AuthScreen>
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo variant="stacked" width={220} priority />
        <h1 className="font-serif text-2xl font-bold text-foreground">Criar conta</h1>
        <p className="text-sm text-muted-foreground">
          O cadastro não cria um consultório. Depois do login, você entra por
          convite da clínica ou, se for da plataforma, cria a clínica.
        </p>
      </div>

      <div className="mt-10">
        <SignupForm />
      </div>
    </AuthScreen>
  );
}
