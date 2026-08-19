"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLock } from "@/features/shell/lock/lock-context";

export function LockNowButton({ className }: { className?: string }) {
  const { lockNow } = useLock();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      onClick={lockNow}
    >
      <Lock className="size-4" aria-hidden />
      Bloquear tela
    </Button>
  );
}
