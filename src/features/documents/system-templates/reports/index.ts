import { NEVER_INVENT_BASE, section, type SystemTemplateDefinition } from "../types";

const REPORT_NEVER = [
  ...NEVER_INVENT_BASE,
  "instrumentos não aplicados",
  "resultados de teste",
  "medicamentos",
];

export const psychologicalReport: SystemTemplateDefinition = {
  key: "psychological_report_complete",
  version: "1.0.0",
  name: "Relatório psicológico completo",
  description:
    "Relatório psicológico com identificação, descrição da demanda, procedimentos, análise e conclusão em narrativa desenvolvida, adequado a destinatário e finalidade.",
  category: "relatorios",
  documentKind: "relatorio",
  intendedRecipients: ["paciente", "responsável", "profissional de saúde", "instituição"],
  commonPurposes: ["continuidade do cuidado", "comunicação formal", "registro técnico da finalidade"],
  recommendedLength: "detalhado",
  defaultVisualProfile: "clinica",
  supportsCover: true,
  searchTerms: ["relatório psicológico", "relatorio", "CFP 06/2019", "análise", "conclusão"],
  requiredData: ["patient.name", "document.purpose"],
  optionalData: ["recipient.name", "treatment.start_date", "sessions.count"],
  requiredSections: ["identificacao", "demanda", "procedimentos", "analise", "conclusao"],
  optionalSections: ["referencias", "validade", "observacoes"],
  regulatoryGuidance:
    "Estrutura compatível com documento psicológico regulamentado: identificação, demanda, procedimentos, análise e conclusão. Sem copiar manuais. Sem autoescrever no prontuário.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: REPORT_NEVER,
    issuanceChecklist: [
      "Identificação",
      "Solicitante",
      "Finalidade",
      "Sem placeholders",
      "Revisão integral",
      "Preview conferido",
    ],
  },
  aiInstructions:
    "Cada seção deve ser parágrafo(s) corrido(s), não rótulos com uma linha. Procedimentos: narre o acompanhamento com periodicidade e número de encontros só se estiverem no contexto. Análise: desenvolva apenas os blocos selecionados. Não invente testes, técnicas nomeadas, diagnósticos ou citações.",
  interviewPrompts: [
    "Qual é a finalidade e quem é o destinatário?",
    "Qual foi a demanda, em termos adequados a essa finalidade?",
    "Quais procedimentos realmente ocorreram e estão registrados?",
    "Qual evolução pode ser descrita sem extrapolar?",
    "O que permanece relevante e qual é a conclusão técnica?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    const purpose = ctx.purpose || "{{document.purpose}}";
    const recipient = ctx.recipientName || "{{recipient.name}}";
    return [
      section(
        0,
        "Identificação",
        `Este Relatório Psicológico refere-se a ${name} e é elaborado por profissional de psicologia devidamente habilitada, no exercício de suas atribuições.

Destinatário / solicitante: ${recipient}.
Finalidade informada: ${purpose}.

As informações aqui apresentadas restringem-se ao necessário para a finalidade declarada, com linguagem técnica, prudente e compatível com os registros disponíveis. Conteúdos íntimos, irrelevantes à finalidade ou não sustentados pelos registros não são incluídos.`,
      ),
      section(
        1,
        "Descrição da demanda",
        `A pessoa atendida iniciou acompanhamento psicológico diante de queixas e necessidades apresentadas no contexto do atendimento, cuja compreensão foi sendo construída ao longo dos encontros, considerando-se aspectos emocionais, relacionais e contextuais relevantes à finalidade deste documento.

{{demand.narrative}}

A origem da demanda e o modo como ela se apresenta na rotina foram considerados na organização do trabalho psicológico, sem que este relatório pretenda esgotar a complexidade do caso nem substituir outros documentos quando a finalidade for distinta.`,
      ),
      section(
        2,
        "Procedimentos",
        `O acompanhamento foi desenvolvido por meio de atendimentos psicológicos, realizados de acordo com a modalidade e a periodicidade estabelecidas para o caso.

No período considerado para este documento, foram realizados {{sessions.count}} encontros, quando essa informação estiver registrada. As intervenções foram conduzidas segundo referenciais técnicos compatíveis com a atuação da profissional e com as necessidades identificadas no decorrer do processo. Técnicas, instrumentos ou procedimentos específicos somente são mencionados quando efetivamente realizados e confirmados nos registros — não se presume aplicação de testes, protocolos ou métodos não documentados.

{{procedures.narrative}}`,
      ),
      section(
        3,
        "Análise",
        `A análise a seguir organiza, em texto corrido, os aspectos selecionados como pertinentes à finalidade do documento. Não se trata de listagem de sintomas nem de diagnóstico. Hipóteses eventuais, quando presentes, distinguem-se do que foi observado ou relatado.

{{analysis.narrative}}

Foram considerados, conforme selecionado pela profissional, elementos do funcionamento emocional, aspectos cognitivos e comportamentais, relações interpessoais, contextos de vida relevantes, recursos e fatores de proteção, vulnerabilidades e a evolução observada no período, sempre limitados ao que os registros sustentam.`,
        "analysis",
      ),
      section(
        4,
        "Conclusão",
        `À luz da finalidade informada, dos procedimentos realizados e da análise precedente, apresenta-se a síntese técnica a seguir, em mais de um parágrafo quando a complexidade do caso o exigir.

{{conclusion.narrative}}

As recomendações, quando houver, restringem-se ao campo da psicologia e à continuidade do cuidado, sem prescrever condutas de outras profissões nem garantir resultados. Este relatório não substitui laudo, atestado, parecer ou decisão institucional alheia à competência da signatária.`,
        "conclusion",
      ),
      section(
        5,
        "Fechamento",
        `{{organization.city}}, {{date.today}}.

Este documento poderá ser complementado ou substituído por nova versão caso a finalidade, o período considerado ou os registros disponíveis se alterem de modo relevante.`,
      ),
    ];
  },
};

