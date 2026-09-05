import { describe, expect, it } from "vitest";
import {
  evaluateCaptureCapability,
  resolveConsentStateFromRows,
  resolveMinorRequirement,
  TRANSCRIPTION_CONSENT_VERSION,
  type ConsentRow,
  type ConsentType,
} from "@/features/consents/contracts";

const NOW = new Date("2026-08-20T12:00:00.000Z");

function consent(overrides: Partial<ConsentRow> & { type: ConsentType }): ConsentRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "22222222-2222-4222-8222-222222222222",
    patient_id: "33333333-3333-4333-8333-333333333333",
    title: "Consentimento",
    version: "minimo-2026-08",
    status: "accepted",
    accepted_at: "2026-08-01T10:00:00.000Z",
    expires_at: null,
    guardian_authorization: false,
    guardian_name: null,
    patient_assent: false,
    revoked_at: null,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function allCaptureConsents(overrides: Partial<ConsentRow> = {}): ConsentRow[] {
  return [
    consent({ type: "ai_processing", id: "a1111111-1111-4111-8111-111111111111", ...overrides }),
    consent({ type: "session_recording", id: "b1111111-1111-4111-8111-111111111111", ...overrides }),
    consent({
      type: "session_transcription",
      id: "c1111111-1111-4111-8111-111111111111",
      version: TRANSCRIPTION_CONSENT_VERSION,
      ...overrides,
    }),
  ];
}

describe("resolveMinorRequirement", () => {
  it("classifica adulto sem exigências adicionais", () => {
    const result = resolveMinorRequirement("1990-05-10", NOW);
    expect(result).toEqual({
      ageGroup: "adult",
      isMinor: false,
      requiresGuardianAuthorization: false,
      requiresAssent: false,
    });
  });

  it("criança exige autorização do responsável, sem anuência formal", () => {
    const result = resolveMinorRequirement("2018-01-01", NOW);
    expect(result.ageGroup).toBe("child");
    expect(result.requiresGuardianAuthorization).toBe(true);
    expect(result.requiresAssent).toBe(false);
  });

  it("adolescente exige autorização do responsável e anuência", () => {
    const result = resolveMinorRequirement("2012-01-01", NOW);
    expect(result.ageGroup).toBe("adolescent");
    expect(result.requiresGuardianAuthorization).toBe(true);
    expect(result.requiresAssent).toBe(true);
  });

  it("aniversário ainda não ocorrido no ano mantém a pessoa menor", () => {
    // Faz 18 anos em dezembro de 2026: em agosto ainda é adolescente.
    const result = resolveMinorRequirement("2008-12-31", NOW);
    expect(result.isMinor).toBe(true);
  });

  it("data de nascimento ausente cai em 'unknown' (fail closed)", () => {
    expect(resolveMinorRequirement(null, NOW).ageGroup).toBe("unknown");
  });
});

