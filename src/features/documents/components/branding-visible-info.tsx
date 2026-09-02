"use client";

import type { BrandingFormState, BrandingIdentityFallback } from "@/features/documents/branding-form";

export function BrandingVisibleInfo({
  form,
  fallback,
  onChange,
}: {
  form: BrandingFormState;
  fallback: BrandingIdentityFallback;
  onChange: (patch: Partial<BrandingFormState>) => void;
}) {
  const professional = form.professionalName.trim() || fallback.professionalName?.trim();
  const crp = form.crp.trim() || fallback.crp?.trim();
  const clinic = form.clinicName.trim() || fallback.clinicName?.trim() || fallback.organizationName?.trim();
  const phone = form.phone.trim() || form.professionalPhone.trim() || fallback.phone?.trim();
  const email = form.email.trim() || form.professionalEmail.trim() || fallback.email?.trim();
  const city = [form.city.trim(), form.state.trim()].filter(Boolean).join("/") || null;
  const contactOn =
    (form.showPhone || form.showEmail) &&
    (form.footerPhone || form.footerEmail || form.headerPhone || form.headerEmail);

  const options: Array<{
    id: string;
    label: string;
    checked: boolean;
    hidden?: boolean;
    toggle: (next: boolean) => Partial<BrandingFormState>;
  }> = [
    {
      id: "professional",
      label: "Nome profissional",
      checked: form.headerProfessional,
      hidden: !professional,
      toggle: (next) => ({ headerProfessional: next }),
    },
    {
      id: "crp",
      label: "CRP",
      checked: form.headerCrp,
      hidden: !crp,
      toggle: (next) => ({ headerCrp: next }),
    },
    {
      id: "clinic",
      label: "Nome da clínica",
      checked: form.headerClinic && form.showClinicName,
      hidden: !clinic,
      toggle: (next) => ({ headerClinic: next, showClinicName: next }),
    },
    {
      id: "contact",
      label: "Telefone/e-mail",
      checked: contactOn,
      hidden: !phone && !email,
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
      hidden: !city && !form.city && !form.state,
      toggle: (next) => ({ showCity: next, footerAddress: next }),
    },
  ];

  const visible = options.filter((option) => !option.hidden);
  const items = visible.length > 0 ? visible : options.filter((option) => option.id !== "city");

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">Informações exibidas</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Escolha os dados profissionais que aparecem nos documentos.
      </p>
      <div className="mt-3 flex flex-col gap-1">
        {items.map((option) => (
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
