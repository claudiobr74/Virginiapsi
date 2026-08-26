"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer narrow>
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar esta página"
        description="Tente novamente. Se o problema continuar, volte ao início e abra o módulo outra vez."
        action={
          <Button type="button" onClick={() => reset()}>
            Tentar novamente
          </Button>
        }
      />
    </PageContainer>
  );
}
