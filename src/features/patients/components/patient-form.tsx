"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import type { ConsentRow } from "@/features/consents/contracts";
import {
  clearPortraitAction,
  confirmPortraitUploadAction,
  createPatientAction,
  requestPortraitUploadUrlAction,
  updatePatientAction,
} from "@/features/patients/actions";
import { PatientPhotoField } from "@/features/patients/components/patient-photo-field";
import { PatientTermsSummary } from "@/features/patients/components/patient-terms-summary";
import {
  CONSULTATION_MODALITY_VALUES,
  MODALITY_LABELS,
  PATIENT_STATUS_LABELS,
  PATIENT_STATUS_VALUES,
  patientFormSchema,
  type PatientFormValues,
  type PatientRow,
} from "@/features/patients/contracts";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

async function persistPortrait(
  patientId: string,
  file: File | null,
  removeExisting: boolean,
): Promise<string | undefined> {
  if (file) {
    const grant = await requestPortraitUploadUrlAction({
      patientId,
      mimeType: file.type,
    });
    if (grant.error || !grant.path || !grant.token) {
      return grant.error ?? "Não foi possível preparar o envio da foto.";
    }
    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from("patient-attachments")
      .uploadToSignedUrl(grant.path, grant.token, file);
    if (uploadError) {
      return "Não foi possível enviar a foto agora.";
    }
    const confirmed = await confirmPortraitUploadAction({
      patientId,
      storagePath: grant.path,
      mimeType: file.type,
      byteSize: file.size,
    });
    return confirmed.error;
  }
  if (removeExisting) {
    const cleared = await clearPortraitAction(patientId);
    return cleared.error;
  }
  return undefined;
}

function defaultValuesFrom(patient?: PatientRow): PatientFormValues {
  if (!patient) {
    return {
      preferredName: "",
      fullName: "",
      birthDate: "",
      cpf: "",
      phone: "",
      email: "",
      responsibles: [],
      modality: "in_person",
      status: "active",
      defaultSessionValue: "",
      responsiblePsychologistUserId: "",
    };
  }

  return {
    preferredName: patient.preferred_name,
    fullName: patient.full_name,
    birthDate: patient.birth_date ?? "",
    cpf: patient.cpf ?? "",
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    responsibles: patient.responsibles,
    modality: patient.modality,
    status: patient.status,
    defaultSessionValue:
      patient.default_session_value != null
        ? String(patient.default_session_value)
        : "",
    responsiblePsychologistUserId: patient.responsible_psychologist_user_id ?? "",
  };
}

export interface PatientFormProps {
  patient?: PatientRow;
  photoUrl?: string | null;
  terms?: {
    isAdmin: boolean;
    consents: ConsentRow[];
  };
  assignablePsychologists?: { userId: string; email: string | null; role: string }[];
  canAssignResponsible?: boolean;
}

