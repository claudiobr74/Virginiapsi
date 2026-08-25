"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleAuthButton } from "@/features/auth/components/google-auth-button";
import {
  toAuthQueryErrorMessage,
  toLoginErrorMessage,
} from "@/features/auth/messages";
import { loginSchema, type LoginValues } from "@/features/auth/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PRODUCT_NAME } from "@/lib/brand";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const queryError = toAuthQueryErrorMessage(searchParams.get("error"));
  const visibleError = formError ?? queryError;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword(values);

    if (error) {
      setFormError(toLoginErrorMessage());
      return;
    }

    const next = searchParams.get("next");
    const destination = next && next.startsWith("/") ? next : "/app";
    router.replace(destination);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {visibleError ? (
        <p
          role="alert"
          className="rounded-lg border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {visibleError}
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
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Senha</Label>
          <Link
            href="/auth/recovery"
            className="text-xs font-semibold text-sage-700 hover:text-primary"
          >
            Esqueci minha senha
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
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

      <div className="flex flex-col gap-3 pt-2">
        <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
          Entrar no {PRODUCT_NAME}
        </Button>
        <GoogleAuthButton />
      </div>
    </form>
  );
}
