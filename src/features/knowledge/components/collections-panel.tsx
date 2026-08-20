"use client";

import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KnowledgeCollectionRow } from "@/features/knowledge/contracts";
import { createCollectionAction } from "@/features/knowledge/actions";

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
      <div className="flex flex-col gap-1">
        {collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma coleção ainda.</p>
        ) : (
          collections.map((collection) => (
            <label key={collection.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedCollectionIds.includes(collection.id)}
                onChange={() => onToggle(collection.id)}
              />
              {collection.name}
            </label>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Nova coleção"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-label="Criar coleção"
          isLoading={isPending}
          disabled={!name.trim()}
          onClick={submit}
        >
          <FolderPlus className="size-4" aria-hidden />
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
