"use client";

import { FileSearch, Layers, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Modal, ModalContent, ModalTrigger } from "@/components/ui/modal";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import {
  STATUS_BADGE_STATUSES,
  StatusBadge,
  type StatusBadgeStatus,
} from "@/components/ui/status-badge";

const STATUS_LABELS: Record<StatusBadgeStatus, string> = {
  active: "Ativo",
  pending: "Pendente",
  completed: "Concluído",
  confirmed: "Confirmado",
  failed: "Falhou",
  cancelled: "Cancelado",
  info: "Informação",
  attention: "Atenção",
};

function ComponentCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
      <h3 className="font-serif text-base italic font-semibold text-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function DesignSystemPage() {
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <PageContainer>
      <PageHeader
        icon={Layers}
        title="Design System SerenaPsi"
        subtitle="Referência mínima dos onze primitivos canônicos — docs/02-visual-spec.md"
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ComponentCard title="Button">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button isLoading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
        </ComponentCard>

        <ComponentCard title="StatusBadge">
          <div className="flex flex-wrap gap-2">
            {STATUS_BADGE_STATUSES.map((status) => (
              <StatusBadge
                key={status}
                status={status}
                label={STATUS_LABELS[status]}
                pulse={status === "active"}
              />
            ))}
          </div>
        </ComponentCard>

        <ComponentCard title="SectionHeader">
          <SectionHeader
            title="Sessões de hoje"
            description="Exemplo de subtítulo de seção"
            actions={<Button size="sm">Nova sessão</Button>}
          />
        </ComponentCard>

        <ComponentCard title="SearchField">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar paciente…"
          />
        </ComponentCard>

        <ComponentCard title="EmptyState">
          <EmptyState
            icon={FileSearch}
            title="Nenhum resultado encontrado"
            description="Ajuste os filtros ou crie um novo registro."
            action={<Button size="sm">Criar novo</Button>}
          />
        </ComponentCard>

        <ComponentCard title="LoadingState">
          <LoadingState label="Carregando pacientes…" />
        </ComponentCard>

        <ComponentCard title="Modal">
          <Modal>
            <ModalTrigger asChild>
              <Button variant="secondary">Abrir modal</Button>
            </ModalTrigger>
            <ModalContent
              title="Título do modal"
              description="Backdrop com blur, header serifado e footer opcional."
              footer={
                <>
                  <Button variant="secondary">Cancelar</Button>
                  <Button>Confirmar</Button>
                </>
              }
            >
              <p>Conteúdo de exemplo do corpo do modal.</p>
            </ModalContent>
          </Modal>
        </ComponentCard>

        <ComponentCard title="Drawer">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="secondary">Abrir drawer</Button>
            </DrawerTrigger>
            <DrawerContent
              title="Detalhes"
              description="Painel lateral direito, largura ~420px no desktop."
            >
              <p>Conteúdo de exemplo do drawer.</p>
            </DrawerContent>
          </Drawer>
        </ComponentCard>

        <ComponentCard title="ConfirmDialog">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" aria-hidden />
            Excluir registro
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Excluir registro?"
            description="Esta ação não pode ser desfeita."
            confirmLabel="Excluir"
            onConfirm={() => setConfirmOpen(false)}
          />
        </ComponentCard>

        <ComponentCard title="PageContainer / PageHeader">
          <p className="text-sm text-muted-foreground">
            Esta própria página usa <code>PageContainer</code> como wrapper e{" "}
            <code>PageHeader</code> no topo — ver código-fonte.
          </p>
        </ComponentCard>
      </div>
    </PageContainer>
  );
}
