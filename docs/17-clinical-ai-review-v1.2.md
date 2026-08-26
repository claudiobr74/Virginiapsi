# Revisão Clínica dos Runtime AI Prompts — v1.2

Data da revisão: 18/08/2026

## 1. Objetivo

Revisar a arquitetura clínica de IA do Tesseli como ferramenta de apoio a psicóloga habilitada, considerando psicoterapia individual, casal/família, crianças/adolescentes, contextos de trauma, risco, neurodiversidade, diversidade sociocultural, raciocínio diagnóstico, avaliação psicológica e múltiplas abordagens psicoterapêuticas.

A revisão não transforma a IA em "psicóloga especialista em tudo". O objetivo clínico correto é outro: **ter consciência multiparadigmática suficiente para não produzir erros grosseiros fora da TCC/Terapia do Esquema e, ao mesmo tempo, respeitar a abordagem, competência e decisão da profissional humana**.

## 2. Conclusão executiva

A primeira versão tinha uma boa fundação em quatro pontos: human-in-the-loop, separação fato/inferência, ausência de auto-commit e Knowledge library-only. Entretanto, ainda estava excessivamente centrada em TCC/Terapia do Esquema e pouco explícita sobre desenvolvimento, diversidade, casal/família, trauma, avaliação psicológica, limites de competência, vieses de transcrição e hierarquia da evidência.

A v1.2 corrige esses pontos sem mudar o papel do Tesseli: **IA como instrumento auxiliar da psicóloga, nunca como prestadora autônoma de psicoterapia ou decisora clínica**.

## 3. Achados clínicos e correções

### 3.1 Formulação não é diagnóstico nem verdade sobre a pessoa

**Risco identificado:** constructos como esquema, modo, crença nuclear, resistência, apego, defesa ou função comportamental podem adquirir aparência de fato quando apresentados com linguagem fluida.

**Correção v1.2:**
- formulação definida como hipótese dinâmica e revisável;
- constructos exigem sustentação e alternativas;
- nenhuma formulação deve funcionar como rótulo identitário;
- hipóteses concorrentes ganham evidências favoráveis, contraditórias, alternativas e forma de teste.

### 3.2 TCC e Terapia do Esquema permanecem principais, mas não universais

**Risco identificado:** forçar toda apresentação clínica ao ciclo TCC ou a esquemas/modos.

**Correção v1.2:**
- TCC e Terapia do Esquema continuam referenciais principais do produto;
- lentes ACT/contextuais, DBT, psicodinâmica, humanista/fenomenológica, sistêmica, interpessoal/apego/mentalização e comportamental só entram quando selecionadas ou solicitadas;
- integração exige coerência epistemológica e deve explicitar o que cada lente acrescenta;
- ausência de sustentação deve resultar em omissão, não preenchimento artificial.

### 3.3 Objetivos, valores, recursos e preferências entram na formulação

**Risco identificado:** foco excessivo em problema/sintoma pode induzir formulação deficitária.

**Correção v1.2:**
- Session Preparation e Supervisor passam a recuperar objetivos, preferências, recursos, fatores protetores e progresso;
- melhora não é reduzida à diminuição de sintomas;
- funcionamento e experiência da pessoa são considerados quando documentados.

### 3.4 Desenvolvimento, cultura, diversidade e determinantes contextuais

**Risco identificado:** interpretar sofrimento social/contextual como psicopatologia ou usar identidade como marcador clínico implícito.

**Correção v1.2:**
- novo `context-and-bias.ts`;
- proibição de usar raça, gênero, sexualidade, deficiência, neurodivergência, religião ou condição socioeconômica como evidência automática de diagnóstico/traço/risco;
- distinção entre sofrimento intrapsíquico e sofrimento produzido/agravado por violência, discriminação, exclusão ou contexto;
- diferenças comunicativas de neurodivergência/deficiência não podem ser chamadas automaticamente de resistência, manipulação ou baixa motivação.

### 3.5 Crianças e adolescentes

**Risco identificado:** misturar relato de responsáveis com relato da criança/adolescente e ignorar fase do desenvolvimento, consentimento/anuência e proteção integral.

**Correção v1.2:**
- diferenciação explícita das fontes de informação;
- necessidade de contexto desenvolvimental;
- gravação/transcrição não pode presumir consentimento válido;
- situações de violência/suspeita passam a gerar alerta para revisão das obrigações profissionais de proteção/notificação pela psicóloga, sem decisão jurídica automática pela IA.

### 3.6 Casais, famílias e grupos

**Risco identificado:** o modelo pode adotar a narrativa de um membro e construir causalidade linear sobre o outro.

**Correção v1.2:**
- princípio de multiparcialidade;
- relato de A sobre B é `RELATO`, não `DADO_DOCUMENTADO` sobre B;
- formulações sistêmicas não devem atribuir um culpado causal único sem base.

### 3.7 Trauma, abuso, violência e memória