export const reportToPhysician: SystemTemplateDefinition = {
  key: "report_to_physician",
  version: "1.0.0",
  name: "Relatório para médico",
  description:
    "Comunicação interdisciplinar ao médico, com abertura editorial, foco no que é útil ao cuidado integrado e encerramento respeitoso dos limites éticos.",
  category: "relatorios",
  documentKind: "relatorio",
  intendedRecipients: ["médico"],
  commonPurposes: ["cuidado integrado", "contrarreferência", "atualização clínica"],
  recommendedLength: "completo",
  defaultVisualProfile: "clinica",
  supportsCover: false,
  searchTerms: ["relatório para médico", "médico", "interdisciplinar", "contrarreferência"],
  requiredData: ["patient.name", "recipient.name", "document.purpose"],
  optionalData: ["treatment.start_date"],
  requiredSections: ["abertura", "acompanhamento", "aspectos_relevantes", "encerramento"],
  optionalSections: ["solicitacoes_cuidadosas"],
  regulatoryGuidance:
    "Comunicação a outro profissional de saúde: mínimo necessário, sem conteúdo íntimo irrelevante, sem diagnosticar no lugar da medicina e sem sugerir condutas médicas.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: [...REPORT_NEVER, "conduta médica", "posologia"],
    issuanceChecklist: ["Destinatário", "Finalidade", "Revisão", "Preview"],
  },
  aiInstructions:
    "Tom interdisciplinar, cortesias profissionais, sem jargão interno de prontuário. Nunca sugira medicamento, exame ou diagnóstico médico. Não reproduza relatos íntimos desnecessários à articulação do cuidado.",
  interviewPrompts: [
    "Quem é o médico destinatário?",
    "Qual a finalidade desta comunicação?",
    "O que, do acompanhamento psicológico, é pertinente ao cuidado médico?",
    "Há pedido específico (esclarecimento, continuidade) dentro do limite ético?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    const recipient = ctx.recipientName || "{{recipient.name}}";
    const purpose = ctx.purpose || "{{document.purpose}}";
    return [
      section(
        0,
        "Comunicação",
        `Prezado(a) Dr(a). ${recipient},

${name} encontra-se em acompanhamento psicológico desde {{treatment.start_date}}.

O presente relatório é encaminhado com a finalidade de ${purpose}.

No contexto do acompanhamento psicológico, foram observados aspectos relevantes relacionados ao funcionamento emocional, à adesão ao processo e às repercussões na rotina, na medida em que tais elementos contribuem para a compreensão integrada do cuidado — sempre respeitados o sigilo profissional e o mínimo necessário à finalidade desta comunicação.

{{interdisciplinary.narrative}}`,
      ),
      section(
        1,
        "Síntese pertinente ao cuidado integrado",
        `Os encontros vêm ocorrendo em periodicidade {{treatment.frequency}}, na modalidade {{treatment.modality}}. A pessoa permanece em acompanhamento psicológico.

{{evolution.for_physician}}

Não compete a este relatório formular diagnóstico médico, sugerir terapêutica medicamentosa ou antecipar condutas de outra profissão. Eventuais hipóteses psicológicas, quando mencionadas, distinguem-se claramente de achados e não substituem avaliação médica.`,
      ),
      section(
        2,
        "Encerramento",
        `Considerando a importância do cuidado integrado, encaminham-se as presentes informações para contribuir com a continuidade da assistência.

Permaneço à disposição, dentro dos limites técnicos e éticos pertinentes, para eventuais esclarecimentos necessários.

Atenciosamente,

{{professional.name}}
{{professional.crp}}

{{organization.city}}, {{date.today}}.`,
      ),
    ];
  },
};

