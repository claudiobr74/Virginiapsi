import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Clinical Pastel tokens", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

  it("define famílias pastéis namespaced, sem sobrescrever sage-700 primary", () => {
    expect(css).toContain("--tone-agenda-bg: #eef5ef");
    expect(css).toContain("--tone-clinical-bg: #f4f0fa");
    expect(css).toContain("--tone-finance-bg: #fff2ea");
    expect(css).toContain("--tone-tasks-bg: #fff8e6");
    expect(css).toContain("--tone-documents-bg: #eef5fb");
    expect(css).toContain("--tone-knowledge-bg: #ecf7f5");
    expect(css).toContain("--tone-settings-bg: #f8f3f0");
    expect(css).toMatch(/--sage-700:\s*#3a4f43/);
  });

  it("preserva as cores fortes da Agenda V2", () => {
    expect(css).toContain("background-color: #34a853");
    expect(css).toContain("background-color: #1a73e8");
    expect(css).toContain("background-color: #d93025");
  });
});
