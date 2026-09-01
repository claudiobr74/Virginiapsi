"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProfessionalAvatar } from "@/features/settings/components/professional-avatar";
import {
  PROFESSIONAL_PHOTO_MAX_BYTES,
  isProfessionalPhotoMimeType,
} from "@/features/settings/professional-photo";

export function ProfessionalPhotoField({
  name,
  currentPhotoUrl,
  disabled,
  onFileChange,
  onRemove,
}: {
  name: string;
  currentPhotoUrl?: string | null;
  disabled?: boolean;
  onFileChange: (file: File) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function applyFile(file: File) {
    if (!isProfessionalPhotoMimeType(file.type)) {
      setFieldError("Use uma imagem JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > PROFESSIONAL_PHOTO_MAX_BYTES) {
      setFieldError("A foto deve ter no máximo 5 MB.");
      return;
    }
    setFieldError(null);
    setCleared(false);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    onFileChange(file);
  }

  const displayUrl = cleared ? null : previewUrl ?? currentPhotoUrl ?? null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:col-span-2">
      <ProfessionalAvatar name={name || "Profissional"} photoUrl={displayUrl} size="lg" />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">Foto profissional</p>
        <p className="text-xs text-muted-foreground">
          Aparece no Meu Dia, junto ao nome. JPEG, PNG ou WebP até 5 MB.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) applyFile(file);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="size-4" aria-hidden />
            Enviar foto
          </Button>
          {displayUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setCleared(true);
                setPreviewUrl((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return null;
                });
                onRemove();
                setFieldError(null);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Remover
            </Button>
          ) : null}
        </div>
        {fieldError ? <p className="text-xs text-failed">{fieldError}</p> : null}
      </div>
    </div>
  );
}
