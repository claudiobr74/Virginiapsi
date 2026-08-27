import { describe, expect, it } from "vitest";
import { RUNTIME_PROMPT_VERSION, RUNTIME_SCHEMA_VERSION } from "@/lib/ai/prompts";
import {
  SESSION_CLOSING_SCHEMA,
  SESSION_LIVE_SCHEMA,
} from "@/lib/ai/contracts/session";
import { SUPERVISOR_SCHEMA } from "@/lib/ai/contracts/supervisor";

const EXPECTED_SAFETY = ["none", "attention", "urgent_review"];

describe("contratos de runtime AI", () => {
  it("mantém a versão oficial dos prompts clínicos", () => {
    expect(RUNTIME_PROMPT_VERSION).toBe("1.2.0");
    expect(RUNTIME_SCHEMA_VERSION).toBe("1.2.1");
  });

  it("usa o mesmo enum de severidade de segurança na sessão e no supervisor", () => {
    const live = SESSION_LIVE_SCHEMA.properties.safety.properties.severity.enum;
    const closing =
      SESSION_CLOSING_SCHEMA.properties.safety.properties.severity.enum;
    const supervisor =
      SUPERVISOR_SCHEMA.properties.riskAndEthics.items.properties.severity.enum;

    expect([...live]).toEqual(EXPECTED_SAFETY);
    expect([...closing]).toEqual(EXPECTED_SAFETY);
    expect([...supervisor]).toEqual(EXPECTED_SAFETY);
  });
});
