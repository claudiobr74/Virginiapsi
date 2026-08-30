import { NEVER_INVENT_BASE, section, type SystemTemplateDefinition } from "../types";

export const minorAuthorization: SystemTemplateDefinition = {
  key: "minor_authorization",
  version: "1.0.0",
  name: "Autorização para atendimento de menor",
  description:
    "Autorização do responsável legal para acompanhamento psicológico de criança ou adolescente, com limites de sigilo e sem prometer acesso irrestrito às sessões.",
  category: "termos",
  documentKind: "autorizacao",
  intendedRecipients: ["responsável", "instituição quando cabível"],
  commonPurposes: ["autorização de atendimento", "início de psicoterapia infantojuvenil"],
  recommendedLength: "completo",
  defaultVisualProfile: "institucional",
  supportsCover: false,
  searchTerms: ["menor", "autorização", "criança", "adolescente", "responsável", "guarda"],
  requiredData: ["patient.name", "guardian.name"],
  optionalData: ["guardian.relationship", "school"],
  requiredSections: ["identificacao", "autorizacao", "sigilo_limites", "comunicacao", "ciencia"],
  optionalSections: ["documentos"],
  regulatoryGuidance:
    "Não promete ao responsável o conteúdo integral das sessões. Distingue autorização de organização do serviço e consentimentos específicos (IA, gravação, TCLE).",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: [...NEVER_INVENT_BASE, "guarda judicial não documentada"],
    issuanceChecklist: ["Responsável", "Pessoa menor", "Limites de sigilo", "Revisão"],
  },
  aiInstructions:
    "Linguagem clara ao responsável, sem juridiquês vazio. Não afirme guarda ou poder familiar que não esteja no contexto. Preserve intimidade do menor.",
  interviewPrompts: [
    "Quem é o responsável e qual o vínculo?",
    "Há particularidades de guarda ou de comunicação entre responsáveis?",
    "Quais comunicações institucionais (escola) estão autorizadas, se houver?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    return [
      section(
        0,
        "Identificação",
        `Pessoa em acompanhamento (criança ou adolescente): ${name}
Data de nascimento: {{patient.birth_date}}

Responsável legal:
Nome: {{guardian.name}}
CPF: {{guardian.cpf}}
Vínculo: {{guardian.relationship}}
Telefone: {{guardian.phone}}
E-mail: {{guardian.email}}

Profissional: {{professional.name}} · {{professional.crp}}
{{organization.name}}`,
      ),
      section(
        1,
        "Autorização",
        `Autorizo o acompanhamento psicológico de ${name} pela profissional identificada, nas condições organizacionais que vierem a ser combinadas (frequência, modalidade presencial e/ou online, honorários quando aplicáveis).

Esta autorização destina-se à viabilização do atendimento e não substitui contrato de prestação de serviço, termos específicos de gravação, consentimento para apoio por inteligência artificial ou outros instrumentos que a clínica utilizar.`,
      ),
      section(
        2,
        "Participação, intimidade e comunicação com responsáveis",
        `O processo psicoterapêutico de crianças e adolescentes considera o melhor interesse da pessoa em desenvolvimento e sua participação em grau compatível com idade e maturidade.

O responsável será informado sobre aspectos organizacionais do acompanhamento e sobre situações que, à luz das normas profissionais e da proteção da pessoa atendida, demandem comunicação. Isso não significa acesso irrestrito ao conteúdo das sessões, nem transcrição habitual do que é dito nos encontros.

Dúvidas sobre os limites do sigilo e sobre o que pode ser compartilhado devem ser esclarecidas com a profissional, inclusive em conversa conjunta quando isso for tecnicamente indicado.`,
      ),
      section(
        3,
        "Ciência",
        `Declaro que li este instrumento, tive oportunidade de esclarecer dúvidas e autorizo o atendimento nos termos acima.

{{organization.city}}, {{date.today}}.`,
      ),
    ];
  },
};
