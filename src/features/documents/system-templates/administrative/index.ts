import { NEVER_INVENT_BASE, section, type SystemTemplateDefinition } from "../types";

export const documentRequest: SystemTemplateDefinition = {
  key: "document_request",
  version: "1.0.0",
  name: "Requerimento de documento",
  description:
    "Pedido formal de elaboração de documento profissional, registrando finalidade, destinatário e prazo pretendido, sem garantir emissão automática.",
  category: "administrativos",
  documentKind: "requerimento",
  intendedRecipients: ["paciente", "responsável", "arquivo interno"],
  commonPurposes: ["solicitar declaração", "solicitar relatório", "registrar pedido"],
  recommendedLength: "objetivo",
  defaultVisualProfile: "essencial",
  supportsCover: false,
  searchTerms: ["requerimento", "solicitar documento", "pedido de relatório", "pedido de declaração"],
  requiredData: ["patient.name", "document.purpose", "requested.kind"],
  optionalData: ["deadline"],
  requiredSections: ["solicitacao", "finalidade", "ciencia_prazo"],
  optionalSections: ["observacoes"],
  regulatoryGuidance:
    "O requerimento não obriga a profissional a emitir documento inadequado à finalidade ou sem fundamentação. Relatórios, atestados e laudos seguem normas próprias.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: NEVER_INVENT_BASE,
    issuanceChecklist: ["Tipo solicitado", "Finalidade", "Revisão"],
  },
  aiInstructions:
    "Texto administrativo claro. Não prometa prazo de laudo/atestado. Não antecipe o conteúdo do documento pedido.",
  interviewPrompts: [
    "Qual documento está sendo pedido?",
    "Qual a finalidade e o destinatário?",
    "Há prazo pretendido, sem caráter de garantia?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    return [
      section(
        0,
        "Requerimento",
        `Requer-se a elaboração de documento profissional referente a ${name}.

Tipo solicitado: {{requested.kind}}.
Destinatário pretendido: {{recipient.name}}.
Finalidade informada: {{document.purpose}}.
Prazo pretendido (sem caráter de garantia): {{requested.deadline}}.

O pedido será analisado à luz da finalidade, dos registros disponíveis e das normas profissionais aplicáveis. A profissional poderá orientar a escolha de outro tipo de documento, solicitar esclarecimentos ou recusar emissão quando o pedido for incompatível com a ética, a técnica ou a fundamentação disponível.`,
      ),
      section(
        1,
        "Ciência",
        `Estou ciente de que a emissão de documentos psicológicos pode exigir tempo de análise e revisão, e de que o presente requerimento não substitui o documento pedido nem assegura determinado conteúdo.

{{organization.city}}, {{date.today}}.`,
      ),
    ];
  },
};

export const deliveryProtocol: SystemTemplateDefinition = {
  key: "delivery_protocol",
  version: "1.0.0",
  name: "Protocolo de entrega",
  description:
    "Registro de entrega de documento: destinatário, data, método, recebimento e eventual devolutiva. Não depende de WhatsApp/Twilio.",
  category: "administrativos",
  documentKind: "protocolo",
  intendedRecipients: ["arquivo interno", "destinatário"],
  commonPurposes: ["comprovar entrega", "registrar devolutiva"],
  recommendedLength: "objetivo",
  defaultVisualProfile: "essencial",
  supportsCover: false,
  searchTerms: ["protocolo", "entrega", "devolutiva", "recebimento"],
  requiredData: ["document.ref", "recipient.name", "delivery.method"],
  optionalData: ["devolution"],
  requiredSections: ["identificacao", "entrega", "recebimento"],
  optionalSections: ["devolutiva"],
  regulatoryGuidance:
    "Protocolo administrativo. Não descreve conteúdo clínico do documento entregue. Métodos: presencial, download seguro, e-mail ou outro — sem Twilio.",
  guardrails: {
    requiresPatient: false,
    allowsMissingPatient: true,
    neverInvent: NEVER_INVENT_BASE,
    issuanceChecklist: ["Destinatário", "Método", "Data"],
  },
  aiInstructions:
    "Não transcreva o documento entregue. Apenas identifique tipo, destinatário e circunstâncias da entrega.",
  interviewPrompts: [
    "Qual documento foi entregue (tipo e identificação)?",
    "Quem recebeu, quando e por qual método?",
    "Houve confirmação de recebimento ou devolutiva?",
  ],
  buildSections: (ctx) => [
    section(
      0,
      "Protocolo",
      `Registro de entrega de documento profissional.

Documento / tipo: {{delivered.document_title}}
Pessoa a que se refere, quando houver: ${ctx.patientName || "{{patient.full_name}}"}
Destinatário: {{recipient.name}}
Data da entrega: {{delivery.date}}
Método: {{delivery.method}}
Recebimento confirmado: {{delivery.receipt_confirmed}}

Observação (sem reproduzir conteúdo clínico): {{delivery.notes}}`,
    ),
    section(
      1,
      "Devolutiva",
      `Devolutiva realizada: {{delivery.devolution_done}}
Data da devolutiva, quando houver: {{delivery.devolution_at}}

Este protocolo não substitui o documento entregue e não constitui comprovante fiscal.

{{organization.city}}, {{date.today}}.`,
    ),
  ],
};
