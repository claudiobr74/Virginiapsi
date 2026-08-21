import { Building2 } from "lucide-react";
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
    return "T";
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
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex items-center gap-3 px-5 py-6">
        <Logo width={40} />
        <div className="flex flex-col leading-tight">
          <span className="font-serif text-base italic font-bold text-foreground">Tesseli</span>
          <span className="text-[11px] font-medium text-muted-foreground">Consultório Digital</span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 px-5 pb-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="size-4 shrink-0 text-sage-700" aria-hidden />
          {organizationName}
        </span>
        {canSwitchOrganization ? (
          <Link
            href="/select-organization"
            className="text-xs font-semibold text-sage-700 hover:text-primary"
          >
            Trocar consultório
          </Link>
        ) : null}
      </div>

      <nav
        aria-label="Navegação principal"
        className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-6"
      >
        {NAV_GROUPS.map((group, index) => (
          <div key={group.id} className="flex flex-col gap-1">
            {index > 0 ? <div className="mx-3 mb-3 h-px bg-border" aria-hidden /> : null}
            <p className="sr-only">{group.label}</p>
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t border-border px-3 py-4">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface font-serif text-xs font-bold text-sage-700">
              {initialsFromName(professionalName)}
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold text-foreground">
                {professionalName}
              </span>
              <span className="truncate font-mono text-[11px] text-sage-700">
                {professionalSubtitle || roleLabel}
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <InstallAppButton className="justify-start" />
        <div className="flex items-center gap-1 px-1">
          <LockNowButton className="flex-1 justify-start" />
          <LogoutButton className="flex-1 justify-start" />
        </div>
      </div>
    </aside>
  );
}
