import { NEVER_INVENT_BASE, section, type SystemTemplateDefinition } from "../types";

function referralTemplate(input: {
  key: string;
  name: string;
  specialtyLabel: string;
  specialtyToken: string;
  searchTerms: string[];
  extraGuidance: string;
}): SystemTemplateDefinition {
  return {
    key: input.key,
    version: "1.0.0",
    name: input.name,
    description: `Encaminhamento profissional desenvolvido para avaliação em ${input.specialtyLabel}, com justificativa, objetivo e convite à interlocução interdisciplinar — não apenas troca de título.`,
    category: "encaminhamentos",
    documentKind: "encaminhamento",
    intendedRecipients: ["profissional de saúde", input.specialtyLabel],
    commonPurposes: ["avaliação complementar", "cuidado compartilhado", "interconsulta"],
    recommendedLength: "completo",
    defaultVisualProfile: "clinica",
    supportsCover: false,
    searchTerms: input.searchTerms,
    requiredData: ["patient.name", "referral.reason", "referral.objective"],
    optionalData: ["recipient.name"],
    requiredSections: ["abertura", "justificativa", "objetivo", "continuidade", "encerramento"],
    optionalSections: ["antecedentes_minimos"],
    regulatoryGuidance: input.extraGuidance,
    guardrails: {
      requiresPatient: true,
      allowsMissingPatient: false,
      neverInvent: [...NEVER_INVENT_BASE, "achados da especialidade de destino"],
      issuanceChecklist: ["Especialidade", "Motivo", "Objetivo", "Revisão"],
    },
    aiInstructions: `Tom de carta a colega. Especialidade: ${input.specialtyLabel}. Não antecipe diagnóstico da especialidade de destino. Não transcreva sessão. Justifique com o que está no contexto.`,
    interviewPrompts: [
      "Qual o motivo do encaminhamento, em termos técnicos e parcimoniosos?",
      "Qual o objetivo da avaliação solicitada?",
      "A pessoa permanece em acompanhamento psicológico?",
    ],
    buildSections: (ctx) => {
      const name = ctx.patientName || "{{patient.full_name}}";
      const recipient = ctx.recipientName ? `Prezado(a) ${ctx.recipientName}` : "Prezado(a) colega";
      return [
        section(
          0,
          "Encaminhamento",
          `${recipient},

Encaminho ${name}, atualmente em acompanhamento psicológico, para avaliação na especialidade de ${input.specialtyToken}.

Ao longo do acompanhamento foram identificados aspectos que justificam avaliação complementar, especialmente em relação a {{referral.reason}}.

O presente encaminhamento tem por objetivo {{referral.objective}}.`,
        ),
        section(
          1,
          "Contexto pertinente e continuidade",
          `A pessoa permanece em acompanhamento psicológico, e considero que a avaliação solicitada poderá contribuir para a compreensão e condução integrada do caso, sem que este encaminhamento substitua o juízo próprio da especialidade de destino.

{{referral.relevant_context}}

Permaneço à disposição para comunicação interdisciplinar, respeitados os limites técnicos, éticos e de confidencialidade pertinentes.

{{professional.name}}
{{professional.crp}}
{{organization.city}}, {{date.today}}.`,
        ),
      ];
    },
  };
}

export const referralGeneric = referralTemplate({
  key: "referral_generic",
  name: "Encaminhamento a outro profissional",
  specialtyLabel: "outra especialidade / outro profissional",
  specialtyToken: "{{referral.specialty}}",
  searchTerms: ["encaminhamento", "interconsulta", "outro profissional", "especialidade"],
  extraGuidance:
    "Template-base de encaminhamento clínico. A especialidade é campo editável. Não usar como laudo.",
});

export const referralPsychiatry = referralTemplate({
  key: "referral_psychiatry",
  name: "Encaminhamento para psiquiatria",
  specialtyLabel: "psiquiatria",
  specialtyToken: "Psiquiatria",
  searchTerms: ["encaminhar psiquiatra", "psiquiatria", "encaminhamento psiquiátrico"],
  extraGuidance:
    "Não sugerir fármaco nem diagnóstico psiquiátrico. Justificar a pertinência da avaliação psiquiátrica com o que o processo psicológico revelou, de forma mínima e técnica.",
});
