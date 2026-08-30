import { NEVER_INVENT_BASE, section, type SystemTemplateDefinition } from "../types";

function hours(ctx: { cancellationNoticeHours?: number }): string {
  return String(ctx.cancellationNoticeHours ?? "{{cancellation.notice_hours}}");
}

export function buildPsychotherapyContractSections(ctx: {
  patientName?: string;
  preferredName?: string;
  professionalName?: string;
  organizationName?: string;
  today: string;
  cancellationNoticeHours?: number;
  extra?: Record<string, string>;
}) {
  const name = ctx.patientName || "{{patient.full_name}}";
  const preferred = ctx.preferredName || "{{patient.preferred_name}}";
  const notice = hours(ctx);
  const includeOnline = ctx.extra?.modality !== "in_person";
  const includeMinor = ctx.extra?.includesMinor === "true";
  const includeHealthPlan = ctx.extra?.careType === "plano";
  const includeAi = ctx.extra?.includeAiClause === "true";

  const sections = [
    section(
      0,
      "Acolhimento",
      `Seja bem-vindo(a).

Este documento foi preparado para apresentar, de maneira clara, as principais condições e orientações relacionadas ao acompanhamento psicológico que estamos iniciando.

O estabelecimento de acordos objetivos contribui para que o processo psicoterapêutico ocorra de forma segura, organizada e transparente, preservando os direitos da pessoa atendida e as responsabilidades profissionais envolvidas.

Recomenda-se a leitura integral deste documento. Eventuais dúvidas podem e devem ser esclarecidas junto à profissional.

Os acordos aqui registrados poderão ser revistos quando mudanças nas condições do atendimento tornarem isso necessário, desde que adequadamente discutidas entre as partes.`,
    ),
    section(
      1,
      "Identificação das partes",
      `Profissional responsável pelo acompanhamento:
{{professional.name}} · {{professional.title}} · {{professional.crp}}
{{organization.name}}

Pessoa atendida:
Nome: ${name}
Nome preferencial: ${preferred}
CPF: {{patient.cpf}}
Data de nascimento: {{patient.birth_date}}
Telefone: {{patient.phone}}
E-mail: {{patient.email}}

Responsável legal, quando aplicável:
Nome: {{guardian.name}}
CPF: {{guardian.cpf}}
Vínculo: {{guardian.relationship}}
Telefone: {{guardian.phone}}
E-mail: {{guardian.email}}`,
    ),
    section(
      2,
      "Dados do atendimento",
      `Data de início: {{treatment.start_date}}
Tipo de atendimento: {{treatment.care_type}}
Modalidade: {{treatment.modality}}
Frequência: {{treatment.frequency}}
Duração aproximada de cada encontro: {{treatment.duration}}
Valor do encontro (quando aplicável ao regime particular): {{fees.amount}}
Forma de pagamento: {{fees.method}}
Prazo para pagamento: {{fees.due}}

Encontros programados (podem ser importados da agenda e editados):
{{schedule.encounters}}

A organização dos horários poderá ser revista ao longo do processo, mediante conversa prévia e disponibilidade de agenda.`,
    ),
    section(
      3,
      "Sobre o processo psicoterapêutico",
      `O acompanhamento psicológico constitui um processo profissional construído de maneira colaborativa entre psicóloga e pessoa atendida, considerando as necessidades identificadas, os objetivos estabelecidos e a evolução observada ao longo dos encontros.

A psicoterapia não possui, como regra, prazo previamente determinado para encerramento. Sua duração dependerá da natureza da demanda, dos objetivos estabelecidos, das condições apresentadas ao longo do processo e de outros elementos tecnicamente relevantes.

A frequência e a continuidade dos atendimentos poderão ser revistas ao longo do acompanhamento.

Modalidade combinada para este instrumento: {{treatment.modality_detail}}.
Orientações específicas dessa modalidade — duração habitual, ritmo e cuidados — serão explicitadas na sessão e podem ser registradas no campo a seguir, quando pertinente:

{{treatment.modality_notes}}`,
    ),
    section(
      4,
      "Atendimento presencial",
      `Quando os encontros ocorrerem de forma presencial, recomenda-se pontualidade, a fim de preservar o aproveitamento do horário reservado e a organização da agenda.

O espaço de atendimento destina-se ao trabalho psicológico. Acompanhantes permanecem na sala de espera, salvo quando a participação de responsável ou de outra pessoa tiver sido tecnicamente combinada.

Em caso de impedimento de comparecimento, aplica-se a política de cancelamento descrita neste documento.`,
    ),
  ];

  if (includeOnline) {
    sections.push(
      section(
        5,
        "Atendimento por tecnologias digitais",
        `Quando os encontros ocorrerem de forma online ou híbrida, serão utilizadas tecnologias digitais compatíveis com a organização do serviço, combinadas previamente com a pessoa atendida.

O atendimento mediado por tecnologias não elimina as responsabilidades éticas e técnicas da psicologia, tampouco transforma o encontro em serviço de plantão ou de urgência.

A profissional poderá indicar a plataforma habitualmente utilizada e os cuidados mínimos de conexão. Limitações tecnológicas, falhas de rede e inadequação do ambiente podem inviabilizar a realização adequada da sessão, hipótese em que se buscará interrupção ou reagendamento, conforme o caso.

O foro e a região de exercício profissional observam as regras aplicáveis à inscrição da profissional e à regulamentação vigente dos serviços mediados por tecnologias — sem que este contrato reproduza, como texto imutável, resolução específica que possa ser atualizada.`,
        "text",
        true,
      ),
      section(
        6,
        "Privacidade no atendimento online",
        `Nos atendimentos realizados por meio de tecnologias digitais, recomenda-se que a pessoa atendida permaneça em ambiente reservado, no qual possa falar livremente e preservar sua privacidade.

Sempre que possível, recomenda-se a utilização de equipamento individual, conexão adequada e recursos que reduzam a possibilidade de terceiros ouvirem o conteúdo do atendimento.

Caso as condições técnicas ou de privacidade não permitam a realização adequada da sessão, a profissional poderá avaliar, conjuntamente com a pessoa atendida, sua interrupção ou reagendamento.`,
      ),
    );
  }

  sections.push(
    section(
      7,
      "Pontualidade",
      `A pontualidade contribui para o adequado aproveitamento do horário reservado.

Quando a pessoa atendida se atrasar, o encontro normalmente será encerrado no horário originalmente previsto, preservando os horários posteriores.

Quando eventual atraso decorrer da profissional, deverá ser buscada forma apropriada de compensação do período sempre que possível.`,
    ),
    section(
      8,
      "Cancelamento, remarcação e faltas",
      `Caso não seja possível comparecer ao horário agendado, solicita-se que o cancelamento ou pedido de remarcação seja comunicado com antecedência mínima de ${notice} horas.

Quando a comunicação ocorrer dentro do prazo estabelecido, a possibilidade de remarcação será analisada de acordo com a disponibilidade de agenda.

Cancelamentos fora desse período e faltas sem comunicação poderão implicar cobrança do horário reservado, de acordo com a política financeira acordada neste instrumento.

A ocorrência repetida de faltas pode comprometer a continuidade do acompanhamento e o desenvolvimento do processo psicoterapêutico. Quando houver ausências frequentes ou dificuldades persistentes de comparecimento, recomenda-se que a situação seja discutida em sessão para eventual revisão dos acordos e da continuidade do acompanhamento.

Quando a sessão não puder ser realizada por impossibilidade da profissional, não haverá cobrança do atendimento não realizado. Quando necessário e houver interesse, poderá ser oferecido novo horário conforme disponibilidade.`,
      "text",
      true,
    ),
    section(
      9,
      "Honorários e reajuste",
      `Valor combinado: {{fees.amount}}
Forma de pagamento: {{fees.method}}
Responsável financeiro: {{fees.payer}}
Prazo: {{fees.due}}
Observações: {{fees.notes}}

Os honorários remuneram o horário reservado e o trabalho profissional associado à organização do acompanhamento, nos termos combinados.

Eventual reajuste observará a cadência combinada ({{fees.adjustment_cadence}}), sempre mediante comunicação prévia. Este contrato não executa reajuste automático: qualquer alteração de valor depende de conversa e registro atualizado entre as partes.`,
    ),
  );

  if (includeHealthPlan) {
    sections.push(
      section(
        10,
        "Atendimento vinculado a plano de saúde",
        `Quando o acompanhamento se der no regime de plano de saúde, as informações cadastrais da operadora, do plano, de autorizações, quantidades autorizadas, coparticipação e prazos de validade serão as efetivamente vigentes junto à operadora — e não uma promessa deste instrumento.

Operadora: {{health_plan.operator}}
Plano: {{health_plan.plan}}
Autorização: {{health_plan.authorization}}
Quantidade autorizada: {{health_plan.authorized_qty}}
Coparticipação: {{health_plan.copay}}
Validade da autorização: {{health_plan.validity}}

A cobertura, o reembolso e a quantidade de encontros autorizados dependem das regras da operadora e do contrato do plano. Este documento não garante deferimento, reembolso ou continuidade de autorização.`,
      ),
    );
  }

  sections.push(
    section(
      11,
      "Comunicações",
      `Os canais de comunicação disponibilizados destinam-se prioritariamente a assuntos relacionados a agenda, organização dos atendimentos e comunicações breves.

Demandas clínicas que exijam avaliação, elaboração ou intervenção deverão, sempre que possível, ser tratadas durante os encontros profissionais.`,
    ),
    section(
      12,
      "Urgência e emergência",
      `O acompanhamento psicoterapêutico ambulatorial não constitui serviço de atendimento emergencial ou regime de disponibilidade contínua.

Em situações de risco imediato à própria pessoa ou a terceiros, ou quando houver necessidade de assistência urgente, deverão ser procurados serviços apropriados de urgência, emergência ou outros recursos assistenciais disponíveis.

A profissional poderá fornecer orientações dentro dos limites de sua atuação e disponibilidade, mas este contrato não estabelece regime de plantão.`,
      "text",
      true,
    ),
    section(
      13,
      "Sigilo profissional",
      `As informações compartilhadas no contexto do atendimento psicológico são protegidas pelo dever de sigilo profissional e serão tratadas de acordo com as normas éticas e legais aplicáveis.

Existem circunstâncias excepcionais em que a proteção da pessoa atendida, de terceiros ou o cumprimento de deveres profissionais ou legais poderá exigir avaliação quanto ao compartilhamento de determinadas informações.

Quando houver necessidade de comunicação, a profissional deverá considerar os princípios éticos aplicáveis e limitar o compartilhamento ao estritamente necessário para a finalidade que o justificar.`,
    ),
  );

  if (includeMinor) {
    sections.push(
      section(
        14,
        "Criança e adolescente",
        `Quando a pessoa atendida for criança ou adolescente, o acompanhamento considera o melhor interesse da pessoa em desenvolvimento, a participação do menor em grau compatível com sua idade e maturidade, e a preservação de sua intimidade no processo psicoterapêutico.

O responsável legal integra os acordos organizacionais e financeiros aplicáveis e será ouvido nas questões que lhe competem. Isso não se confunde com acesso irrestrito ao conteúdo das sessões: a comunicação com responsáveis observará os limites do sigilo, as normas profissionais vigentes e a avaliação técnica do que é necessário comunicar para proteção e continuidade do cuidado.

Autorizações específicas (por exemplo, para atendimento, para determinadas comunicações institucionais ou para documentos) serão tratadas em termos próprios quando necessário, sem que este contrato as presuma de forma genérica.`,
      ),
    );
  }

  sections.push(
    section(
      15,
      "Registro documental",
      `A profissional realizará os registros necessários ao acompanhamento psicológico de acordo com as normas profissionais aplicáveis.

Esses registros poderão conter informações relacionadas à demanda, evolução do acompanhamento, procedimentos realizados e demais elementos necessários à continuidade e à responsabilidade técnica do serviço.`,
    ),
    section(
      16,
      "Proteção de dados pessoais",
      `Os dados pessoais tratados no contexto deste acompanhamento destinam-se à organização do serviço, ao registro profissional, à comunicação operacional combinada e ao cumprimento de deveres legais e éticos aplicáveis.

O acesso às informações observa a organização do consultório, as permissões profissionais e as medidas de segurança adotadas. Prazos de retenção seguem as normas profissionais e a política da clínica, sem promessa de eliminação incompatível com deveres de guarda do registro psicológico.

A pessoa atendida (ou responsável, quando cabível) poderá exercer direitos previstos na legislação de proteção de dados por meio dos canais indicados pela profissional, observadas as limitações legais relativas a registros profissionais.`,
      "text",
      true,
    ),
    section(
      17,
      "Sistemas de organização do consultório",
      `Para organização dos atendimentos, registros, documentos e demais atividades relacionadas à prestação do serviço, a profissional poderá utilizar sistemas informatizados destinados à gestão do consultório e ao suporte das atividades profissionais, observadas as medidas de segurança e confidencialidade adotadas.`,
    ),
    section(
      18,
      "Gravação das sessões",
      `As sessões não deverão ser gravadas por qualquer das partes sem conhecimento e concordância prévios.

Quando houver necessidade específica de gravação, sua finalidade, forma de armazenamento, acesso, período de retenção e posterior eliminação deverão ser previamente esclarecidos.

O eventual uso de recursos de transcrição ou de apoio tecnológico segue consentimentos específicos, distintos deste contrato.`,
    ),
    section(
      19,
      "Documentos psicológicos",
      `Documentos psicológicos eventualmente solicitados serão elaborados de acordo com a finalidade informada, os registros disponíveis e as normas profissionais aplicáveis.

A emissão de documentos poderá exigir prazo adequado para análise, elaboração e revisão técnica.`,
    ),
    section(
      20,
      "Interrupção e encerramento",
      `A pessoa atendida poderá manifestar o desejo de interromper o acompanhamento a qualquer momento.

Sempre que possível, recomenda-se que essa decisão seja comunicada à profissional e discutida em sessão, permitindo avaliação do processo, orientações pertinentes e planejamento do encerramento.

A profissional também poderá propor encerramento, encaminhamento ou mudança na modalidade de atendimento quando houver indicação técnica, ética ou outra razão relevante.`,
      "text",
      true,
    ),
    section(
      21,
      "Declaração de ciência e concordância",
      `Declaro que tive acesso às informações deste documento, pude lê-las e tive oportunidade de esclarecer dúvidas sobre o funcionamento do acompanhamento psicológico e os acordos aqui registrados.

Declaro estar ciente das condições referentes a horários, cancelamentos, honorários, confidencialidade, comunicação, atendimento presencial e/ou online e demais disposições aplicáveis à prestação do serviço.

Ao prosseguir com o acompanhamento, concordo com as condições registradas neste instrumento.

{{organization.city}}, {{date.today}}.`,
    ),
  );

  if (includeAi) {
    sections.splice(
      sections.findIndex((item) => item.title === "Sistemas de organização do consultório") + 1,
      0,
      section(
        17.5 as unknown as number,
        "Apoio informatizado e inteligência artificial (cláusula informativa)",
        `A organização do consultório pode disponibilizar recursos de apoio informatizado, inclusive ferramentas de inteligência artificial, para fins de organização, redação assistida de documentos ou suporte ao trabalho profissional.

Esta cláusula é apenas informativa e não substitui o consentimento específico para tratamento de dados por inteligência artificial, quando exigido. A recusa a esses recursos não impede o acompanhamento psicológico ordinário. Nenhuma saída automatizada é incorporada ao prontuário ou emitida como documento profissional sem revisão e decisão humanas.`,
      ),
    );
  }

  return sections.map((item, index) => ({ ...item, order: index }));
}

