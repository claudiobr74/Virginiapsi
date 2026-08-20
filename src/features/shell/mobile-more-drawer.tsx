"use client";

import { Building2 } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { InstallAppButton } from "@/features/shell/install-app-button";
import { LockNowButton } from "@/features/shell/lock-now-button";
import { MOBILE_MORE_NAV } from "@/features/shell/nav-config";
import { NavLink } from "@/features/shell/nav-link";

export interface MobileMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionalName: string;
  organizationName: string;
  roleLabel: string;
  canSwitchOrganization: boolean;
}

export function MobileMoreDrawer({
  open,
  onOpenChange,
  professionalName,
  organizationName,
  roleLabel,
  canSwitchOrganization,
}: MobileMoreDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent title="Mais" description={professionalName}>
        <div className="mb-5 flex flex-col gap-1 rounded-2xl border border-border bg-cream/60 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Building2 className="size-4 shrink-0 text-sage-700" aria-hidden />
            {organizationName}
          </span>
          <span className="text-xs text-muted-foreground">{roleLabel}</span>
          {canSwitchOrganization ? (
            <Link
              href="/select-organization"
              onClick={() => onOpenChange(false)}
              className="mt-1 text-xs font-semibold text-sage-700 hover:text-primary"
            >
              Trocar consultório
            </Link>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          {MOBILE_MORE_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              onNavigate={() => onOpenChange(false)}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-foreground">Tema</span>
            <ThemeToggle />
          </div>
          <InstallAppButton className="justify-start" />
          {/*
            The lock screen renders inline (not portaled) inside this same
            drawer subtree, so the drawer must close first or its own
            fixed/portaled content can end up visually stacked over the
            lock screen. Logout's confirm dialog is a Radix portal and
            stacks correctly on its own, so it does not need this.
          */}
          <div onClickCapture={() => onOpenChange(false)}>
            <LockNowButton className="w-full justify-start" />
          </div>
          <LogoutButton className="justify-start" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
