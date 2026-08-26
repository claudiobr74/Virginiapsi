"use client";

import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCollectionAction } from "@/features/knowledge/actions";
import type { KnowledgeCollectionRow } from "@/features/knowledge/contracts";
import { cn } from "@/lib/utils/cn";

export function CollectionsPanel({
  collections,
  selectedCollectionIds,
  onToggle,
}: {
  collections: KnowledgeCollectionRow[];
  selectedCollectionIds: string[];
  onToggle: (id: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCollectionAction({ name });
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma coleção ainda.</p>
        ) : (
          collections.map((collection) => {
            const selected = selectedCollectionIds.includes(collection.id);
            return (
              <label
                key={collection.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm transition-colors",
                  selected
                    ? "border-primary bg-sage-light/25 font-semibold"
                    : "border-border bg-surface/40 hover:bg-surface",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggle(collection.id)}
                />
                {collection.name}
              </label>
            );
          })
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Nova coleção"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          isLoading={isPending}
          disabled={!name.trim()}
          onClick={submit}
        >
          <FolderPlus className="size-4" aria-hidden />
          Criar coleção
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-failed">
          {error}
        </p>
      ) : null}
    </div>
  );
}