export const reportToPsychiatrist: SystemTemplateDefinition = {
  key: "report_to_psychiatrist",
  version: "1.0.0",
  name: "Relatório para psiquiatra",
  description:
    "Relatório próprio para articulação com a psiquiatria: ênfase em evolução do processo psicológico, adesão, risco quando documentado, sem invadir a conduta medicamentosa.",
  category: "relatorios",
  documentKind: "relatorio",
  intendedRecipients: ["psiquiatra"],
  commonPurposes: ["articulação com psiquiatria", "contrarreferência", "cuidado compartilhado"],
  recommendedLength: "completo",
  defaultVisualProfile: "clinica",
  supportsCover: false,
  searchTerms: ["psiquiatra", "psiquiatria", "relatório para psiquiatra", "medicamento"],
  requiredData: ["patient.name", "recipient.name", "document.purpose"],
  optionalData: ["treatment.start_date", "risk.documented"],
  requiredSections: ["abertura", "processo", "evolucao", "limites", "encerramento"],
  optionalSections: ["pontos_para_articulacao"],
  regulatoryGuidance:
    "Não inventar medicamentos, doses, adesão medicamentosa ou diagnósticos psiquiátricos. Risco só entra se documentado. Linguagem de articulação, não de prescrição.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: [...REPORT_NEVER, "fármaco", "dose", "diagnóstico psiquiátrico"],
    issuanceChecklist: ["Destinatário", "Finalidade", "Sem invenção de conduta médica", "Revisão"],
  },
  aiInstructions:
    "Nunca mencione fármaco, dose, classe medicamentosa ou diagnóstico psiquiátrico que não esteja no contexto. Se o contexto citar risco, mantenha a formulação prudente e atribua a fonte (relato/observação/registro). Convide articulação, não decida pela psiquiatria.",
  interviewPrompts: [
    "Quem é o(a) psiquiatra destinatário(a)?",
    "O que do processo psicoterapêutico é útil à articulação?",
    "Há informações de risco já registradas que precisem ser comunicadas com parcimônia?",
    "Há perguntas à psiquiatria que caibam nos limites éticos?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    const recipient = ctx.recipientName || "{{recipient.name}}";
    return [
      section(
        0,
        "Comunicação à psiquiatria",
        `Prezado(a) Dr(a). ${recipient},

Encaminho informações relativas ao acompanhamento psicológico de ${name}, em curso desde {{treatment.start_date}}, com a finalidade de {{document.purpose}}.

O objetivo desta comunicação é favorecer a articulação entre o processo psicoterapêutico e o cuidado psiquiátrico, quando este existir, sem sobrepor competências nem antecipar condutas medicamentosas ou diagnósticas da medicina.`,
      ),
      section(
        1,
        "Processo psicológico e evolução pertinente",
        `Os atendimentos vêm sendo realizados em periodicidade {{treatment.frequency}}. Ao longo do período considerado, o trabalho psicológico tem se organizado em torno das demandas apresentadas e da construção de recursos de regulação, compreensão e manejo das dificuldades trazidas à sessão.

{{psychiatry.relevant_course}}

Aspectos de adesão aos encontros psicológicos, quando descritos a seguir, referem-se exclusivamente à frequência e ao engajamento no processo psicoterapêutico, e não à adesão a tratamento medicamentoso — informação que não compete a este relatório afirmar sem registro específico e, ainda assim, apenas se for estritamente necessária à finalidade.`,
      ),
      section(
        2,
        "Limites e disponibilidade",
        `Não se incluem neste documento hipóteses diagnósticas psiquiátricas, sugestões de prescrição ou juízos sobre esquema medicamentoso. Informações de risco imediato, se presentes nos registros e pertinentes à articulação do cuidado, são comunicadas de forma objetiva e mínima.

Permaneço à disposição para interlocução interdisciplinar, observados sigilo, consentimento aplicável e o estritamente necessário à finalidade.

{{professional.name}} · {{professional.crp}}
{{organization.city}}, {{date.today}}.`,
      ),
    ];
  },
};

