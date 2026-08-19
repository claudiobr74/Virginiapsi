"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/features/shell/nav-config";
import { isNavItemActive } from "@/features/shell/nav-link";
import { cn } from "@/lib/utils/cn";

export function MobileNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs",
        active ? "font-bold text-primary" : "font-medium text-deep-neutral",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );
}
