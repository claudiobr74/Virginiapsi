import { NEVER_INVENT_BASE, section, type SystemTemplateDefinition } from "../types";

export const declarationAttendance: SystemTemplateDefinition = {
  key: "declaration_attendance",
  version: "1.0.0",
  name: "Declaração de comparecimento",
  description:
    "Declara, com linguagem profissional e limitada à finalidade, o comparecimento da pessoa atendida a encontro(s) psicológico(s).",
  category: "declaracoes",
  documentKind: "declaracao",
  intendedRecipients: ["paciente", "responsável", "empresa", "instituição"],
  commonPurposes: ["comprovação de comparecimento", "trabalho", "estudo"],
  recommendedLength: "objetivo",
  defaultVisualProfile: "essencial",
  supportsCover: false,
  searchTerms: ["declaração", "comparecimento", "empresa", "falta justificada", "atestado de presença"],
  requiredData: ["patient.name", "document.purpose", "date.today"],
  optionalData: ["session.date", "session.time_range", "companion.name"],
  requiredSections: ["identificacao", "declaracao", "finalidade", "fechamento"],
  optionalSections: ["observacoes"],
  regulatoryGuidance:
    "Declaração regulamentada: informar somente o necessário à finalidade declarada, sem conteúdo clínico íntimo, diagnóstico ou síntese de processo.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: NEVER_INVENT_BASE,
    issuanceChecklist: ["Identificação", "Finalidade", "Datas somente se registradas", "Revisão"],
  },
  aiInstructions:
    "Redija uma declaração fluida, em um ou dois parágrafos, sem bullets. Não descreva demanda clínica, evolução, técnicas ou hipóteses. Se a data/horário do encontro não estiver no contexto, deixe marca de revisão.",
  interviewPrompts: [
    "Qual é a finalidade desta declaração?",
    "O comparecimento refere-se a qual data (se já registrada)?",
    "Há intervalo de horário que possa ser informado com segurança?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    const purpose = ctx.purpose || "{{document.purpose}}";
    return [
      section(
        0,
        "Declaração",
        `Declaro, para os devidos fins e a pedido da pessoa interessada, que ${name} compareceu a atendimento psicológico sob minha responsabilidade profissional.

O presente documento limita-se a comprovar o comparecimento, sem constituir avaliação psicológica, atestado de saúde mental, laudo ou juízo sobre capacidade, diagnóstico ou afastamento.

A declaração é emitida exclusivamente para a finalidade de ${purpose}, restringindo-se às informações necessárias a esse propósito.`,
      ),
      section(
        1,
        "Fechamento",
        `Por ser verdade, firmo a presente declaração.

{{organization.city}}, {{date.today}}.`,
      ),
    ];
  },
};

export const declarationFollowUp: SystemTemplateDefinition = {
  key: "declaration_psychological_follow_up",
  version: "1.0.0",
  name: "Declaração de acompanhamento psicológico",
  description:
    "Informa, de forma breve e profissional, que a pessoa se encontra em acompanhamento psicológico, sem transformar o texto em relatório clínico.",
  category: "declaracoes",
  documentKind: "declaracao",
  intendedRecipients: ["paciente", "escola", "empresa", "instituição", "plano de saúde"],
  commonPurposes: ["comprovação de acompanhamento", "escola", "trabalho", "cadastro institucional"],
  recommendedLength: "objetivo",
  defaultVisualProfile: "essencial",
  supportsCover: false,
  searchTerms: ["declaração", "acompanhamento", "período", "psicoterapia", "escola", "empresa"],
  requiredData: ["patient.name", "document.purpose"],
  optionalData: ["treatment.start_date", "treatment.frequency", "treatment.modality"],
  requiredSections: ["declaracao", "finalidade", "limites", "fechamento"],
  optionalSections: ["periodicidade"],
  regulatoryGuidance:
    "Não incluir conteúdo de sessão, hipóteses, diagnóstico ou recomendações clínicas detalhadas. A declaração não substitui relatório, atestado, laudo ou parecer.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: NEVER_INVENT_BASE,
    issuanceChecklist: ["Identificação", "Finalidade", "Início apenas se registrado", "Revisão"],
  },
  aiInstructions:
    "Texto corrido, sóbrio, de declaração. Não narre queixas nem evolução. Se data de início ou frequência não existirem no contexto, não invente — use formulação genérica ou marque revisão.",
  interviewPrompts: [
    "Qual é a finalidade?",
    "Há data de início do acompanhamento já registrada?",
    "A periodicidade atual pode ser informada?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    const purpose = ctx.purpose || "{{document.purpose}}";
    return [
      section(
        0,
        "Declaração",
        `Declaro, para os devidos fins e a pedido da pessoa interessada, que ${name} encontra-se em acompanhamento psicológico sob minha responsabilidade profissional${ctx.extra?.startDate ? `, com início em ${ctx.extra.startDate}` : " desde {{treatment.start_date}}"}.

Os atendimentos vêm sendo realizados em conformidade com a organização do serviço e com a periodicidade atualmente estabelecida${ctx.extra?.frequency ? ` (${ctx.extra.frequency})` : " ({{treatment.frequency}})"}, podendo essa organização ser revista ao longo do processo, conforme indicação técnica e acordo entre as partes.

O presente documento é emitido exclusivamente para a finalidade de ${purpose}, limitando-se às informações necessárias para esse propósito. Não substitui relatório psicológico, atestado psicológico, laudo ou parecer, nem autoriza inferências sobre diagnóstico, afastamento ou capacidade.`,
      ),
      section(
        1,
        "Fechamento",
        `Por ser verdade, firmo a presente.

{{organization.city}}, {{date.today}}.`,
      ),
    ];
  },
};