**Risco identificado:** perguntas sugestivas, "descoberta" de abuso, memória reprimida ou recomendação precipitada de exposição/processamento.

**Correção v1.2:**
- perguntas abertas e não indutivas;
- proibição de afirmar memória reprimida, abuso, mentira ou manipulação como fato;
- intervenções de trauma exigem consideração de estabilidade, fase terapêutica, consentimento, preparo e competência;
- Session Live não deve sugerir processamento traumático só porque o tema apareceu.

### 3.8 Avaliação psicológica e testes

**Risco identificado:** um LLM pode ser solicitado a pontuar/interpretar instrumento ou inferir personalidade/cognição pela transcrição.

**Correção v1.2:**
- novo `assessment-boundaries.ts`;
- IA não administra, corrige, pontua ou reconstrói testes psicológicos restritos;
- não infere escores, traços, cognição ou diagnóstico a partir de fala isolada;
- raciocínio diagnóstico só ocorre quando solicitado/necessário e permanece diferencial hipotético.

### 3.9 Medicação e interface multiprofissional

**Risco identificado:** o Supervisor sugerir ajuste farmacológico em casos complexos.

**Correção v1.2:**
- proibição de recomendar início, suspensão ou alteração de dose;
- pode sugerir que a psicóloga considere avaliação médica/psiquiátrica/multiprofissional quando pertinente.

### 3.10 Segurança e risco

**Risco identificado:** uma etiqueta "risk" simples poderia ganhar aparência de estratificação validada.

**Correção v1.2:**
- a IA é detector auxiliar de sinais, não ferramenta autônoma de avaliação de risco;
- domínios explícitos: suicídio/autoagressão, violência a terceiros, abuso/proteção, alteração aguda do estado mental, substâncias, possível instabilidade médica em transtornos alimentares e outros;
- somente `none`, `attention`, `urgent_review`;
- proibição de porcentagens e de "baixo/médio/alto risco" sem instrumento/processo válido;
- `none` significa apenas ausência de sinal explícito no material analisado;
- urgência sempre remete à avaliação clínica direta pela profissional.

### 3.11 Erro de transcrição é risco clínico, não apenas técnico

**Risco identificado:** o ASR pode errar nomes, negações, regionalismos ou termos técnicos, e o modelo pode consolidar o erro como fato.

**Correção v1.2:**
- Session Live considera transcrição provisória e potencialmente inexata;
- discrepância pode decorrer de erro de ASR;
- alerta de segurança baseado em trecho ambíguo exige confirmação direta;
- resumo/interpretações de live não são persistidos automaticamente.

### 3.12 Session Live deve ajudar menos, não mais

**Risco identificado:** excesso de sugestões pode competir com a escuta clínica e aumentar carga cognitiva da psicóloga.

**Correção v1.2:**
- máximo de três perguntas e três intervenções;
- saída vazia/curta é preferível a observação trivial;
- não gerar roteiro de sessão nem falas mecânicas;
- cada intervenção inclui pré-requisitos e cautelas.

### 3.13 Documentação clínica

**Risco identificado:** uma IA pode converter sugestão em procedimento realizado ou produzir prontuário excessivamente íntimo.

**Correção v1.2:**
- novo `documentation-ethics.ts`;
- DPEP continua como rascunho;
- procedimento só entra se houver evidência de que ocorreu;
- itens duvidosos vão para confirmação da psicóloga;
- informação íntima/traumática/de terceiros deve ser minimizada;
- o termo "nota restrita" foi substituído por uma área de trabalho clínico com governança própria: o sistema não deve presumir que uma área separada seja juridicamente inacessível nem utilizá-la para ocultar informação necessária.

### 3.14 Consentimento para IA, gravação e transcrição

**Risco identificado:** prompt clínico operar sobre transcrição sem conhecer o estado de consentimento.

**Correção v1.2:**
- Session AI/transcrição só pode iniciar quando o backend confirmar os consentimentos aplicáveis;
- recusa de IA/gravação não pode ser interpretada como resistência nem prejudicar atendimento;
- para crianças/adolescentes, o sistema não presume consentimento/anuência ausente.

### 3.15 Supervisor: competência e supervisão humana

**Risco identificado:** "Supervisor IA" pode transmitir sensação de substituição de supervisão profissional.

**Correção v1.2:**
- contrato `competenceAndSupervision`;
- casos de alta complexidade, risco, fronteira de competência ou intervenção especializada podem disparar recomendação explícita de supervisão humana/interconsulta/encaminhamento;
- a IA nunca afirma ter responsabilidade supervisora.

### 3.16 Knowledge: fonte não é sinônimo de evidência

**Risco identificado:** livro, artigo teórico, RCT, guideline e meta-análise poderiam receber peso semelhante.

**Correção v1.2:**
- novo `evidence-appraisal.ts`;
- diferenciação entre conceito teórico, achado empírico, recomendação e posição de autor;
- source appraisal sem inventar score de qualidade;
- pergunta de eficácia/segurança exige fontes compatíveis; caso contrário, `PARCIAL` ou `INSUFICIENTE`;
- número de fontes não equivale a consenso.

