"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { AUTH_GENERIC_ERROR } from "@/features/auth/messages";
import {
  updatePasswordSchema,
  type UpdatePasswordValues,
} from "@/features/auth/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SessionState = "checking" | "valid" | "invalid";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordValues>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setSessionState(error || !data.user ? "invalid" : "valid");
    });
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setFormError(AUTH_GENERIC_ERROR);
      return;
    }

    await supabase.auth.signOut();
    setSuccess(true);
    setTimeout(() => router.replace("/login?reset=success"), 1500);
  });

  if (sessionState === "checking") {
    return <LoadingState label="Verificando link de recuperação…" />;
  }

  if (sessionState === "invalid") {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          Este link de recuperação expirou ou já foi usado.
        </p>
        <Link
          href="/auth/recovery"
          className="text-sm font-semibold text-sage-700 hover:text-primary"
        >
          Solicitar novo link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <p
        role="status"
        className="rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-center text-sm text-success"
      >
        Senha redefinida com sucesso. Redirecionando para o login…
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={Boolean(errors.password) || undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-xs text-failed">{errors.password.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={Boolean(errors.confirmPassword) || undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className="text-xs text-failed">{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
        Redefinir senha
      </Button>
    </form>
  );
}
