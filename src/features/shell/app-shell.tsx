"use client";

import { useState, type ReactNode } from "react";
import { LockProvider } from "@/features/shell/lock/lock-context";
import { MobileBottomNav } from "@/features/shell/mobile-bottom-nav";
import { MobileMoreDrawer } from "@/features/shell/mobile-more-drawer";
import { MobileTopBar } from "@/features/shell/mobile-top-bar";
import { Sidebar } from "@/features/shell/sidebar";

export interface AppShellProps {
  children: ReactNode;
  userEmail: string;
  professionalName: string;
  professionalSubtitle: string;
  organizationName: string;
  roleLabel: string;
  canSwitchOrganization: boolean;
  inactivityTimeoutMinutes?: number;
}

export function AppShell({
  children,
  userEmail,
  professionalName,
  professionalSubtitle,
  organizationName,
  roleLabel,
  canSwitchOrganization,
  inactivityTimeoutMinutes,
}: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <LockProvider
      userEmail={userEmail}
      timeoutMinutes={inactivityTimeoutMinutes}
    >
      <div className="flex min-h-screen bg-background">
        <Sidebar
          professionalName={professionalName}
          professionalSubtitle={professionalSubtitle}
          organizationName={organizationName}
          roleLabel={roleLabel}
          canSwitchOrganization={canSwitchOrganization}
        />

        <div className="flex min-h-screen flex-1 flex-col">
          <MobileTopBar onMenuClick={() => setMoreOpen(true)} />
          <main className="flex-1 pb-20 lg:pb-0">{children}</main>
          <MobileBottomNav onMoreClick={() => setMoreOpen(true)} />
        </div>
      </div>

      <MobileMoreDrawer
        open={moreOpen}
        onOpenChange={setMoreOpen}
        professionalName={professionalName}
        organizationName={organizationName}
        roleLabel={roleLabel}
        canSwitchOrganization={canSwitchOrganization}
      />
    </LockProvider>
  );
}