export const psychotherapyContractComplete: SystemTemplateDefinition = {
  key: "psychotherapy_contract_complete",
  version: "1.0.0",
  name: "Contrato psicoterapêutico completo",
  description:
    "Livreto completo de orientação e contrato psicoterapêutico, em formato tradicional (A4 contínuo) ou livreto editorial, com cláusulas desenvolvidas e integralmente editáveis.",
  category: "contratos",
  documentKind: "contrato",
  intendedRecipients: ["paciente", "responsável"],
  commonPurposes: ["início de acompanhamento", "atualização de acordos", "orientação ao processo"],
  recommendedLength: "detalhado",
  defaultVisualProfile: "institucional",
  supportsCover: true,
  supportsBooklet: true,
  searchTerms: ["contrato", "livreto", "psicoterapia", "honorários", "cancelamento", "sigilo", "online"],
  requiredData: ["patient.name", "treatment.modality"],
  optionalData: ["guardian", "health_plan", "schedule.encounters", "fees"],
  requiredSections: ["acolhimento", "identificacao", "atendimento", "sigilo", "honorarios", "ciencia"],
  optionalSections: ["online", "menor", "plano", "ia_informativa"],
  regulatoryGuidance:
    "Contrato assistencial/administrativo de organização do serviço, não documento psicológico regulamentado do tipo laudo/atestado. Textos-base são editáveis. Não copiar modelos comerciais. IA e gravação têm consentimentos específicos.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: [...NEVER_INVENT_BASE, "cobertura de plano", "plantão"],
    issuanceChecklist: ["Partes", "Honorários e cancelamento", "Modalidade", "Revisão", "Preview multipágina"],
  },
  aiInstructions:
    "Não resumir o contrato a tópicos. Preserve cláusulas desenvolvidas. Não invente valores, CRP, endereço ou normas. Não misturar consentimento de IA completo neste instrumento.",
  interviewPrompts: [
    "O formato será tradicional ou livreto?",
    "Qual modalidade (presencial, online, híbrido) e público (adulto, menor, casal)?",
    "Qual a política de cancelamento em horas?",
    "Há plano de saúde, responsável legal ou cláusula informativa de IA?",
  ],
  buildSections: (ctx) => buildPsychotherapyContractSections(ctx),
};

