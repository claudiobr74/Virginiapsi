"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RECOVERY_CONFIRMATION_MESSAGE } from "@/features/auth/messages";
import {
  recoveryRequestSchema,
  type RecoveryRequestValues,
} from "@/features/auth/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function RecoveryRequestForm() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecoveryRequestValues>({
    resolver: zodResolver(recoveryRequestSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    // Always show the same confirmation, regardless of the Supabase result,
    // so the flow never reveals whether an account exists.
    setSubmitted(true);
  });

  if (submitted) {
    return (
      <div className="flex flex-col gap-5 text-center">
        <p
          role="status"
          className="rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success"
        >
          {RECOVERY_CONFIRMATION_MESSAGE}
        </p>
        <Link
          href="/login"
          className="text-sm font-semibold text-sage-700 hover:text-primary"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          aria-invalid={Boolean(errors.email) || undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-xs text-failed">{errors.email.message}</p>
        ) : null}
      </div>

      <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
        Enviar link de recuperação
      </Button>

      <Link
        href="/login"
        className="text-center text-sm font-semibold text-sage-700 hover:text-primary"
      >
        Voltar para o login
      </Link>
    </form>
  );
}
