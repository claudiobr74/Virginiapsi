"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleAuthButton } from "@/features/auth/components/google-auth-button";
import { AUTH_GENERIC_ERROR } from "@/features/auth/messages";
import { signupSchema, type SignupValues } from "@/features/auth/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PRODUCT_NAME } from "@/lib/brand";

export function SignupForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setInfoMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setFormError(AUTH_GENERIC_ERROR);
      return;
    }

    if (data.session) {
      router.replace("/onboarding");
      router.refresh();
      return;
    }

    setInfoMessage(
      "Se este e-mail puder ser cadastrado, você receberá a confirmação em instantes. Depois disso, entre para aceitar o convite da clínica.",
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {formError}
        </p>
      ) : null}
      {infoMessage ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          {infoMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail profissional</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="seu@email.com"
          aria-invalid={Boolean(errors.email) || undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-xs text-failed">{errors.email.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            aria-invalid={Boolean(errors.password) || undefined}
            className="pr-11"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
        {errors.password ? (
          <p className="text-xs text-failed">{errors.password.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirmar senha</Label>
        <Input
          id="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={Boolean(errors.confirmPassword) || undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className="text-xs text-failed">{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
          Criar conta no {PRODUCT_NAME}
        </Button>
        <GoogleAuthButton />
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-semibold text-sage-700 hover:text-primary">
          Entrar
        </Link>
      </p>
    </form>
  );
}
