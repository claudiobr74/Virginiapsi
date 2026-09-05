import { describe, expect, it } from "vitest";
import { classifyStorageFailure } from "@/lib/documents/storage-failure";

describe("classifyStorageFailure", () => {
  it("não inclui URL, token nem JWT no código", () => {
    const leaked = classifyStorageFailure(
      new Error(
        "failed to create signed upload url: https://kgfcgxagixiynlcewept.supabase.co/storage/v1/object/sign/patient-attachments/x?token=eyJhbGciOiJIUzI1NiJ9.aaa.bbb Bearer abc sb_secret_live_value",
      ),
    );
    expect(JSON.stringify(leaked)).not.toMatch(/https?:\/\//);
    expect(JSON.stringify(leaked)).not.toMatch(/eyJ/);
    expect(JSON.stringify(leaked)).not.toMatch(/sb_secret_/);
    expect(JSON.stringify(leaked)).not.toMatch(/Bearer/);
    expect(leaked.code).toBe("signed_url_failed");
  });

  it("classifica env incompleto sem listar valores", () => {
    expect(
      classifyStorageFailure(
        new Error(
          "Invalid environment configuration: TWILIO_ACCOUNT_SID, GEMINI_API_KEY. Values are not logged.",
        ),
      ).code,
    ).toBe("env_invalid");
  });

  it("classifica bucket ausente", () => {
    expect(
      classifyStorageFailure(new Error("Bucket not found")).code,
    ).toBe("bucket_not_found");
  });
});
