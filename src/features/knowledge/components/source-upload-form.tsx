"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  buildKnowledgeUploadPath,
  registerSourceAction,
} from "@/features/knowledge/actions";
import { SUPPORTED_SOURCE_MIME_TYPES } from "@/lib/knowledge/extract-text";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function SourceUploadForm({ collectionId }: { collectionId?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    if (!SUPPORTED_SOURCE_MIME_TYPES.includes(file.type as never)) {
      setError("Formato não suportado. Envie PDF, .txt ou .md.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const path = await buildKnowledgeUploadPath(file.name);
        const supabase = createSupabaseBrowserClient();
        const { error: uploadError } = await supabase.storage
          .from("knowledge-sources")
          .upload(path, file, { contentType: file.type });
        if (uploadError) {
          throw uploadError;
        }

        const sha256 = await sha256Hex(file);
        const result = await registerSourceAction({
          collectionId: collectionId ?? null,
          title: file.name.replace(/\.[^/.]+$/, ""),
          storagePath: path,
          mimeType: file.type,
          byteSize: file.size,
          sha256,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Não foi possível enviar o arquivo agora.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-5 text-center",
          dragging ? "border-primary bg-sage-light/20" : "border-border bg-surface/30",
        )}
      >
        <Upload className="size-5 text-primary" aria-hidden />
        <p className="text-sm text-foreground">Arraste PDF, .txt ou .md para o acervo</p>
        <p className="text-[11px] text-muted-foreground">
          Extração local neste consultório — sem NotebookLM e sem dado de paciente.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isLoading={isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
          Enviar fonte (PDF, .txt, .md)
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