export const reportHealthPlan: SystemTemplateDefinition = {
  key: "report_health_plan",
  version: "1.0.0",
  name: "Relatório para plano de saúde",
  description:
    "Relatório administrativo-clínico parcimonioso para operadora: período, frequência, demanda em termos gerais, procedimentos, evolução, necessidade e justificativa, sem intimidade desnecessária.",
  category: "relatorios",
  documentKind: "relatorio",
  intendedRecipients: ["operadora de saúde"],
  commonPurposes: ["continuidade de autorização", "justificativa de acompanhamento", "prestação de contas técnica mínima"],
  recommendedLength: "completo",
  defaultVisualProfile: "institucional",
  supportsCover: false,
  searchTerms: ["plano de saúde", "operadora", "autorização", "convênio", "justificativa"],
  requiredData: ["patient.name", "document.purpose", "period"],
  optionalData: ["operator.name", "authorization.code", "sessions.count"],
  requiredSections: ["identificacao", "periodo", "demanda_geral", "procedimentos", "evolucao", "justificativa"],
  optionalSections: ["coparticipacao_info"],
  regulatoryGuidance:
    "Não promete cobertura. Evita conteúdo íntimo. Não usa o relatório como atestado de diagnóstico para o plano. Sem Receita Saúde.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: [...REPORT_NEVER, "cobertura", "código de autorização não informado"],
    issuanceChecklist: ["Finalidade junto à operadora", "Período", "Sem intimidade excessiva", "Revisão"],
  },
  aiInstructions:
    "Tom institucional e objetivo. Não detalhe vida sexual, conflitos familiares íntimos ou relatos traumáticos. Não afirme que o plano cobrirá. Se autorização/operadora não estiverem no contexto, não invente números.",
  interviewPrompts: [
    "Qual operadora e qual a finalidade junto ao plano?",
    "Qual período e frequência podem ser informados?",
    "Como descrever a demanda em termos gerais, sem excesso de intimidade?",
    "Qual justificativa técnica para continuidade, se for o caso?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    return [
      section(
        0,
        "Identificação e período",
        `Relatório elaborado para fins de comunicação com operadora de saúde, referente ao acompanhamento psicológico de ${name}.

Operadora / plano: {{health_plan.operator}} (quando informado).
Finalidade junto à operadora: {{document.purpose}}.
Período considerado: {{health_plan.period}}.
Frequência dos atendimentos no período: {{treatment.frequency}}.
Quantidade de encontros no período, quando registrada: {{sessions.count}}.

Este documento não constitui comprovante de cobertura, autorização de procedimento nem documento fiscal. A análise de cobertura compete à operadora, segundo regras contratuais próprias.`,
      ),
      section(
        1,
        "Demanda, procedimentos e evolução (mínimo necessário)",
        `A pessoa encontra-se em acompanhamento psicológico em razão de demandas apresentadas no contexto clínico, descritas aqui apenas no grau de generalidade compatível com a finalidade administrativa-clínica deste relatório.

{{health_plan.demand_general}}

Os procedimentos corresponderam a atendimento psicológico, na modalidade {{treatment.modality}}, com duração habitualmente combinada para os encontros. Não se descrevem conteúdos de sessão além do necessário à compreensão da continuidade do cuidado.

{{health_plan.evolution_general}}`,
      ),
      section(
        2,
        "Justificativa e recomendação",
        `{{health_plan.justification}}

A recomendação, quando houver continuidade, restringe-se à pertinência técnica do acompanhamento psicológico no período seguinte, sem garantir quantidade de sessões, reembolso ou deferimento pela operadora.

{{organization.city}}, {{date.today}}.`,
      ),
    ];
  },
};

