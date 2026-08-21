"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
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
import { cn } from "@/lib/utils/cn";

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
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {visibleError ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {visibleError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            aria-invalid={Boolean(errors.email) || undefined}
            className="pl-11"
            {...register("email")}
          />
        </div>
        {errors.email ? (
          <p className="text-xs text-failed">{errors.email.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={Boolean(errors.password) || undefined}
              className="px-11"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? (
                <EyeOff className="size-[18px]" aria-hidden />
              ) : (
                <Eye className="size-[18px]" aria-hidden />
              )}
            </button>
          </div>
        </div>
        {errors.password ? (
          <p className="text-xs text-failed">{errors.password.message}</p>
        ) : null}
        <div className="flex justify-end">
          <Link
            href="/auth/recovery"
            className={cn(
              "text-xs font-medium text-primary underline underline-offset-2",
              "hover:text-primary-hover",
            )}
          >
            Esqueci minha senha
          </Link>
        </div>
      </div>

      <Button type="submit" size="lg" isLoading={isSubmitting} className="mt-1 w-full rounded-xl">
        Entrar
      </Button>

      <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleAuthButton />
    </form>
  );
}
