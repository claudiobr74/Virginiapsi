"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bootstrapOrganizationAction,
  type ActionState,
} from "@/features/organizations/actions";

const initialState: ActionState = {};

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(
    bootstrapOrganizationAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome do consultório</Label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={160}
          placeholder="Consultório Serena"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="professionalName">Nome da profissional (opcional)</Label>
        <Input
          id="professionalName"
          name="professionalName"
          maxLength={160}
          placeholder="Ana Serena"
        />
      </div>

      <Button type="submit" size="lg" isLoading={isPending} className="w-full">
        Criar consultório
      </Button>
    </form>
  );
}
