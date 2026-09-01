"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";

export function DocumentMoreMenu({
  open,
  onOpenChange,
  canCancel,
  canSaveTemplate = false,
  onVersions,
  onDuplicate,
  onSaveTemplate,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCancel: boolean;
  canSaveTemplate?: boolean;
  onVersions: () => void;
  onDuplicate: () => void;
  onSaveTemplate: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label="Mais"
        aria-expanded={open}
        onClick={() => onOpenChange(true)}
      >
        <MoreHorizontal className="size-4" aria-hidden />
        Mais
      </Button>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent title="Mais" size="sm">
          <div className="flex flex-col gap-2">
            <Button type="button" variant="secondary" onClick={onVersions}>
              Histórico de versões
            </Button>
            <Button type="button" variant="secondary" onClick={onDuplicate}>
              Duplicar documento
            </Button>
            {canSaveTemplate ? (
              <Button type="button" variant="secondary" onClick={onSaveTemplate}>
                Salvar como modelo
              </Button>
            ) : null}
            {canCancel ? (
              <Button type="button" variant="destructive" onClick={onCancel}>
                Cancelar documento
              </Button>
            ) : null}
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}
