import { NEVER_INVENT_BASE, section, type SystemTemplateDefinition } from "../types";

export const psychologicalLaudo: SystemTemplateDefinition = {
  key: "psychological_laudo",
  version: "1.0.0",
  name: "Laudo psicológico",
  description:
    "Documento de risco máximo, vinculado a processo de avaliação psicológica compatível. Não pode nascer de uma sessão comum nem inventar testes, resultados ou diagnósticos.",
  category: "avaliacao",
  documentKind: "laudo",
  intendedRecipients: ["solicitante formal", "instituição", "paciente", "responsável"],
  commonPurposes: ["avaliação psicológica formal", "resposta a solicitação fundamentada"],
  recommendedLength: "detalhado",
  defaultVisualProfile: "premium",
  supportsCover: true,
  searchTerms: ["laudo", "laudo psicológico", "avaliação psicológica", "testes"],
  requiredData: ["patient.name", "document.purpose", "assessment.compatible_confirmed"],
  optionalData: ["instruments.only_if_applied", "requester"],
  requiredSections: [
    "identificacao",
    "descricao_demanda",
    "procedimentos_avaliativos",
    "analise",
    "conclusao",
  ],
  optionalSections: ["referencias", "validade"],
  regulatoryGuidance:
    "Exige confirmação humana de que houve avaliação psicológica compatível. Instrumentos só entram se aplicados. Diagnóstico nosológico não é preenchido por IA.",
  guardrails: {
    requiresPatient: true,
    requiresCompatibleAssessment: true,
    allowsMissingPatient: false,
    neverInvent: [
      ...NEVER_INVENT_BASE,
      "instrumentos",
      "escores",
      "normas de teste",
      "diagnóstico",
    ],
    issuanceChecklist: [
      "Confirmação de avaliação psicológica compatível",
      "Finalidade",
      "Instrumentos só se aplicados",
      "Revisão integral",
      "Preview conferido",
    ],
  },
  aiInstructions:
    "Se não houver lista de instrumentos aplicados no contexto, não nomeie testes. Não invente resultados, QI, classificações ou CID. Estruture demanda, procedimentos avaliativos realmente descritos, análise prudente e conclusão. Marque lacunas.",
  interviewPrompts: [
    "Houve processo de avaliação psicológica compatível com um laudo?",
    "Qual a questão avaliativa e a finalidade?",
    "Quais procedimentos e, se houver, instrumentos realmente aplicados?",
    "O que a análise pode afirmar e o que permanece inconclusivo?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    return [
      section(
        0,
        "Identificação",
        `Laudo Psicológico referente a ${name}, elaborado exclusivamente no contexto de processo de avaliação psicológica compatível com este tipo de documento.

Solicitante: {{recipient.name}}.
Finalidade: {{document.purpose}}.

Este laudo não se origina de um atendimento psicoterapêutico isolado. Sua emissão pressupõe que a profissional confirma a existência de avaliação psicológica adequada à finalidade. Na ausência dessa confirmação, o documento não deve ser emitido.`,
      ),
      section(
        1,
        "Descrição da demanda",
        `A questão avaliativa que orientou este trabalho é apresentada a seguir, nos termos em que foi formulada e com os limites do que pôde ser efetivamente investigado.

{{laudo.demand}}`,
      ),
      section(
        2,
        "Procedimentos",
        `Os procedimentos avaliativos efetivamente realizados — entrevistas, observação, análise de documentos e, somente se aplicáveis e registrados, instrumentos psicológicos — são descritos a seguir. A listagem não é padronizada: inclui apenas o que ocorreu.

{{laudo.procedures}}

Não se afirmam resultados de testes, índices ou classificações que não constem dos registros da avaliação. Referências bibliográficas, quando necessárias, restringem-se a fontes efetivamente utilizadas pela profissional.`,
      ),
      section(
        3,
        "Análise",
        `{{laudo.analysis}}`,
        "analysis",
      ),
      section(
        4,
        "Conclusão",
        `{{laudo.conclusion}}

A conclusão responde à finalidade e à questão avaliativa, explicitando margens de incerteza. Este laudo não substitui documentos de outras profissões nem decisões administrativas, judiciais ou escolares que ultrapassem a competência da psicologia.

{{organization.city}}, {{date.today}}.`,
        "conclusion",
      ),
    ];
  },
};
