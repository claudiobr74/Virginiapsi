import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui/logo";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { InstallAppButton } from "@/features/shell/install-app-button";
import { LockNowButton } from "@/features/shell/lock-now-button";
import { NAV_GROUPS } from "@/features/shell/nav-config";
import { NavLink } from "@/features/shell/nav-link";

export interface SidebarProps {
  professionalName: string;
  professionalSubtitle: string;
  organizationName: string;
  roleLabel: string;
  canSwitchOrganization: boolean;
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "V";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function Sidebar({
  professionalName,
  professionalSubtitle,
  organizationName,
  roleLabel,
  canSwitchOrganization,
}: SidebarProps) {
  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="px-6 pb-2 pt-6">
        <Link href="/app" className="inline-flex" aria-label="VirgíniaPsi — início">
          <Logo variant="inline" width={32} />
        </Link>
      </div>

      <nav
        aria-label="Navegação principal"
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-6"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            <p className="sr-only">{group.label}</p>
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} tone="sidebar" />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-soft-amber font-serif text-xs font-bold text-accent">
              {initialsFromName(professionalName)}
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold text-foreground">
                {professionalName}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {roleLabel}
                {organizationName ? ` · ${organizationName}` : professionalSubtitle ? ` · ${professionalSubtitle}` : ""}
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
        {canSwitchOrganization ? (
          <Link
            href="/select-organization"
            className="text-xs font-semibold text-sage-700 hover:text-primary"
          >
            Trocar consultório
          </Link>
        ) : null}
        <InstallAppButton className="justify-start" />
        <div className="flex items-center gap-1">
          <LockNowButton className="flex-1 justify-start" />
          <LogoutButton className="flex-1 justify-start" />
        </div>
      </div>
    </aside>
  );
}