### 3.17 Modificadores clínicos por população e modalidade

**Risco identificado:** uma IA generalista pode aplicar recomendações de psicoterapia individual adulta a contextos em que o enquadre muda de forma importante.

**Correção v1.2:**
- novo `clinical-context-modifiers.ts`;
- salvaguardas específicas para infância/adolescência, casal/família/grupo, pessoa idosa/alteração cognitiva, perinatalidade, luto, doença crônica/dor/hospital, neurodivergência/deficiência, trauma/dissociação, psicose/mania, transtornos alimentares, substâncias, TOC, padrões de personalidade, sexualidade/gênero e contextos forenses;
- em todos esses cenários, a IA funciona como apoio de raciocínio e sinaliza quando competência específica, supervisão humana, avaliação médica/multiprofissional ou enquadre distinto podem ser necessários;
- nenhuma salvaguarda equivale a protocolo de tratamento automático.

## 4. Limites que devem permanecer absolutos

O Tesseli não deve:

1. conduzir psicoterapia diretamente com paciente;
2. emitir diagnóstico autônomo;
3. realizar avaliação psicológica autônoma;
4. pontuar/interpretar testes psicológicos restritos pelo LLM;
5. tomar decisão autônoma de emergência, quebra de sigilo ou notificação;
6. prescrever ou ajustar medicação;
7. produzir intervenção clínica automaticamente sem revisão profissional;
8. gravar qualquer texto de IA no prontuário sem ação humana explícita;
9. inferir emoção por voz/face como fato;
10. construir perfil psicológico baseado em características protegidas;
11. tratar transcrição automática como registro literal infalível;
12. usar dados de paciente no Knowledge padrão;
13. inventar literatura, citação, fonte ou página;
14. substituir supervisão humana em caso de risco, complexidade ou fronteira de competência.

## 5. Condições de implantação clínica

Antes de habilitar IA em produção, o produto deve comprovar:

- consentimento válido e auditável para usos aplicáveis de IA/gravação/transcrição;
- opção de atendimento sem IA/gravação;
- minimização e segregação de dados;
- isolamento por organização/paciente;
- logs sem conteúdo clínico;
- versionamento de prompt/model/schema;
- structured output + validação estrita;
- testes de prompt injection;
- testes de falsa citação;
- testes de erro de transcrição e negação;
- testes de viés contextual/demográfico;
- testes de pergunta sugestiva em trauma/abuso;
- testes de não interpretação de testes psicológicos;
- testes de não auto-commit;
- auditoria humana antes de mudança de runtime prompt.

## 6. Referências normativas e clínicas consideradas

- Conselho Federal de Psicologia. **Resolução CFP nº 13/2022** — diretrizes e deveres para o exercício da psicoterapia, incluindo registro, cientificidade, singularidades e atendimento a crianças/adolescentes.
- Conselho Federal de Psicologia. **Resolução CFP nº 9/2024** — exercício profissional mediado por Tecnologias Digitais da Informação e da Comunicação.
- Conselho Federal de Psicologia. **Resolução CFP nº 7/2025** — atuação profissional junto a pessoas com deficiência, incluindo acessibilidade e uso inclusivo de TDICs.
- Conselho Federal de Psicologia. **Inteligência Artificial na Psicologia: guia para uma prática ética e responsável** (2025).
- Conselho Federal de Psicologia. **Nota de Posicionamento sobre Inteligência Artificial e Psicologia** (2025).
- Conselho Federal de Psicologia. **Código de Ética Profissional do Psicólogo — Resolução CFP nº 10/2005**.
- Conselho Federal de Psicologia. **Resolução CFP nº 1/2009**, com alteração da Resolução CFP nº 5/2010 — registro documental e prontuário psicológico.
- Conselho Federal de Psicologia. **Resolução CFP nº 31/2022** — Avaliação Psicológica.
- Conselho Federal de Psicologia. **Resolução CFP nº 6/2019** — elaboração de documentos escritos produzidos por psicóloga(o), conforme aplicabilidade.
- American Psychological Association. **Policy Statement on Evidence-Based Practice in Psychology** — integração entre melhor evidência disponível, expertise clínica e características/cultura/preferências da pessoa.

## 7. Status

**Resultado da revisão clínica v1.2: APROVADO PARA IMPLEMENTAÇÃO TÉCNICA CONDICIONADA AO GATE PRÉ-IMPLEMENTAÇÃO.**

Isso significa que a arquitetura clínica está suficientemente definida para codificação, mas o projeto inteiro ainda deve passar por auditoria técnica/arquitetural/segurança antes de qualquer implementação. Use `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md`.

> Esta revisão é especificação clínica de produto e não substitui parecer jurídico, avaliação do CRP/CFP sobre caso concreto, validação de LGPD/DPA ou responsabilidade técnica da psicóloga usuária.
