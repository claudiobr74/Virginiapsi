import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/ui/logo";
import { AuthScreen } from "@/features/auth/components/auth-screen";
import { LoginForm } from "@/features/auth/components/login-form";
import { oauthCodeCallbackPath } from "@/features/auth/oauth-redirect";
import { pageTitle, PRODUCT_LOGIN_FOOTER, PRODUCT_LOGIN_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("Entrar"),
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const oauthCallback = oauthCodeCallbackPath(params);
  if (oauthCallback) {
    redirect(oauthCallback);
  }

  return (
    <AuthScreen>
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo variant="stacked" width={220} priority />
        <h1 className="text-sm font-normal text-muted-foreground">{PRODUCT_LOGIN_TAGLINE}</h1>
      </div>

      <div className="mt-10">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>

      <p className="mt-10 text-center text-xs leading-[1.4] text-muted-foreground">
        {PRODUCT_LOGIN_FOOTER}
      </p>
    </AuthScreen>
  );
}
