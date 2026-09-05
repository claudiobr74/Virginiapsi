"use client";

import type { BrandingFormState, BrandingIdentityFallback } from "@/features/documents/branding-form";

export function BrandingVisibleInfo({
  form,
  onChange,
}: {
  form: BrandingFormState;
  fallback?: BrandingIdentityFallback;
  onChange: (patch: Partial<BrandingFormState>) => void;
}) {
  const contactOn =
    (form.showPhone || form.showEmail) &&
    (form.footerPhone || form.footerEmail || form.headerPhone || form.headerEmail);

  const options: Array<{
    id: string;
    label: string;
    checked: boolean;
    toggle: (next: boolean) => Partial<BrandingFormState>;
  }> = [
    {
      id: "professional",
      label: "Nome profissional",
      checked: form.headerProfessional,
      toggle: (next) => ({ headerProfessional: next }),
    },
    {
      id: "crp",
      label: "CRP",
      checked: form.headerCrp,
      toggle: (next) => ({ headerCrp: next }),
    },
    {
      id: "clinic",
      label: "Nome da clínica",
      checked: form.headerClinic && form.showClinicName,
      toggle: (next) => ({ headerClinic: next, showClinicName: next }),
    },
    {
      id: "contact",
      label: "Telefone/e-mail",
      checked: contactOn,
      toggle: (next) =>
        next
          ? {
              showPhone: true,
              showEmail: true,
              footerPhone: true,
              footerEmail: true,
            }
          : {
              showPhone: false,
              showEmail: false,
              headerPhone: false,
              headerEmail: false,
              footerPhone: false,
              footerEmail: false,
            },
    },
    {
      id: "city",
      label: "Cidade/UF",
      checked: form.showCity && form.footerAddress,
      toggle: (next) => ({ showCity: next, footerAddress: next }),
    },
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Informações exibidas</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Escolha os dados profissionais que aparecem nos documentos.
      </p>
      <div className="mt-3 flex flex-col gap-1">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-11 items-center gap-3 rounded-xl px-1 text-sm text-foreground"
          >
            <input
              type="checkbox"
              className="size-4 accent-sage-700"
              checked={option.checked}
              onChange={(event) => onChange(option.toggle(event.target.checked))}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
