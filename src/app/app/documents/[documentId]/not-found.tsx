import { FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";

export default function DocumentNotFound() {
  return (
    <PageContainer>
      <EmptyState
        icon={FileText}
        title="Documento não encontrado"
        description="Este documento não existe ou você não tem permissão para vê-lo."
        action={
          <Button asChild variant="secondary">
            <Link href="/app/documents">Voltar aos documentos</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
