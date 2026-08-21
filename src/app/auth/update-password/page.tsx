import type { Metadata } from "next";
import { Logo } from "@/components/ui/logo";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha — Tesseli",
};

export default function UpdatePasswordPage() {
  return (
    <AuthScreen>
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo width={160} priority />
        <h1 className="mt-4 font-serif text-[28px] italic font-medium leading-tight text-foreground">
          Definir nova senha
        </h1>
        <p className="text-sm text-muted-foreground">Escolha uma senha nova para continuar.</p>
      </div>
      <div className="mt-8">
        <UpdatePasswordForm />
      </div>
    </AuthScreen>
  );
}
