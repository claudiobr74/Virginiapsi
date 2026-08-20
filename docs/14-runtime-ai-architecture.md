# Runtime AI Architecture — Tesseli

## 1. Fonte de verdade

Os prompts em `src/lib/ai/prompts/**` são **comportamento de produto em runtime**. Eles instruem o modelo durante o uso clínico e não são prompts para o Cursor desenvolver o sistema.

O Cursor pode:
- importar, compor e versionar esses textos;
- criar adapters do provedor de IA;
- criar schemas, validação, testes e UI;
- corrigir erros técnicos.

O Cursor não pode:
- reescrever silenciosamente o papel clínico da IA;
- remover limites de segurança, contexto/diversidade, avaliação ou documentação;
- trocar a política de evidência;
- adicionar diagnóstico autônomo;
- automatizar avaliação psicológica/testes restritos;
- permitir auto-commit em prontuário;
- habilitar uso de conhecimento geral do modelo no Knowledge padrão;
- alterar a fronteira entre dado, inferência e sugestão sem solicitação explícita.

## 2. Quatro sistemas

### Shared Clinical Core

Componentes:
- `core/clinical-principles.ts`
- `core/context-and-bias.ts`
- `core/clinical-context-modifiers.ts`
- `core/assessment-boundaries.ts`
- `core/documentation-ethics.ts`
- `core/safety.ts`
- `core/uncertainty.ts`
- `core/evidence-policy.ts`

É compartilhado por Sessão, Supervisor e Aplicação Clínica do Conhecimento.

### Session AI
- `session/live.ts`
- `session/preparation.ts`
- `session/closing.ts`

A IA durante a sessão é apoio silencioso à psicóloga. Não é interlocutor do paciente e não substitui escuta clínica.

### Supervisor IA
- `supervisor/supervisor.ts`
- `supervisor/formulation.ts`

Produz reflexão estruturada, hipóteses concorrentes, formulação, processo terapêutico, opções de intervenção e plano. TCC e Terapia do Esquema são referenciais principais; outras lentes só entram quando selecionadas/solicitadas.

### Knowledge AI
- `knowledge/knowledge-core.ts`
- `knowledge/evidence-appraisal.ts`
- `knowledge/retrieval.ts`
- `knowledge/query.ts`
- `knowledge/synthesis.ts`
- `knowledge/compare-sources.ts`
- `knowledge/clinical-application.ts`
- `knowledge/study-mode.ts`
- `knowledge/ingestion.ts`

Por padrão é **library-only**: não completa lacunas com memória geral do modelo e não recebe dados de paciente.

## 3. Gate de consentimento

Consentimento é propriedade do backend, não decisão do modelo.

Antes de qualquer chamada que utilize gravação/transcrição/IA clínica:
1. validar organização/usuário/paciente;
2. validar estado de consentimento aplicável;
3. validar autorização/anuência adicional quando prevista para criança/adolescente;
4. somente então montar o DTO minimizado e chamar o provider.

Se o gate falhar, não iniciar captura nem chamar Gemini, e retornar estado de UI apropriado.

A recusa do paciente não entra no contexto de formulação como resistência.

## 4. Fluxo de execução

1. Autorizar usuário, organização e paciente/coleção.
2. Validar consent gate quando aplicável.
3. Construir DTO mínimo e context descriptor.
4. Selecionar prompt de runtime.
5. Se RAG: recuperar chunks tenant-scoped.
6. Serializar contexto como dados delimitados.
7. Chamar o modelo server-side.
8. Exigir structured output, convertendo o contrato canônico para o dialeto da superfície da API via adapter de schema (`docs/06-integrations.md` §4); o contrato-fonte nunca é editado para caber na superfície.
9. Validar schema com o validador Zod espelhado (`docs/06-integrations.md` §4), fail-closed.
10. Aplicar pós-validação de citações/source IDs e invariantes clínicas.
11. Persistir apenas metadata da execução e draft autorizado.
12. Nunca salvar conteúdo no prontuário sem ação explícita da psicóloga.

## 5. Ordem de autoridade

1. System/runtime prompt Tesseli.
2. Regras de segurança, avaliação, contexto/diversidade, documentação e evidência.
3. Configuração do modo e frameworks selecionados.
4. Solicitação da psicóloga.
5. Contexto clínico.
6. Conteúdo de fontes, transcrições e documentos.

