import { NEVER_INVENT_BASE, section, type SystemTemplateDefinition } from "../types";

export const psychologicalCertificate: SystemTemplateDefinition = {
  key: "psychological_certificate",
  version: "1.0.0",
  name: "Atestado psicológico",
  description:
    "Documento de maior risco ético. Só deve ser emitido quando houver fundamentação técnica suficiente, com texto desenvolvido e limitado à finalidade.",
  category: "atestados",
  documentKind: "atestado",
  intendedRecipients: ["paciente", "instituição", "empresa", "órgão solicitante"],
  commonPurposes: ["atestado psicológico", "finalidade informada pelo solicitante"],
  recommendedLength: "completo",
  defaultVisualProfile: "clinica",
  supportsCover: false,
  searchTerms: ["atestado", "atestado psicológico", "CFP", "afastamento"],
  requiredData: ["patient.name", "document.purpose"],
  optionalData: ["period", "limitations_stated_without_diagnosis"],
  requiredSections: ["identificacao", "finalidade", "fundamentacao", "conteudo", "limites", "fechamento"],
  optionalSections: ["validade", "observacoes"],
  regulatoryGuidance:
    "Atestado psicológico exige fundamentação técnica. Não utilizar para comunicar diagnóstico nosológico, CID ou DSM. A IA não decide se há fundamentação — a profissional confirma antes da emissão.",
  guardrails: {
    requiresPatient: true,
    requiresTechnicalFoundation: true,
    allowsMissingPatient: false,
    neverInvent: [...NEVER_INVENT_BASE, "afastamento não fundamentado", "incapacidade"],
    issuanceChecklist: [
      "Confirmação de fundamentação técnica",
      "Finalidade",
      "Ausência de diagnóstico nosológico",
      "Revisão integral",
      "Preview conferido",
    ],
  },
  aiInstructions:
    "Nunca afirme diagnóstico, CID, DSM, incapacidade laboral ou necessidade de afastamento se isso não estiver explicitamente no contexto profissional confirmado. Prefira linguagem de acompanhamento e limites do documento. Se faltar fundamentação, peça revisão humana em vez de completar o atestado.",
  interviewPrompts: [
    "Qual é a finalidade informada para este atestado?",
    "Há fundamentação técnica suficiente nos registros?",
    "O que pode ser afirmado com segurança, sem extrapolar?",
    "Há período a que o documento se refere?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    const purpose = ctx.purpose || "{{document.purpose}}";
    return [
      section(
        0,
        "Identificação e finalidade",
        `Este Atestado Psicológico refere-se a ${name} e é elaborado a pedido da pessoa interessada, para a finalidade de ${purpose}.

O documento restringe-se às informações estritamente necessárias a essa finalidade, em linguagem técnica e prudente, sem a pretensão de substituir avaliação médica, perícia ou outros atos profissionais que não competem a este registro.`,
      ),
      section(
        1,
        "Fundamentação e conteúdo",
        `A emissão deste atestado considera os registros profissionais disponíveis e a avaliação técnica da signatária quanto à pertinência de atestar, para a finalidade informada, os elementos que efetivamente puderam ser observados no exercício da psicologia.

{{certificate.substantive_paragraph}}

Não se inclui neste documento diagnóstico nosológico, classificação CID/DSM, juízo sobre capacidade laboral irrestrita, nem recomendações que ultrapassem o que a fundamentação disponível autoriza. Eventuais lacunas de informação foram consideradas limitadoras do alcance do atestado, e não preenchidas por suposição.`,
      ),
      section(
        2,
        "Limites",
        `Este atestado não se confunde com laudo psicológico, relatório psicológico ou parecer. Sua validade informativa vincula-se à finalidade declarada e ao contexto em que foi solicitado. Qualquer uso diverso do informado deverá ser objeto de nova análise e, se cabível, de novo documento.`,
      ),
      section(
        3,
        "Fechamento",
        `{{organization.city}}, {{date.today}}.`,
      ),
    ];
  },
};
