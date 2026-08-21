"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";

export default function AppSegmentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer narrow>
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar este módulo"
        description="A Agenda e os outros módulos do consultório continuam acessíveis pelo menu. Tente de novo ou volte ao Meu Dia."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={() => reset()}>
              Tentar novamente
            </Button>
            <Button asChild variant="secondary">
              <Link href="/app">Voltar ao Meu Dia</Link>
            </Button>
          </div>
        }
      />
    </PageContainer>
  );
}
