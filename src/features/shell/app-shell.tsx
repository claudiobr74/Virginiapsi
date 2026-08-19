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
}

export function AppShell({
  children,
  userEmail,
  professionalName,
  professionalSubtitle,
}: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <LockProvider userEmail={userEmail}>
      <div className="flex min-h-screen bg-background">
        <Sidebar
          professionalName={professionalName}
          professionalSubtitle={professionalSubtitle}
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
      />
    </LockProvider>
  );
}
