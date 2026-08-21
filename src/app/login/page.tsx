import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/ui/logo";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { LoginForm } from "@/features/auth/components/login-form";
import { oauthCodeCallbackPath } from "@/features/auth/oauth-redirect";

export const metadata: Metadata = {
  title: "Entrar — Tesseli",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const oauthCallback = oauthCodeCallbackPath(params);
  if (oauthCallback) {
    redirect(oauthCallback);
  }

  return (
    <AuthScreen>
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo width={160} priority />
        <h1 className="mt-4 font-serif text-[28px] italic font-medium leading-tight text-foreground">
          Bem-vinda ao seu consultório
        </h1>
        <p className="text-sm text-muted-foreground">Acesse sua conta para continuar</p>
      </div>

      <div className="mt-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>

      <div className="mt-8 flex flex-col gap-1 text-center text-[11px] leading-[1.4] text-muted-foreground">
        <p>Acesso protegido e auditado.</p>
        <p>Em conformidade com LGPD e CFP.</p>
      </div>
    </AuthScreen>
  );
}