export const reportSchool: SystemTemplateDefinition = {
  key: "report_school",
  version: "1.0.0",
  name: "Relatório escolar",
  description:
    "Documento para contexto escolar: funcionamento relevante, repercussões acadêmicas, recursos, dificuldades e recomendações, sem relatório clínico completo.",
  category: "relatorios",
  documentKind: "relatorio",
  intendedRecipients: ["escola", "coordenação pedagógica", "responsável"],
  commonPurposes: ["articulação escola-família-clínica", "orientação escolar", "adequações de rotina"],
  recommendedLength: "completo",
  defaultVisualProfile: "clinica",
  supportsCover: false,
  searchTerms: ["escola", "escolar", "pedagógico", "aluno", "adaptação"],
  requiredData: ["patient.name", "document.purpose"],
  optionalData: ["school.name", "grade"],
  requiredSections: ["identificacao", "funcionamento", "repercussoes", "recursos", "recomendacoes"],
  optionalSections: ["limites_sigilo"],
  regulatoryGuidance:
    "Não transformar em relatório clínico completo. Preservar intimidade da criança/adolescente. Não prometer acesso irrestrito das sessões à escola.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: [...REPORT_NEVER, "diagnóstico escolar", "laudo de inclusão não realizado"],
    issuanceChecklist: ["Finalidade escolar", "Mínimo necessário", "Revisão", "Responsável ciente quando aplicável"],
  },
  aiInstructions:
    "Foco em funcionamento observável pertinente à escola, recursos e recomendações práticas. Sem transcrever sessões. Sem diagnóstico. Linguagem respeitosa, não estigmatizante.",
  interviewPrompts: [
    "Qual escola/série e qual a finalidade?",
    "Quais repercussões acadêmicas ou de convívio podem ser descritas com segurança?",
    "Quais recursos da criança/adolescente e do contexto escolar são relevantes?",
    "Quais recomendações cabem à psicologia, sem invadir a pedagogia?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    return [
      section(
        0,
        "Identificação e finalidade",
        `Este relatório destina-se ao contexto escolar e refere-se a ${name}, em acompanhamento psicológico sob responsabilidade da signatária.

Instituição / série, quando informados: {{school.name}} · {{school.grade}}.
Finalidade: {{document.purpose}}.

O texto organiza informações úteis à articulação entre família, escola e acompanhamento psicológico. Não constitui laudo de avaliação psicológica, diagnóstico, documento de inclusão automática nem autorização para acesso ao conteúdo das sessões.`,
      ),
      section(
        1,
        "Funcionamento relevante e repercussões",
        `No que é pertinente ao ambiente escolar, descrevem-se a seguir aspectos do funcionamento da pessoa atendida, suas repercussões em aprendizagem, participação ou convívio, e os recursos já observados — sempre em linguagem não estigmatizante e limitada ao necessário.

{{school.functioning}}

{{school.academic_impact}}`,
      ),
      section(
        2,
        "Recursos, dificuldades e recomendações",
        `{{school.resources_and_difficulties}}

As recomendações a seguir visam apoiar a rotina escolar e a comunicação com a família, sem substituir avaliação pedagógica, fonoaudiológica, médica ou outras que se mostrem indicadas.

{{school.recommendations}}

Permaneço à disposição para interlocução institucional, nos limites do sigilo e da finalidade deste documento.

{{organization.city}}, {{date.today}}.`,
      ),
    ];
  },
};

