"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { toLoginErrorMessage } from "@/features/auth/messages";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const unlockSchema = z.object({
  password: z.string().min(1, "Informe sua senha."),
});

type UnlockValues = z.infer<typeof unlockSchema>;

export interface LockScreenProps {
  userEmail: string;
  onUnlock: () => void;
}

export function LockScreen({ userEmail, onUnlock }: LockScreenProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setFocus,
  } = useForm<UnlockValues>({
    resolver: zodResolver(unlockSchema),
    defaultValues: { password: "" },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password,
    });

    if (error) {
      setFormError(toLoginErrorMessage());
      setFocus("password");
      return;
    }

    onUnlock();
  });

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tela bloqueada"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 px-4 backdrop-blur-md"
    >
      <div className="w-full max-w-[480px] rounded-3xl border border-border bg-card p-8 text-center shadow-2xl sm:p-10">
        <div className="flex flex-col items-center gap-3">
          <Logo width={200} />
          <span className="flex size-11 items-center justify-center rounded-2xl bg-surface text-sage-700">
            <Lock className="size-5" aria-hidden />
          </span>
          <h1 className="font-serif text-[28px] italic font-medium text-foreground">
            Tela bloqueada
          </h1>
          <p className="text-sm text-muted-foreground">Sessão protegida por LGPD</p>
          <p className="font-mono text-xs text-sage-700">{userEmail}</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
          {formError ? (
            <p
              role="alert"
              className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
            >
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5 text-left">
            <Label htmlFor="lock-password">Senha</Label>
            <Input
              id="lock-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={Boolean(errors.password) || undefined}
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-failed">{errors.password.message}</p>
            ) : null}
          </div>

          <Button type="submit" size="lg" isLoading={isSubmitting} className="w-full">
            Desbloquear
          </Button>
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-4 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Desconectar conta
        </button>
      </div>
    </div>
  );
}
