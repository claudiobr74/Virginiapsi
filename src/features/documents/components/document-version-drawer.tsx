"use client";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { DocumentVersionRow } from "@/features/documents/contracts";

export function DocumentVersionDrawer({
  open,
  onOpenChange,
  versions,
  compareId,
  onCompare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: DocumentVersionRow[];
  compareId: string;
  onCompare: (id: string) => void;
}) {
  const compareVersion = versions.find((version) => version.id === compareId) ?? null;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent title="Histórico de versões" tone="documents" className="sm:max-w-lg">
        <ul className="flex flex-col gap-1 text-sm">
          {versions.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                className="text-left text-primary"
                onClick={() => onCompare(version.id)}
              >
                v{version.version} · {new Date(version.created_at).toLocaleString("pt-BR")}
              </button>
            </li>
          ))}
        </ul>
        {compareVersion ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface p-3 text-xs">
            <p className="font-semibold">Comparar com v{compareVersion.version}</p>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">{compareVersion.body_snapshot}</pre>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
