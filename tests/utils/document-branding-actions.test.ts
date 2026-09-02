import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOrgContext, getDocumentBranding, createSupabaseServerClient, revalidatePath } = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  getDocumentBranding: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-org-context", () => ({
  requireOrgContext,
}));

vi.mock("@/features/documents/branding-queries", () => ({
  getDocumentBranding,
  getDocumentLogo: vi.fn(),
}));

vi.mock("@/lib/documents/storage", () => ({
  DOCUMENT_BUCKETS: { documentBranding: "document-branding" },
  buildStoragePath: vi.fn(),
  createSignedDownloadUrl: vi.fn(),
  createSignedUploadUrl: vi.fn(),
}));

vi.mock("@/lib/documents/storage-meta", () => ({
  isOrgScopedStoragePath: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

import { upsertDocumentBrandingAction } from "@/features/documents/branding-actions";
import { defaultBranding } from "@/features/documents/branding-resolve";

const ORG = "11111111-1111-4111-8111-111111111111";

describe("upsertDocumentBrandingAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgContext.mockResolvedValue({
      organizationId: ORG,
      role: "psychologist_admin",
      user: { id: "user-1" },
    });
  });

  it("recusa papel sem autorização", async () => {
    requireOrgContext.mockResolvedValueOnce({
      organizationId: ORG,
      role: "secretary",
      user: { id: "user-2" },
    });
    const result = await upsertDocumentBrandingAction({ defaultVisualProfile: "essencial" });
    expect(result.error).toMatch(/administradora/i);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("rejeita payload inválido", async () => {
    const result = await upsertDocumentBrandingAction({ defaultVisualProfile: "nao-existe" });
    expect(result.error).toBeTruthy();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("insere branding novo com defaultVisualProfile", async () => {
    getDocumentBranding.mockResolvedValueOnce(null);
    const insert = vi.fn(async () => ({ error: null }));
    createSupabaseServerClient.mockResolvedValueOnce({
      from: vi.fn(() => ({ insert, update: vi.fn() })),
    });
    const result = await upsertDocumentBrandingAction({
      defaultVisualProfile: "essencial",
      letterheadPreset: "minimalista",
      colorPrimary: "#3a4f43",
    });
    expect(result.error).toBeUndefined();
    expect(result.id).toBe(ORG);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG,
        default_visual_profile: "essencial",
        letterhead_preset: "minimalista",
      }),
    );
  });

  it("atualiza branding existente preservando campos omitidos", async () => {
    const existing = defaultBranding();
    existing.organization_id = ORG;
    existing.default_visual_profile = "clinica";
    existing.professional_name = "Virgínia Macedo";
    getDocumentBranding.mockResolvedValueOnce(existing);
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    createSupabaseServerClient.mockResolvedValueOnce({
      from: vi.fn(() => ({ update, insert: vi.fn() })),
    });
    const result = await upsertDocumentBrandingAction({
      defaultVisualProfile: "premium",
      letterheadPreset: "premium",
    });
    expect(result.error).toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        default_visual_profile: "premium",
        letterhead_preset: "premium",
        professional_name: "Virgínia Macedo",
      }),
    );
    expect(eq).toHaveBeenCalledWith("organization_id", ORG);
  });
});
