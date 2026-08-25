"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function MobileTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
      <Link href="/app" className="min-w-0" aria-label="VirgíniaPsi — início">
        <Logo variant="inline" width={28} />
      </Link>
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menu"
        className="rounded-lg p-1.5 text-foreground transition-colors hover:bg-background"
      >
        <Menu className="size-5" aria-hidden />
      </button>
    </header>
  );
}
