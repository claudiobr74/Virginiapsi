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
}

export function Sidebar({ professionalName, professionalSubtitle }: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex items-center gap-3 border-b border-border px-5 py-6">
        <Logo width={40} />
        <div className="flex flex-col leading-tight">
          <span className="font-serif text-base italic font-bold text-foreground">
            SerenaPsi
          </span>
          <span className="text-xs text-muted-foreground">{professionalName}</span>
        </div>
      </div>

      <nav
        aria-label="Navegação principal"
        className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-6"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            <p className="px-3.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t border-border px-3 py-4">
        <div className="flex items-center justify-between px-3.5 py-1">
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-foreground">
              {professionalName}
            </span>
            <span className="text-xs text-muted-foreground">
              {professionalSubtitle}
            </span>
          </div>
          <ThemeToggle />
        </div>
        <InstallAppButton className="justify-start" />
        <LockNowButton className="justify-start" />
        <LogoutButton className="justify-start" />
      </div>
    </aside>
  );
}
