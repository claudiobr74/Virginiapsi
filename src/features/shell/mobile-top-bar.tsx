"use client";

import { Menu } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { StatusBadge } from "@/components/ui/status-badge";

export function MobileTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground lg:hidden">
      <div className="flex items-center gap-2">
        <Logo
          width={28}
          className="brightness-0 invert dark:brightness-100 dark:invert-0"
        />
        <span className="text-sm font-extrabold tracking-tight">SerenaPsi</span>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge
          status="active"
          label="Ativo"
          pulse
          className="bg-white/15 text-white"
        />
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="rounded-full p-1.5 transition-colors hover:bg-white/15"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>
    </header>
  );
}