export const psychotherapyContractOnline: SystemTemplateDefinition = {
  key: "psychotherapy_contract_online",
  version: "1.0.0",
  name: "Contrato de atendimento online",
  description:
    "Contrato focado na modalidade online/híbrida, com cláusulas desenvolvidas sobre ambiente, privacidade, conexão, limites tecnológicos e organização do serviço.",
  category: "contratos",
  documentKind: "contrato",
  intendedRecipients: ["paciente", "responsável"],
  commonPurposes: ["início de atendimento online", "migração para modalidade digital"],
  recommendedLength: "completo",
  defaultVisualProfile: "institucional",
  supportsCover: false,
  supportsBooklet: true,
  searchTerms: ["contrato online", "teleatendimento", "TDIC", "videoconferência"],
  requiredData: ["patient.name"],
  optionalData: ["platform", "guardian"],
  requiredSections: ["acolhimento", "online", "privacidade", "cancelamento", "sigilo", "ciencia"],
  optionalSections: ["honorarios"],
  regulatoryGuidance:
    "Não hardcodar resolução antiga de TDIC como único fundamento. Cláusulas de tecnologia, ambiente e interrupção são obrigatórias neste template.",
  guardrails: {
    requiresPatient: true,
    allowsMissingPatient: false,
    neverInvent: NEVER_INVENT_BASE,
    issuanceChecklist: ["Modalidade online", "Cancelamento", "Revisão"],
  },
  aiInstructions:
    "Mantenha ênfase em ambiente reservado, limites técnicos e ausência de plantão. Não invente nome de plataforma se não estiver no contexto.",
  interviewPrompts: [
    "Qual tecnologia habitualmente utilizada?",
    "Há peculiaridades de horário, fuso ou localização da pessoa atendida?",
    "Qual a política de cancelamento?",
  ],
  buildSections: (ctx) =>
    buildPsychotherapyContractSections({
      ...ctx,
      extra: { ...ctx.extra, modality: "online" },
    }),
};
