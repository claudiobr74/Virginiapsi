import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";

export default function NotFound() {
  return (
    <PageContainer narrow>
      <EmptyState
        icon={Search}
        title="Página não encontrada"
        description="Este endereço não existe no Tesseli. Volte ao início para continuar."
        action={
          <Button asChild variant="secondary">
            <Link href="/app">Ir para o início</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