describe("resolveConsentStateFromRows", () => {
  it("sem nenhum registro, tudo é negado com motivo consent_missing", () => {
    const { state, denials } = resolveConsentStateFromRows({
      rows: [],
      birthDate: "1990-05-10",
      at: NOW,
    });

    expect(state.aiProcessingAllowed).toBe(false);
    expect(state.recordingAllowed).toBe(false);
    expect(state.transcriptionAllowed).toBe(false);
    expect(denials.session_recording).toBe("consent_missing");
  });

  it("adulto com os três consentimentos aceitos libera tudo e expõe versão/data", () => {
    const { state } = resolveConsentStateFromRows({
      rows: allCaptureConsents(),
      birthDate: "1990-05-10",
      at: NOW,
    });

    expect(state.aiProcessingAllowed).toBe(true);
    expect(state.recordingAllowed).toBe(true);
    expect(state.transcriptionAllowed).toBe(true);
    expect(state.consentVersion).toMatch(/^minimo-2026-/);
    expect(state.consentRecordedAt).toBe("2026-08-01T10:00:00.000Z");
    expect(state.minorGuardianAuthorizationValid).toBeUndefined();
  });

  it("consentimento revogado bloqueia com motivo consent_revoked", () => {
    const rows = allCaptureConsents();
    rows[1] = consent({
      type: "session_recording",
      status: "revoked",
      revoked_at: "2026-08-10T10:00:00.000Z",
    });

    const { state, denials } = resolveConsentStateFromRows({
      rows,
      birthDate: "1990-05-10",
      at: NOW,
    });

    expect(state.recordingAllowed).toBe(false);
    expect(denials.session_recording).toBe("consent_revoked");
    expect(state.transcriptionAllowed).toBe(true);
  });

  it("registro mais recente vence o anterior (revogação depois de aceite)", () => {
    const rows = [
      consent({
        type: "session_recording",
        id: "old-1111-1111-4111-8111-111111111111",
        created_at: "2026-08-01T10:00:00.000Z",
      }),
      consent({
        type: "session_recording",
        id: "new-1111-1111-4111-8111-111111111111",
        status: "revoked",
        revoked_at: "2026-08-15T10:00:00.000Z",
        created_at: "2026-08-15T10:00:00.000Z",
      }),
    ];

    const { denials } = resolveConsentStateFromRows({
      rows,
      birthDate: "1990-05-10",
      at: NOW,
    });
    expect(denials.session_recording).toBe("consent_revoked");
  });

  it("consentimento expirado por data bloqueia", () => {
    const rows = allCaptureConsents({ expires_at: "2026-08-19T00:00:00.000Z" });
    const { state, denials } = resolveConsentStateFromRows({
      rows,
      birthDate: "1990-05-10",
      at: NOW,
    });

    expect(state.recordingAllowed).toBe(false);
    expect(denials.session_recording).toBe("consent_expired");
  });

  it("menor sem autorização do responsável é bloqueado mesmo com aceite", () => {
    const { state, denials } = resolveConsentStateFromRows({
      rows: allCaptureConsents(),
      birthDate: "2018-01-01",
      at: NOW,
    });

    expect(state.recordingAllowed).toBe(false);
    expect(denials.session_recording).toBe("minor_guardian_authorization_missing");
    expect(state.minorGuardianAuthorizationValid).toBe(false);
  });

  it("criança com autorização do responsável é liberada sem anuência formal", () => {
    const { state } = resolveConsentStateFromRows({
      rows: allCaptureConsents({ guardian_authorization: true }),
      birthDate: "2018-01-01",
      at: NOW,
    });

    expect(state.recordingAllowed).toBe(true);
    expect(state.transcriptionAllowed).toBe(true);
    expect(state.minorGuardianAuthorizationValid).toBe(true);
  });

  it("adolescente com autorização mas sem anuência continua bloqueado", () => {
    const { state, denials } = resolveConsentStateFromRows({
      rows: allCaptureConsents({ guardian_authorization: true }),
      birthDate: "2012-01-01",
      at: NOW,
    });

    expect(state.recordingAllowed).toBe(false);
    expect(denials.session_recording).toBe("minor_assent_missing");
    expect(state.minorAssentRecorded).toBe(false);
  });

  it("adolescente com autorização e anuência é liberado", () => {
    const { state } = resolveConsentStateFromRows({
      rows: allCaptureConsents({ guardian_authorization: true, patient_assent: true }),
      birthDate: "2012-01-01",
      at: NOW,
    });

    expect(state.recordingAllowed).toBe(true);
    expect(state.minorGuardianAuthorizationValid).toBe(true);
    expect(state.minorAssentRecorded).toBe(true);
  });

  it("data de nascimento ausente bloqueia tudo (fail closed)", () => {
    const { state, denials } = resolveConsentStateFromRows({
      rows: allCaptureConsents(),
      birthDate: null,
      at: NOW,
    });

    expect(state.recordingAllowed).toBe(false);
    expect(denials.session_recording).toBe("birth_date_missing");
  });

  it("ConsentState não carrega nenhum campo narrativo sobre a recusa", () => {
    const { state } = resolveConsentStateFromRows({
      rows: [],
      birthDate: "1990-05-10",
      at: NOW,
    });

    // Recusa não pode viajar para a formulação clínica como "resistência":
    // o DTO exposto é só booleano/versão/data.
    expect(Object.keys(state).sort()).toEqual(
      ["aiProcessingAllowed", "recordingAllowed", "transcriptionAllowed"].sort(),
    );
    expect(JSON.stringify(state)).not.toMatch(/reason|motivo|resist/i);
  });
});

describe("evaluateCaptureCapability", () => {
  const capabilities = [
    "session_capture_grant",
    "session_remote_transcription_grant",
    "audio_fallback_upload_grant",
  ] as const;

  it("nega as capabilities de captura quando não há consentimento", () => {
    const resolution = resolveConsentStateFromRows({
      rows: [],
      birthDate: "1990-05-10",
      at: NOW,
    });

    for (const capability of capabilities) {
      const decision = evaluateCaptureCapability(resolution, capability);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("consent_missing");
    }
  });

  it("consentimento revogado nega token live E signed upload grant do fallback", () => {
    const rows = allCaptureConsents();
    rows[1] = consent({
      type: "session_recording",
      status: "revoked",
      revoked_at: "2026-08-10T10:00:00.000Z",
    });
    const resolution = resolveConsentStateFromRows({
      rows,
      birthDate: "1990-05-10",
      at: NOW,
    });

    for (const capability of capabilities) {
      const decision = evaluateCaptureCapability(resolution, capability);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("consent_revoked");
    }
  });

  it("transcrição sem consentimento bloqueia mesmo com gravação liberada", () => {
    const rows = [
      consent({ type: "session_recording", id: "b1111111-1111-4111-8111-111111111111" }),
    ];
    const resolution = resolveConsentStateFromRows({
      rows,
      birthDate: "1990-05-10",
      at: NOW,
    });

    const decision = evaluateCaptureCapability(resolution, "session_capture_grant");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("consent_missing");
  });

  it("versão antiga de transcrição não autoriza captura", () => {
    const rows = allCaptureConsents();
    rows[2] = consent({
      type: "session_transcription",
      id: "c1111111-1111-4111-8111-111111111111",
      version: "minimo-2026-08",
    });
    const { state, denials } = resolveConsentStateFromRows({
      rows,
      birthDate: "1990-05-10",
      at: NOW,
    });
    expect(state.transcriptionAllowed).toBe(false);
    expect(denials.session_transcription).toBe("consent_outdated");
    expect(
      evaluateCaptureCapability(
        { state, denials, ageGroup: "adult" },
        "session_remote_transcription_grant",
      ).allowed,
    ).toBe(false);
  });

  it("libera as capabilities de captura com gravação e transcrição válidas", () => {
    const resolution = resolveConsentStateFromRows({
      rows: allCaptureConsents(),
      birthDate: "1990-05-10",
      at: NOW,
    });

    for (const capability of capabilities) {
      expect(evaluateCaptureCapability(resolution, capability).allowed).toBe(true);
    }
  });
});
