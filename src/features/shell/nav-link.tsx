"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import type { NavItem } from "@/features/shell/nav-config";

export function isNavItemActive(pathname: string, href: string) {
  if (href === "/app") {
    return pathname === "/app";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({
  item,
  onNavigate,
  tone = "default",
}: {
  item: NavItem;
  onNavigate?: () => void;
  tone?: "default" | "sidebar";
}) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        tone === "sidebar"
          ? active
            ? "relative border border-transparent bg-sage-light font-semibold text-sage-700 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-full before:bg-sage-700"
            : "border border-transparent font-medium text-foreground hover:bg-background"
          : active
            ? "bg-primary font-medium text-primary-foreground shadow-sm"
            : "font-medium text-deep-neutral hover:bg-surface",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}