export function PatientForm({
  patient,
  photoUrl,
  terms,
  assignablePsychologists = [],
  canAssignResponsible = false,
}: PatientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: defaultValuesFrom(patient),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "responsibles",
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = patient
        ? await updatePatientAction(patient.id, values)
        : await createPatientAction(values);

      if (result.error || !result.patientId) {
        setError("root", { message: result.error ?? "Não foi possível salvar o paciente." });
        return;
      }

      const photoError = await persistPortrait(
        result.patientId,
        photoFile,
        removeExistingPhoto,
      );
      if (photoError) {
        setError("root", {
          message: patient
            ? photoError
            : `${photoError} O cadastro foi salvo — envie a foto de novo em Editar cadastro.`,
        });
        if (patient) {
          return;
        }
      }

      router.push(`/app/patients/${result.patientId}`);
    });
  });

  const busy = isPending || isSubmitting;

  return (
    <PageContainer narrow>
      <PageHeader
        title={patient ? "Editar paciente" : "Cadastrar Paciente"}
        subtitle={
          patient
            ? `${patient.public_code} — ${patient.preferred_name}`
            : "Cadastro administrativo guiado em quatro seções"
        }
      />

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
        {errors.root ? (
          <p
            role="alert"
            className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
          >
            {errors.root.message}
          </p>
        ) : null}

        <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6">
          <SectionHeader title="Identificação" />
          <PatientPhotoField
            name={patient?.preferred_name || "Paciente"}
            currentPhotoUrl={photoUrl}
            onFileChange={(file) => {
              setPhotoFile(file);
              setRemoveExistingPhoto(file === null);
            }}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preferredName">Nome preferencial</Label>
              <Input
                id="preferredName"
                aria-invalid={Boolean(errors.preferredName) || undefined}
                {...register("preferredName")}
              />
              {errors.preferredName ? (
                <p className="text-xs text-failed">{errors.preferredName.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                aria-invalid={Boolean(errors.fullName) || undefined}
                {...register("fullName")}
              />
              {errors.fullName ? (
                <p className="text-xs text-failed">{errors.fullName.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birthDate">Data de nascimento</Label>
              <Input id="birthDate" type="date" {...register("birthDate")} />
              {errors.birthDate ? (
                <p className="text-xs text-failed">{errors.birthDate.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpf">CPF (opcional)</Label>
              <Input id="cpf" placeholder="000.000.000-00" {...register("cpf")} />
              {errors.cpf ? (
                <p className="text-xs text-failed">{errors.cpf.message}</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6">
          <SectionHeader title="Contato & Responsáveis" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" {...register("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email ? (
                <p className="text-xs text-failed">{errors.email.message}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Responsáveis (opcional)</Label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  append({ name: "", relationship: "", phone: "", email: "" })
                }
              >
                <Plus className="size-3.5" aria-hidden />
                Adicionar responsável
              </Button>
            </div>

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-surface/50 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`responsibles.${index}.name`}>
                    Nome do responsável
                  </Label>
                  <Input
                    id={`responsibles.${index}.name`}
                    {...register(`responsibles.${index}.name` as const)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`responsibles.${index}.relationship`}>
                    Vínculo
                  </Label>
                  <Input
                    id={`responsibles.${index}.relationship`}
                    placeholder="Mãe, pai, tutor…"
                    {...register(`responsibles.${index}.relationship` as const)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`responsibles.${index}.phone`}>
                    Telefone do responsável
                  </Label>
                  <Input
                    id={`responsibles.${index}.phone`}
                    {...register(`responsibles.${index}.phone` as const)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover responsável"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4 text-failed" aria-hidden />
                  </Button>
                </div>
                {errors.responsibles?.[index] ? (
                  <p className="text-xs text-failed sm:col-span-4">
                    {errors.responsibles[index]?.name?.message ??
                      errors.responsibles[index]?.relationship?.message ??
                      errors.responsibles[index]?.phone?.message}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6">
          <SectionHeader title="Atendimento & Situação" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="modality">Modalidade</Label>
              <div className="flex flex-wrap gap-2">
                {CONSULTATION_MODALITY_VALUES.map((value) => (
                  <ModalityOption key={value} value={value} register={register} />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Situação</Label>
              <div className="flex flex-wrap gap-2">
                {PATIENT_STATUS_VALUES.map((value) => (
                  <StatusOption key={value} value={value} register={register} />
                ))}
              </div>
            </div>
          </div>
          {canAssignResponsible ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="responsiblePsychologistUserId">Psicóloga responsável</Label>
              <select
                id="responsiblePsychologistUserId"
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
                {...register("responsiblePsychologistUserId")}
              >
                <option value="">Selecione</option>
                {assignablePsychologists.map((item) => (
                  <option key={item.userId} value={item.userId}>
                    {item.email ?? item.userId}
                    {item.role === "psychologist_admin" ? " (administradora)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Só a profissional responsável vê o prontuário, a sessão e a IA deste paciente.
              </p>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6">
          <SectionHeader
            title="Financeiro & Termos"
            description={
              patient
                ? "Valor usado nas cobranças. A situação vigente dos termos aparece abaixo; o aceite fica no prontuário."
                : "Valor usado nas cobranças. Termos de serviço e TCLE são registrados no prontuário depois do cadastro."
            }
          />
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="defaultSessionValue">
              Valor padrão da sessão (R$, opcional)
            </Label>
            <Input
              id="defaultSessionValue"
              inputMode="decimal"
              placeholder="200.00"
              {...register("defaultSessionValue")}
            />
            {errors.defaultSessionValue ? (
              <p className="text-xs text-failed">
                {errors.defaultSessionValue.message}
              </p>
            ) : null}
          </div>
          {patient && terms ? (
            <PatientTermsSummary
              patientId={patient.id}
              consents={terms.consents}
              isAdmin={terms.isAdmin}
            />
          ) : null}
        </section>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" isLoading={busy}>
            {patient ? "Salvar alterações" : "Cadastrar paciente"}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}

function ModalityOption({
  value,
  register,
}: {
  value: (typeof CONSULTATION_MODALITY_VALUES)[number];
  register: ReturnType<typeof useForm<PatientFormValues>>["register"];
}) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-xl border border-border px-3.5 py-2 text-sm font-medium transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground",
      )}
    >
      <input
        type="radio"
        value={value}
        className="sr-only"
        {...register("modality")}
      />
      {MODALITY_LABELS[value]}
    </label>
  );
}

function StatusOption({
  value,
  register,
}: {
  value: (typeof PATIENT_STATUS_VALUES)[number];
  register: ReturnType<typeof useForm<PatientFormValues>>["register"];
}) {
  return (
    <label className="cursor-pointer rounded-xl border border-border px-3.5 py-2 text-sm font-medium transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground">
      <input
        type="radio"
        value={value}
        className="sr-only"
        {...register("status")}
      />
      {PATIENT_STATUS_LABELS[value]}
    </label>
  );
}