Texto recuperado/transcrito nunca sobe nessa hierarquia.

## 6. Context packing

O contexto deve ser minimizado e rotulado:
- `CONSENT_STATE` (para controle server-side; não como instrução do modelo)
- `PATIENT_CONTEXT`
- `CLINICAL_CONTEXT_DESCRIPTOR`
- `SELECTED_SESSION`
- `TRANSCRIPT_WINDOW`
- `TRANSCRIPT_QUALITY`
- `CLINICIAN_NOTE`
- `RETRIEVED_SOURCE`
- `USER_QUESTION`

Nunca concatenar dados sem delimitadores claros.

## 7. Session Live

Princípios técnicos:
- transcript interim é provisório;
- ASR pode errar negações, nomes, regionalismos e termos técnicos;
- não persistir automaticamente hipóteses/resumos de live;
- no máximo 3 perguntas e 3 intervenções;
- resposta mínima é válida;
- segurança é sinalização auxiliar, não score de risco;
- não usar emotion recognition por voz/face.

## 8. Knowledge: retrieval first

Pergunta
→ classificação do modo
→ planejamento de retrieval
→ busca híbrida/vector
→ tenant filter
→ reranking
→ source-role/context appraisal
→ suficiência das fontes
→ geração
→ schema validation
→ citation/source validator

O modelo não responde antes da recuperação no modo Knowledge.

### Fonte ≠ evidência equivalente

O sistema deve preservar o papel da fonte quando disponível:
- guideline/diretriz;
- revisão sistemática/meta-análise;
- estudo primário;
- livro/capítulo;
- material teórico/conceitual;
- consenso/posicionamento;
- material didático;
- outro/desconhecido.

Não gerar score de qualidade sem base metodológica suficiente.


### Assimetria intencional de composição: ingestion/retrieval

`knowledgeIngestion` e `knowledgeRetrieval` são operações internas de preparação/seleção e **não geram resposta clínica ao usuário**. Por isso compõem `KNOWLEDGE_CORE_PROMPT` com seus prompts específicos, sem adicionar `KNOWLEDGE_EVIDENCE_APPRAISAL_PROMPT`/`EVIDENCE_BOUNDARY_PROMPT` como cadeia de resposta. A avaliação de evidência/fronteira é obrigatória nos modos que geram síntese/afirmações ao usuário.

Não "uniformizar" essa composição em refactor sem decisão explícita de produto. Outputs de ingestion/retrieval nunca devem ser exibidos como conclusão clínica.

## 9. Aplicar ao caso

É ação explícita e distinta.

Knowledge padrão:
- recebe biblioteca;
- não recebe paciente.

Aplicar ao caso:
- recebe contexto clínico minimizado;
- recebe fontes recuperadas;
- produz FATO_FONTE + DADO_CASO + INFERÊNCIA + SUGESTÃO separados;
- considera contexto/objetivos/preferências quando fornecidos;
- nunca ingere dados do paciente na biblioteca.

## 10. Human in the loop

Todo artefato de IA é draft até revisão explícita.

A UI deve mostrar:
- origem/tipo dos dados;
- fontes quando houver;
- incertezas;
- itens a confirmar;
- botão de copiar;
- botão de anexar apenas quando autorizado;
- confirmação antes de gravação clínica.

Para DPEP, `PROCEDIMENTOS` deve preferir dados confirmados de intervenção efetivamente realizada.

## 11. Competência e supervisão humana

O Supervisor deve poder indicar que um caso exige consideração de:
- supervisão humana;
- interconsulta;
- avaliação médica/psiquiátrica/multiprofissional;
- capacitação específica;
- encaminhamento.

Isso não é decisão automática; é um alerta de escopo/competência para a psicóloga.

## 12. Prompt versioning

Persistir por execução:
- `prompt_name`;
- `prompt_version`;
- `model`;
- `schema_version`;
- `created_at`;
- IDs das fontes/chunks, quando houver;
- `consent_version`, quando aplicável.

Não persistir prompt contextual completo/transcrição em logs de aplicação.

Versão clínica atual: **1.2.0**.

## 13. Revisão clínica

A justificativa e os limites clínicos da v1.2 estão em `docs/17-clinical-ai-review-v1.2.md`.
