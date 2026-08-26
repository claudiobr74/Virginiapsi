"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import "./globals.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-full bg-background font-sans text-foreground">
        <PageContainer narrow>
          <EmptyState
            icon={AlertTriangle}
            title="O VirgíniaPsi encontrou um erro inesperado"
            description="Nenhum dado clínico foi exibido aqui. Tente recarregar. Se persistir, saia e entre novamente."
            action={
              <Button type="button" onClick={() => reset()}>
                Recarregar
              </Button>
            }
          />
        </PageContainer>
      </body>
    </html>
  );
}
