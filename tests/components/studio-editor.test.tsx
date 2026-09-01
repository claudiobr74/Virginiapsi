import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { StudioEditor } from "@/features/documents/components/studio-editor";
import {
  documentFileRowSchema,
  documentRowSchema,
  documentVersionRowSchema,
  type DocumentRow,
  type DocumentVersionRow,
} from "@/features/documents/contracts";

const saveStudioDraftAction = vi.fn(async () => ({}));
const cancelDocumentAction = vi.fn(async () => ({}));
const issueStudioDocumentAction = vi.fn(async () => ({}));
const previewDocumentAiContextAction = vi.fn(async () => ({
  preview: "envelope",
  previewHash: "a".repeat(64),
}));
const generateDocumentAiDraftAction = vi.fn(async () => ({
  error: "gate",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/documents/actions", () => ({
  cancelDocumentAction: (...args: unknown[]) => cancelDocumentAction(...args),
  signDocumentAction: vi.fn(async () => ({})),
}));

vi.mock("@/features/documents/studio-actions", () => ({
  duplicateDocumentAction: vi.fn(async () => ({})),
  importScheduledEncountersAction: vi.fn(async () => ({})),
  issueStudioDocumentAction: (...args: unknown[]) => issueStudioDocumentAction(...args),
  markDocumentReviewedAction: vi.fn(async () => ({})),
  registerDeliveryAction: vi.fn(async () => ({})),
  saveDocumentAsTemplateAction: vi.fn(async () => ({})),
  saveStudioDraftAction: (...args: unknown[]) => saveStudioDraftAction(...args),
  generateDocumentAiDraftAction: (...args: unknown[]) => generateDocumentAiDraftAction(...args),
  previewDocumentAiContextAction: (...args: unknown[]) => previewDocumentAiContextAction(...args),
}));

const DOC = "22222222-2222-4222-8222-222222222222";
const VER = "33333333-3333-4333-8333-333333333333";

function studioDocument(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return documentRowSchema.parse({
    id: DOC,
    organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    patient_id: "44444444-4444-4444-8444-444444444444",
    template_id: null,
    title: "Declaração de comparecimento",
    document_kind: "declaracao",
    sensitivity: "clinical",
    status: "draft",
    current_version: 1,
    issued_at: null,
    canceled_at: null,
    created_at: "2026-09-01T12:00:00.000Z",
    system_template_key: "declaration_attendance",
    purpose: "comparecimento",
    ...overrides,
  });
}

function version(content = "Texto revisado sem campos pendentes."): DocumentVersionRow {
  return documentVersionRowSchema.parse({
    id: VER,
    document_id: DOC,
    version: 1,
    body_snapshot: content,
    variables_snapshot: {},
    created_at: "2026-09-01T12:00:00.000Z",
    sections_snapshot: [
      {
        id: "body",
        type: "text",
        title: "Declaração",
        content,
        order: 0,
        enabled: true,
        pageBreakBefore: false,
      },
    ],
  });
}

function renderEditor(overrides: Partial<DocumentRow> = {}, content?: string) {
  return render(
    <StudioEditor
      document={studioDocument(overrides)}
      latestVersion={version(content)}
      file={null}
      versions={[version(content)]}
      deliveries={[]}
      patientName="Ana"
      canSaveTemplate
    />,
  );
}

