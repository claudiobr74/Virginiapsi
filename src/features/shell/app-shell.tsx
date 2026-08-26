"use client";

import { Suspense, useState, type ReactNode } from "react";
import { LockProvider } from "@/features/shell/lock/lock-context";
import { DesktopTopBar } from "@/features/shell/desktop-top-bar";
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
  syncStatus?: "connected" | "disconnected" | "error" | "unknown";
  pendingCount?: number;
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
  syncStatus = "unknown",
  pendingCount = 0,
}: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <LockProvider
      userEmail={userEmail}
      timeoutMinutes={inactivityTimeoutMinutes}
    >
      <div className="flex min-h-screen bg-background">
        <a href="#conteudo-principal" className="skip-link">
          Ir para o conteúdo principal
        </a>
        <Sidebar
          professionalName={professionalName}
          professionalSubtitle={professionalSubtitle}
          organizationName={organizationName}
          roleLabel={roleLabel}
          canSwitchOrganization={canSwitchOrganization}
        />

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <MobileTopBar onMenuClick={() => setMoreOpen(true)} />
          <Suspense
            fallback={
              <header className="sticky top-0 z-20 hidden h-[72px] border-b border-border bg-card lg:block" />
            }
          >
            <DesktopTopBar syncStatus={syncStatus} pendingCount={pendingCount} />
          </Suspense>
          <main id="conteudo-principal" tabIndex={-1} className="flex-1 pb-20 lg:pb-0">
            {children}
          </main>
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
