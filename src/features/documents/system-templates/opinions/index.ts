import { NEVER_INVENT_BASE, section, type SystemTemplateDefinition } from "../types";

export const psychologicalOpinion: SystemTemplateDefinition = {
  key: "psychological_opinion",
  version: "1.0.0",
  name: "Parecer psicológico",
  description:
    "Manifestação técnica sobre questão-problema, com análise e conclusão. Pode existir sem paciente vinculado quando a consulta for estritamente técnica e não exigir identificação de pessoa atendida.",
  category: "pareceres",
  documentKind: "parecer",
  intendedRecipients: ["solicitante", "instituição", "outro profissional"],
  commonPurposes: ["resposta a quesito", "consulta técnica", "esclarecimento de questão-problema"],
  recommendedLength: "completo",
  defaultVisualProfile: "premium",
  supportsCover: true,
  searchTerms: ["parecer", "quesito", "questão-problema", "parecer técnico"],
  requiredData: ["document.purpose", "opinion.question"],
  optionalData: ["patient.name", "recipient.name"],
  requiredSections: ["quesito", "analise", "conclusao", "referencias"],
  optionalSections: ["identificacao_quando_houver"],
  regulatoryGuidance:
    "Parecer exige questão-problema, análise, conclusão e referências quando utilizadas. Pode ser emitido sem patient_id. Não se presta a atestar fatos não examinados.",
  guardrails: {
    requiresPatient: false,
    allowsMissingPatient: true,
    neverInvent: [...NEVER_INVENT_BASE, "fatos não submetidos a exame"],
    issuanceChecklist: ["Questão-problema", "Análise", "Conclusão", "Revisão"],
  },
  aiInstructions:
    "Estruture resposta ao quesito. Não crie pessoa atendida se não houver. Não invente literatura: se não houver referências no contexto, deixe a seção para a profissional completar ou indique que não foram mobilizadas fontes além da normativa geral da profissão, sem citar artigos fictícios.",
  interviewPrompts: [
    "Qual é a questão-problema ou o quesito?",
    "Há pessoa atendida identificada neste parecer, ou é consulta técnica sem paciente?",
    "Que elementos de análise estão disponíveis?",
    "Qual conclusão responde ao quesito, com que limites?",
  ],
  buildSections: (ctx) => [
    section(
      0,
      "Objeto e questão-problema",
      `Este Parecer Psicológico responde à questão-problema formulada a seguir, no limite da competência da psicologia e das informações efetivamente submetidas a exame.

Solicitante: ${ctx.recipientName || "{{recipient.name}}"}.
Finalidade: ${ctx.purpose || "{{document.purpose}}"}.
Pessoa a que se refere, quando houver: ${ctx.patientName || "{{patient.full_name}}"}.

Questão-problema / quesito:

{{opinion.question}}`,
    ),
    section(
      1,
      "Análise",
      `A análise considera os elementos apresentados, os princípios técnicos e éticos aplicáveis e as limitações do material disponível. Distingue-se o que foi examinado do que permanece fora do alcance deste parecer.

{{opinion.analysis}}`,
      "analysis",
    ),
    section(
      2,
      "Conclusão",
      `{{opinion.conclusion}}

A conclusão não se estende a fatos, pessoas ou documentos não examinados, nem substitui laudo quando a finalidade exigir processo de avaliação psicológica específico.`,
      "conclusion",
    ),
    section(
      3,
      "Referências e fechamento",
      `{{opinion.references}}

{{organization.city}}, {{date.today}}.`,
      "references",
    ),
  ],
};
