import { describe, expect, it } from "vitest";
import { pageHeading, pageTitle, PRODUCT_NAME } from "@/lib/brand";
import { parsePatientHubTab } from "@/features/patients/hub-tabs";
import {
  countByKind,
  groupByPriority,
  relativeTimeLabel,
  type PendencyItem,
} from "@/features/dashboard/pendencies";
import {
  attendanceRatePercent,
  monthReceiptsCents,
  occupancyPercent,
} from "@/features/dashboard/metrics";
import { isNavItemActive } from "@/features/shell/nav-link";

describe("marca VirgíniaPsi", () => {
  it("compõe títulos de página com o nome visível", () => {
    expect(pageTitle("Agenda")).toBe(`Agenda — ${PRODUCT_NAME}`);
  });

  it("mapeia rotas para os títulos do shell", () => {
    expect(pageHeading("/app")).toBe(`Hoje no ${PRODUCT_NAME}`);
    expect(pageHeading("/app/agenda")).toBe("Agenda Diária");
    expect(pageHeading("/app/agenda", { view: "week" })).toBe("Agenda Semanal");
    expect(pageHeading("/app/agenda", { view: "month" })).toBe("Agenda Mensal");
    expect(pageHeading("/app/patients")).toBe("Diretório de Pacientes");
    expect(pageHeading("/app/pendencias")).toBe("Central de Pendências Inteligente");
    expect(pageHeading("/app/indicadores")).toBe("Indicadores e Métricas Clínicas");
    expect(pageHeading("/app/sessions")).toBe("Sessões");
    expect(pageHeading("/app/documents")).toBe("Centro de Documentos");
  });
});

describe("navegação Serenità", () => {
  it("marca Início só em /app", () => {
    expect(isNavItemActive("/app", "/app")).toBe(true);
    expect(isNavItemActive("/app/patients", "/app")).toBe(false);
  });

  it("não confunde /app/sessions com /session/:id", () => {
    expect(isNavItemActive("/app/sessions", "/app/sessions")).toBe(true);
    expect(isNavItemActive("/session/abc", "/app/sessions")).toBe(false);
  });
});

describe("abas do Patient Hub", () => {
  it("aceita o alias tcle e cai no primeiro disponível", () => {
    expect(
      parsePatientHubTab("tcle", ["overview", "consents"]),
    ).toBe("consents");
    expect(parsePatientHubTab("missing", ["overview", "record"])).toBe("overview");
  });
});

describe("pendências", () => {
  const items: PendencyItem[] = [
    {
      id: "a",
      kind: "clinical_record",
      priority: "high",
      title: "Registro",
      subtitle: "PAC-001",
      href: "/session/1",
      actionLabel: "Finalizar",
      createdAt: "2026-08-20T12:00:00.000Z",
    },
    {
      id: "b",
      kind: "payment",
      priority: "high",
      title: "Cobrança",
      subtitle: "PAC-002",
      href: "/app/finance",
      actionLabel: "Faturar",
      createdAt: "2026-08-21T12:00:00.000Z",
    },
    {
      id: "c",
      kind: "document",
      priority: "medium",
      title: "Rascunho",
      subtitle: "doc",
      href: "/app/documents/1",
      actionLabel: "Abrir",
      createdAt: "2026-08-22T12:00:00.000Z",
    },
  ];

  it("conta por tipo e agrupa por prioridade", () => {
    expect(countByKind(items)).toEqual({
      clinical_record: 1,
      document: 1,
      payment: 1,
      consent: 0,
      task: 0,
      total: 3,
    });
    expect(groupByPriority(items).high).toHaveLength(2);
    expect(groupByPriority(items).medium).toHaveLength(1);
  });

  it("formata tempo relativo em português", () => {
    const now = Date.parse("2026-08-23T12:00:00.000Z");
    expect(relativeTimeLabel("2026-08-23T08:00:00.000Z", now)).toBe("hoje");
    expect(relativeTimeLabel("2026-08-22T12:00:00.000Z", now)).toBe("há 1 dia");
    expect(relativeTimeLabel("2026-08-20T12:00:00.000Z", now)).toBe("há 3 dias");
  });
});

describe("indicadores", () => {
  it("calcula comparecimento e ocupação", () => {
    expect(attendanceRatePercent(9, 1)).toBe(90);
    expect(attendanceRatePercent(0, 0)).toBe(0);
    expect(occupancyPercent(22, 28)).toBe(79);
  });

  it("soma recebimentos do mês no fuso da clínica", () => {
    const cents = monthReceiptsCents(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "11111111-1111-4111-8111-111111111112",
          charge_id: "11111111-1111-4111-8111-111111111113",
          amount: "150.00",
          paid_at: "2026-08-10T15:00:00.000Z",
          method: "pix",
          created_at: "2026-08-10T15:00:00.000Z",
          updated_at: "2026-08-10T15:00:00.000Z",
        },
        {
          id: "11111111-1111-4111-8111-111111111114",
          organization_id: "11111111-1111-4111-8111-111111111112",
          charge_id: "11111111-1111-4111-8111-111111111115",
          amount: "50.00",
          paid_at: "2026-07-10T15:00:00.000Z",
          method: "pix",
          created_at: "2026-07-10T15:00:00.000Z",
          updated_at: "2026-07-10T15:00:00.000Z",
        },
      ],
      "America/Sao_Paulo",
      "2026-08-25",
    );
    expect(cents).toBe(15000);
  });
});
