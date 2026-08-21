import { ShieldX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";

export function RestrictedAccess({
  sectionLabel,
}: {
  sectionLabel: string;
}) {
  return (
    <PageContainer>
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-failed-bg text-failed">
          <ShieldX className="size-8" aria-hidden />
        </span>
        <h1 className="mt-5 font-serif text-3xl italic font-semibold text-foreground">
          Acesso restrito
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Você não tem permissão para abrir {sectionLabel}. O perfil Secretaria
          vê a rotina administrativa do consultório; prontuário, Supervisor IA e
          configurações avançadas ficam com a psicóloga administradora.
        </p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Seu perfil atual: Secretaria
        </p>
        <Button asChild className="mt-6">
          <Link href="/app">Voltar ao Meu Dia</Link>
        </Button>
      </div>
    </PageContainer>
  );
}
