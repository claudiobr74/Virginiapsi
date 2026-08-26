"use client";

import { MoreHorizontal } from "lucide-react";
import { usePathname } from "next/navigation";
import { MOBILE_PRIMARY_NAV } from "@/features/shell/nav-config";
import { isNavItemActive } from "@/features/shell/nav-link";
import { MobileNavLink } from "@/features/shell/mobile-nav-link";
import { cn } from "@/lib/utils/cn";

export function MobileBottomNav({ onMoreClick }: { onMoreClick: () => void }) {
  const pathname = usePathname();
  const moreActive = MOBILE_PRIMARY_NAV.every(
    (item) => !isNavItemActive(pathname, item.href),
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      aria-label="Navegação inferior"
    >
      {MOBILE_PRIMARY_NAV.map((item) => (
        <MobileNavLink key={item.href} item={item} />
      ))}
      <button
        type="button"
        onClick={onMoreClick}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium",
          moreActive ? "font-bold text-primary" : "text-deep-neutral",
        )}
      >
        <MoreHorizontal className="size-5" aria-hidden />
        Mais
      </button>
    </nav>
  );
}
