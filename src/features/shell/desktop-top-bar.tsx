"use client";

import { Bell, FileText, Plus, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { SearchField } from "@/components/ui/search-field";
import { searchPatientsCommand } from "@/features/shell/actions";
import { ALL_NAV_ITEMS } from "@/features/shell/nav-config";
import { pageHeading } from "@/lib/brand";
import { cn } from "@/lib/utils/cn";

const QUICK_ACTIONS = [
  {
    href: "/app/agenda?new=1",
    label: "Nova consulta para paciente existente",
    icon: Plus,
  },
  {
    href: "/app/patients/new",
    label: "Cadastrar novo paciente no diretório",
    icon: UserPlus,
  },
  {
    href: "/app/documents",
    label: "Gerar novo documento ou laudo clínico",
    icon: FileText,
  },
] as const;

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<
    Array<{ id: string; name: string; code: string; href: string }>
  >([]);
  const [, startTransition] = useTransition();

  const navMatches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) {
      return ALL_NAV_ITEMS;
    }
    return ALL_NAV_ITEMS.filter((item) =>
      item.label.toLocaleLowerCase("pt-BR").includes(needle),
    );
  }, [query]);

  const actionMatches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) {
      return [...QUICK_ACTIONS];
    }
    return QUICK_ACTIONS.filter((item) =>
      item.label.toLocaleLowerCase("pt-BR").includes(needle),
    );
  }, [query]);

  function close() {
    setQuery("");
    setPatients([]);
    onOpenChange(false);
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }
    const handle = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchPatientsCommand(trimmed);
        setPatients(result);
      });
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query]);

  function go(href: string) {
    close();
    router.push(href);
  }

  const visiblePatients = query.trim().length < 2 ? [] : patients;

  return (
    <Modal open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <ModalContent title="Buscar" description="Pacientes, páginas e ações do consultório." size="md">
        <SearchField
          autoFocus
          value={query}
          onChange={setQuery}
          placeholder="Nome, código ou módulo…"
        />

        {actionMatches.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ações rápidas
            </p>
            <ul className="flex flex-col gap-1">
              {actionMatches.map((action, index) => {
                const Icon = action.icon;
                return (
                  <li key={action.href}>
                    <button
                      type="button"
                      onClick={() => go(action.href)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                        index === 0 && query.trim().length === 0
                          ? "bg-sage-light font-semibold text-sage-700"
                          : "hover:bg-sage-light",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      {action.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {visiblePatients.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pacientes
            </p>
            <ul className="flex flex-col gap-1">
              {visiblePatients.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => go(patient.href)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-sage-light"
                  >
                    <span className="font-medium text-foreground">{patient.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{patient.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Navegação
          </p>
          <ul className="flex flex-col gap-1">
            {navMatches.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => go(item.href)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-sage-light"
                  >
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </ModalContent>
    </Modal>
  );
}

export function DesktopTopBar({
  syncStatus,
  pendingCount,
}: {
  syncStatus: "connected" | "disconnected" | "error" | "unknown";
  pendingCount: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const title = pageHeading(pathname, { view: searchParams.get("view") });
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const syncLabel =
    syncStatus === "connected"
      ? "Nuvem sincronizada"
      : syncStatus === "error"
        ? "Falha na nuvem"
        : "Nuvem desconectada";

  return (
    <>
      <header className="sticky top-0 z-20 hidden h-[72px] items-center justify-between gap-4 border-b border-border bg-card px-8 lg:flex">
        <p
          suppressHydrationWarning
          className="min-w-0 truncate font-serif text-2xl font-bold text-foreground"
        >
          {title}
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-[280px] items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-left text-sm text-muted-foreground"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">Buscar paciente ou ação...</span>
            <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </button>
          <Link
            href="/app/agenda/connect"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold",
              syncStatus === "connected"
                ? "bg-sage-light text-sage-700"
                : syncStatus === "error"
                  ? "bg-failed-bg text-failed"
                  : "bg-surface text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                syncStatus === "connected" ? "bg-success" : "bg-muted-foreground",
              )}
              aria-hidden
            />
            {syncLabel}
          </Link>
          <Link
            href="/app/pendencias"
            className="relative rounded-lg p-2 text-foreground hover:bg-background"
            aria-label={
              pendingCount > 0
                ? `Pendências (${pendingCount})`
                : "Pendências"
            }
          >
            <Bell className="size-5" aria-hidden />
            {pendingCount > 0 ? (
              <span className="absolute right-1 top-1 size-2 rounded-full bg-failed" aria-hidden />
            ) : null}
          </Link>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
