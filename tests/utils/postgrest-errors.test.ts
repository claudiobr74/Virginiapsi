import { describe, expect, it } from "vitest";
import { isMissingPublicTable } from "@/lib/supabase/postgrest-errors";

describe("isMissingPublicTable", () => {
  it("reconhece PGRST205 e relação ausente", () => {
    expect(isMissingPublicTable({ code: "PGRST205", message: "schema cache" })).toBe(
      true,
    );
    expect(
      isMissingPublicTable({
        code: "42P01",
        message: 'relation "public.appointments" does not exist',
      }),
    ).toBe(true);
  });

  it("não trata erro genérico como tabela ausente", () => {
    expect(isMissingPublicTable({ code: "42501", message: "permission denied" })).toBe(
      false,
    );
    expect(isMissingPublicTable(null)).toBe(false);
  });
});
