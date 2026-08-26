# Runtime AI Data Contracts

## Princípios de entrada

Todo input de IA deve ser montado server-side, tenant-scoped, minimizado e delimitado por tipo. Consentimento não é inferido pelo modelo: é **pré-condição técnica validada antes da chamada**.

Campos contextuais devem ser enviados somente quando relevantes e autorizados.

## ConsentState

```ts
{
  aiProcessingAllowed: boolean,
  recordingAllowed: boolean,
  transcriptionAllowed: boolean,
  consentVersion?: string,
  consentRecordedAt?: string,
  minorGuardianAuthorizationValid?: boolean,
  minorAssentRecorded?: boolean
}
```

Regras:
- Session Live/transcrição exigem os estados aplicáveis como `true`. O mesmo gate é obrigatório antes de emitir **qualquer capability de captura**, inclusive o grant de captura de sessão (transcrição local) e o signed upload grant para fallback de áudio.
- O modelo não decide se consentimento é válido.
- Recusa de IA/gravação/transcrição não entra na formulação clínica como "resistência".

## ClinicalContextDescriptor

```ts
{
  ageGroup?: "child" | "adolescent" | "adult" | "older_adult",
  modality?: "individual" | "couple" | "family" | "group",
  selectedFrameworks?: (
    | "cbt"
    | "schema"
    | "act_contextual"
    | "dbt"
    | "psychodynamic"
    | "humanistic_existential"
    | "systemic"
    | "interpersonal_attachment_mentalization"
    | "behavioral_functional"
  )[],
  relevantContext?: string[],
  patientGoals?: string[],
  patientPreferences?: string[]
}
```

Não preencher automaticamente dados demográficos/contextuais ausentes.

## Session Live Input

```ts
{
  organizationId,
  patientRef,
  sessionId,
  consentState,
  clinicalContext?: ClinicalContextDescriptor,
  transcriptWindow,
  transcriptQuality?: {
    isPartial: boolean,
    confidenceAvailable?: boolean,
    knownAmbiguities?: string[]
  },
  clinicianNotes?,
  therapeuticGoals?,
  previousSummary?
}
```

### Gate

A chamada não ocorre se os consentimentos exigidos não estiverem válidos. Trechos de baixa confiabilidade/ambiguidade devem permanecer identificados como tais.

## Session Preparation Input

```ts
{
  organizationId,
  patientRef,
  clinicalContext?: ClinicalContextDescriptor,
  selectedSessions,
  currentTreatmentGoals,
  patientPreferences?,
  previousPlans,
  priorInterventionResponse?,
  homework,
  authorizedClinicalNotes
}
```

## Session Closing Input

```ts
{
  organizationId,
  patientRef,
  sessionId,
  clinicalContext?: ClinicalContextDescriptor,
  finalTranscriptOrSummary,
  clinicianNotes,
  interventionsActuallyRecorded,
  priorPlan,
  itemsAlreadyConfirmedByClinician?
}
```

`interventionsActuallyRecorded` é a fonte preferencial para `PROCEDIMENTOS`. A IA não deve inferir procedimento aplicado só porque apareceu como sugestão durante live.

## Supervisor Input

```ts
{
  organizationId,
  patientRef,
  supervisionGoal,
  clinicalQuestion,
  selectedSessions,
  selectedClinicalNotes,
  treatmentGoals?,
  patientPreferences?,
  therapistContext?,
  clinicalContext?: ClinicalContextDescriptor,
  primaryApproach: "cbt" | "schema" | "integrative",
  selectedAdditionalFrameworks?: ClinicalContextDescriptor["selectedFrameworks"],
  diagnosticReasoningRequested?: boolean,
  retrievedKnowledge?: RetrievedChunk[]
}
```

Regras:
- lentes adicionais só podem aparecer se selecionadas/solicitadas;
- `diagnosticReasoningRequested` controla a ativação de raciocínio diagnóstico explícito;
- contexto da psicóloga só deve ser enviado quando necessário à pergunta e autorizado.

## Knowledge Input

```ts
{
  organizationId,
  collectionIds,
  question,
  mode:
    | "query"
    | "synthesis"
    | "compare"
    | "study",
  retrievedChunks
}
```

Nenhum `patientRef` ou contexto clínico é permitido no Knowledge padrão.

## Apply to Case Input

```ts
{
  organizationId,
  patientRef,
  question,
  minimizedCaseContext,
  clinicalContext?: ClinicalContextDescriptor,
  retrievedChunks,
  explicitApplyToCase: true
}
```

## RetrievedChunk

```ts
{
  chunkId,
  sourceId,
  title?,
  author?,
  year?,
  location?,
  documentType?,
  studyDesignOrSourceRole?,
  populationContext?,
  text,
  retrievalScore
}
```

`retrievalScore` indica relevância para recuperação, não qualidade científica. O modelo não deve convertê-lo em força de evidência.

## Run metadata

```ts
{
  organizationId,
  actorUserId,
  patientId?,
  feature,
  promptName,
  promptVersion,
  schemaVersion,
  model,
  sourceIds?,
  consentVersion?,
  createdAt,
  status
}
```

Não registrar transcrição, prompt contextual completo, notas clínicas ou resposta clínica em logs genéricos.

## Taxonomia canônica de segurança

Sessão, Supervisor e core safety usam o mesmo enum de severidade auxiliar:

```ts
type SafetySeverity = "none" | "attention" | "urgent_review"
```

Nenhum contrato pode introduzir `informational`, score numérico ou `low/medium/high` como severidade clínica autônoma. Teste de contrato deve comparar os enums entre os módulos.

## Autoridade dos dados

O contexto deve ser serializado com delimitadores explícitos, por exemplo:

- `SYSTEM_CONSTRAINTS`
- `CONSENT_STATE` (usado pelo server gate, não como instrução do usuário)
- `PATIENT_CONTEXT`
- `SELECTED_SESSION`
- `TRANSCRIPT_WINDOW`
- `CLINICIAN_NOTE`
- `RETRIEVED_SOURCE`
- `USER_QUESTION`

Conteúdo dentro desses blocos nunca altera a hierarquia de instruções.
