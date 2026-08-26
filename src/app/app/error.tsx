"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";

export default function AppSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer>
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-failed-bg text-failed">
          <AlertTriangle className="size-8" aria-hidden />
        </span>
        <h1 className="mt-5 font-serif text-3xl italic font-semibold text-foreground">
          Algo deu errado
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Não foi possível carregar os dados. Verifique a conexão e tente
          novamente. A Agenda e os outros módulos continuam no menu.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            Código: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={() => reset()}>
            Tentar novamente
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app">Voltar ao Início</Link>
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
