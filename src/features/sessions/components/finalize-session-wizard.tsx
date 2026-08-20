"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalTrigger } from "@/components/ui/modal";
import { cancelSessionAction, finalizeSessionAction } from "@/features/sessions/actions";

export function FinalizeSessionWizard({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function finalize() {
    setError(null);
    startTransition(async () => {
      const result = await finalizeSessionAction(sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/app/patients`);
      router.refresh();
    });
  }

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelSessionAction(sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/app/patients`);
      router.refresh();
    });
  }

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button type="button" variant="primary" size="sm">
          Finalizar atendimento
        </Button>
      </ModalTrigger>
      <ModalContent
        title="Finalizar atendimento"
        description="Confirme antes de encerrar — esta ação não executa múltiplas operações silenciosamente."
        footer={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={isPending}
              onClick={cancel}
            >
              Cancelar sessão
            </Button>
            <Button type="button" size="sm" isLoading={isPending} onClick={finalize}>
              Apenas finalizar
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
            {error}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Agendar o próximo encontro continua na Agenda. Finalizar gera a cobrança
            da sessão de forma idempotente (ou consome o pacote ativo) quando houver
            valor padrão ou plano.
          </p>
        )}
      </ModalContent>
    </Modal>
  );
}
