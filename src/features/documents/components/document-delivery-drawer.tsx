"use client";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { DELIVERY_METHOD_VALUES, type DocumentDeliveryRow } from "@/features/documents/contracts";

export type DeliveryFormState = {
  recipientName: string;
  deliveredAt: string;
  method: (typeof DELIVERY_METHOD_VALUES)[number];
  receiptConfirmed: boolean;
  devolutionDone: boolean;
  notes: string;
};

export function DocumentDeliveryDrawer({
  open,
  onOpenChange,
  delivery,
  onChange,
  deliveries,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: DeliveryFormState;
  onChange: (patch: Partial<DeliveryFormState>) => void;
  deliveries: DocumentDeliveryRow[];
  isPending: boolean;
  onSubmit: () => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title="Registrar entrega"
        tone="documents"
        footer={
          <Button type="button" size="sm" isLoading={isPending} onClick={onSubmit}>
            Registrar entrega
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs">
            Destinatário
            <input
              required
              placeholder="Destinatário"
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              value={delivery.recipientName}
              onChange={(event) => onChange({ recipientName: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Data
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              value={delivery.deliveredAt}
              onChange={(event) => onChange({ deliveredAt: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Método
            <select
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              value={delivery.method}
              onChange={(event) =>
                onChange({ method: event.target.value as DeliveryFormState["method"] })
              }
            >
              {DELIVERY_METHOD_VALUES.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <label className="flex gap-2 text-xs">
            <input
              type="checkbox"
              checked={delivery.receiptConfirmed}
              onChange={(event) => onChange({ receiptConfirmed: event.target.checked })}
            />
            Recebimento confirmado
          </label>
          <label className="flex gap-2 text-xs">
            <input
              type="checkbox"
              checked={delivery.devolutionDone}
              onChange={(event) => onChange({ devolutionDone: event.target.checked })}
            />
            Devolutiva realizada
          </label>
          <textarea
            className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
            placeholder="Observação"
            value={delivery.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
          />
          {deliveries.length > 0 ? (
            <ul className="text-xs text-muted-foreground">
              {deliveries.map((item) => (
                <li key={item.id}>
                  {item.recipient_name} · {item.method} · {new Date(item.delivered_at).toLocaleString("pt-BR")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