export const reportMultiprofessional: SystemTemplateDefinition = {
  key: "multiprofessional_report",
  version: "1.0.0",
  name: "Relatório multiprofissional",
  description:
    "Contribuição da psicologia em documento de equipe: deixa explícito o que é da psicologia, o que é de outros núcleos e o que não foi avaliado.",
  category: "relatorios",
  documentKind: "relatorio",
  intendedRecipients: ["equipe multiprofissional", "instituição", "serviço de saúde"],
  commonPurposes: ["contribuição de núcleo", "projeto terapêutico", "comunicação de equipe"],
  recommendedLength: "completo",
  defaultVisualProfile: "clinica",
  supportsCover: true,
  searchTerms: ["multiprofissional", "equipe", "interdisciplinar", "núcleo"],
  requiredData: ["patient.name", "document.purpose"],
  optionalData: ["team.members_known"],
  requiredSections: ["identificacao", "contribuicao_psi", "limites_nucleo", "articulacao", "conclusao"],
  optionalSections: ["encaminhamentos_internos"],
  regulatoryGuidance:
    "Não assinar por outras categorias. Não fundir achados. Deixar lacunas de outros núcleos visíveis.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: [...REPORT_NEVER, "achados de outras profissões"],
    issuanceChecklist: ["Escopo da psicologia", "Finalidade da equipe", "Revisão"],
  },
  aiInstructions:
    "Separe claramente a contribuição psicológica. Nunca escreva como se a psicóloga tivesse realizado exame médico, avaliação fonoaudiológica etc. Se outros núcleos não enviaram dados, diga que não constam.",
  interviewPrompts: [
    "Qual a finalidade do documento de equipe?",
    "O que é estritamente a contribuição da psicologia?",
    "Há informações de outros núcleos já documentadas, ou devem permanecer em aberto?",
  ],
  buildSections: (ctx) => {
    const name = ctx.patientName || "{{patient.full_name}}";
    return [
      section(
        0,
        "Identificação e escopo",
        `Este Relatório Multiprofissional reúne, no que cabe à psicologia, informações relativas a ${name}, para a finalidade de {{document.purpose}}.

A seção psicológica descreve exclusivamente o que foi desenvolvido no âmbito do atendimento psicológico. Achados, hipóteses ou condutas de outras categorias profissionais somente aparecem se tiverem sido formalmente comunicados e, ainda assim, atribuídos à fonte. A ausência de seção de outro núcleo significa que aquela contribuição não foi incorporada a este documento, e não que tenha sido avaliada pela signatária.`,
      ),
      section(
        1,
        "Contribuição da psicologia",
        `{{multiprofessional.psychology_contribution}}

Procedimentos psicológicos realizados no período considerado restringem-se ao atendimento psicológico e às ações efetivamente registradas. Não se inclui avaliação psicológica formal com testes, salvo se tal processo tiver ocorrido e estiver documentado.`,
      ),
      section(
        2,
        "Articulação e conclusão do núcleo",
        `{{multiprofessional.articulation}}

A conclusão a seguir é da psicologia e não representa parecer unificado da equipe quando os demais núcleos não se manifestaram neste instrumento.

{{multiprofessional.psychology_conclusion}}

{{organization.city}}, {{date.today}}.`,
        "conclusion",
      ),
    ];
  },
};