describe("StudioEditor simplificado", () => {
  beforeEach(() => {
    saveStudioDraftAction.mockClear();
    cancelDocumentAction.mockClear();
    issueStudioDocumentAction.mockClear();
    generateDocumentAiDraftAction.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("abre com o documento em foco e Ajustes fechado", () => {
    renderEditor();
    expect(screen.getByRole("link", { name: "← Documentos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Declaração de comparecimento" })).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajustes" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "Ajustes do documento" })).not.toBeInTheDocument();
    expect(screen.queryByText("Configuração")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modo foco" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar documento" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajudar a escrever" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar e finalizar" })).toBeInTheDocument();
  });

  it("abre Ajustes com Dados, Aparência e Texto", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Ajustes" }));
    expect(await screen.findByRole("heading", { name: "Ajustes do documento" })).toBeInTheDocument();
    expect(screen.getByText("Dados")).toBeInTheDocument();
    expect(screen.getByText("Aparência")).toBeInTheDocument();
    expect(screen.getByText("Texto")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Perfil visual"), "premium");
    await user.selectOptions(screen.getByLabelText("Logo"), "none");
    await user.selectOptions(screen.getByLabelText("Tom"), "formal");
    await user.selectOptions(screen.getByLabelText("Extensão"), "objetivo");
    expect(screen.getByLabelText("Perfil visual")).toHaveValue("premium");
    expect(screen.getByLabelText("Logo")).toHaveValue("none");
    expect(screen.getByLabelText("Tom")).toHaveValue("formal");
    expect(screen.getByLabelText("Extensão")).toHaveValue("objetivo");
    await waitFor(
      () =>
        expect(saveStudioDraftAction).toHaveBeenCalledWith(
          expect.objectContaining({
            visualProfile: "premium",
            logoMode: "none",
            tone: "formal",
            lengthPreset: "objetivo",
          }),
        ),
      { timeout: 4000 },
    );
  });

  it("preserva autosave discreto", async () => {
    vi.useFakeTimers();
    renderEditor();
    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(saveStudioDraftAction).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("expõe Mais com cancelamento confirmado", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Mais" }));
    expect(await screen.findByRole("button", { name: "Histórico de versões" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicar documento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar como modelo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar documento" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Cancelar documento?")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Cancelar documento" }));
    await waitFor(() => expect(cancelDocumentAction).toHaveBeenCalledWith(DOC));
  });

  it("abre Ajudar a escrever com comandos existentes e ack obrigatório", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Ajudar a escrever" }));
    expect(await screen.findByText("O que você gostaria de fazer?")).toBeInTheDocument();
    expect(screen.getByText("Criar uma primeira versão")).toBeInTheDocument();
    expect(screen.getByText("Melhorar o texto")).toBeInTheDocument();
    expect(screen.getByText("Outro...")).toBeInTheDocument();
    expect(screen.queryByText("Formulação")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Usar informações do prontuário" }));
    expect(screen.getByText("Formulação")).toBeInTheDocument();
    const generate = screen.getByRole("button", { name: "Gerar rascunho" });
    expect(generate).toBeDisabled();
    await user.click(screen.getByText("Outro..."));
    expect(screen.getByText("melhorar clareza")).toBeInTheDocument();
    await user.click(
      screen.getByLabelText("Confirmo os dados acima como o único contexto enviado à IA."),
    );
    const generateEnabled = screen.getByRole("button", { name: "Gerar rascunho" });
    expect(generateEnabled).toBeEnabled();
    await user.click(generateEnabled);
    await waitFor(() => expect(generateDocumentAiDraftAction).toHaveBeenCalled());
    expect(generateDocumentAiDraftAction).toHaveBeenCalledWith(
      expect.objectContaining({
        contextPreviewAcknowledged: true,
        previewHash: "a".repeat(64),
      }),
    );
  });

  it("bloqueia emitir com placeholder e exige confirmações no drawer", async () => {
    const user = userEvent.setup();
    renderEditor({}, "Ainda falta {{patient.full_name}}");
    await user.click(screen.getByRole("button", { name: "Revisar e finalizar" }));
    expect(await screen.findByRole("heading", { name: "Antes de finalizar" })).toBeInTheDocument();
    expect(screen.getByText("Há campos pendentes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Emitir documento" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Visualizar PDF" }));
    expect(screen.getByTitle("Pré-visualização do PDF")).toBeInTheDocument();
  });

  it("mostra entrega só depois de emitir", async () => {
    const user = userEvent.setup();
    const file = documentFileRowSchema.parse({
      id: "55555555-5555-4555-8555-555555555555",
      document_id: DOC,
      document_version_id: VER,
      storage_path: "docs/file.pdf",
      mime_type: "application/pdf",
      byte_size: 12,
      sha256: "abc",
      generated_at: "2026-09-01T12:00:00.000Z",
    });
    render(
      <StudioEditor
        document={studioDocument({ status: "issued", issued_at: "2026-09-01T12:00:00.000Z" })}
        latestVersion={version()}
        file={file}
        versions={[version()]}
        deliveries={[]}
        patientName="Ana"
      />,
    );
    expect(screen.getByText("Documento pronto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajudar a escrever" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Observação")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Registrar entrega" }));
    expect(await screen.findByRole("heading", { name: "Registrar entrega" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Destinatário")).toBeInTheDocument();
  });
});
