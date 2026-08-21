import { describe, expect, it } from "vitest";
import { firstRpcRow } from "@/lib/supabase/rpc-result";

describe("firstRpcRow", () => {
  it("lê o primeiro item de um array PostgREST", () => {
    expect(firstRpcRow([{ access_token_encrypted: "a" }])).toEqual({
      access_token_encrypted: "a",
    });
  });

  it("lê um objeto único como uma linha", () => {
    expect(firstRpcRow({ access_token_encrypted: "a" })).toEqual({
      access_token_encrypted: "a",
    });
  });

  it("retorna null quando não há linha", () => {
    expect(firstRpcRow([])).toBeNull();
    expect(firstRpcRow(null)).toBeNull();
    expect(firstRpcRow(undefined)).toBeNull();
  });
});
