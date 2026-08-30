# Document Studio — estado atual (Fase 1)

Auditoria do módulo **Documentos** antes da transformação em Estúdio de Documentos Profissionais (VirgíniaPsi / Document Studio V3). Nenhuma implementação desta rodada precede este arquivo.

## Arquitetura existente (reutilizar)

- Aplicação única Next.js App Router + Supabase (Auth, Postgres, Storage, RLS).
- Feature folder: `src/features/documents/**`.
- PDF serverless: `pdf-lib` em `src/lib/documents/generate-pdf.ts` (A4, Helvetica, sem Chromium).
- Storage privado com zero grants a `anon`/`authenticated`; download via URL assinada (TTL 120s) depois de autorização em TypeScript: buckets `clinical-documents`, `patient-attachments`, `consents`.
- Versões append-only em `document_versions` (nunca UPDATE do corpo).
- Emissão congela PDF em `document_files` com SHA-256.
- Confirmação eletrônica interna `virginiapsi_internal` — **não** é ICP-Brasil / Gov.br.
- Placeholders `{{path}}`: não resolvidos permanecem literais (`src/lib/documents/render-template.ts`).
- Variáveis atuais: `date.today`, `professional.name`, `organization.name`, `patient.full_name|preferred_name|public_code|birth_date`.

## Schema (não editar migrations aplicadas)

- `document_kind`: `laudo | relatorio | atestado | declaracao | encaminhamento | recibo | tcle | contrato | branco | outro`
- `document_status`: `draft | issued | signed | canceled`
- Sensibilidade forçada no trigger: laudo/relatorio/atestado/encaminhamento → `clinical`; recibo → `administrative`; demais exigem valor explícito.
- RLS G2: `can_access_document(org, patient_id, sensitivity)` — clínico com `patient_id` nulo exige profissional clínico; secretária não lê `clinical`.
- Tabelas: `document_templates`, `documents`, `document_versions`, `document_files`, `patient_attachments`, `document_professional_signatures`.

## UX atual (lacunas vs. o estúdio)

| Superfície | Hoje | Falta |
|---|---|---|
| `/app/documents` | Lista + painel de modelos (textarea) | Biblioteca canônica, busca semântica, favoritos, wizard de finalidade |
| Editor | Textarea + chips de variáveis | Seções, rich-text seguro, modo foco, preview PDF do mesmo renderer |
| Identidade | `practice_settings` (nome, CRP, clínica) | Logos, papel timbrado, cores, tipografia, cabeçalho/rodapé |
| Contrato | Kind `contrato` genérico | Livreto, encontros programados, cláusulas ricas |
| IA | Ausente no módulo | Gemini 3.6 Flash, contexto selecionado, sem fabricação, revisão humana |
| Workflow | draft → issued → signed/canceled | under_review, reviewed, signature_pending, entrega, versão emitida imutável |
| PDF | Título + corpo + rodapé simples | Logo, Página X de Y, Document ID, hash, capa, livreto |

## Fluxos E2E que devem continuar passando

`tests/e2e/documents.spec.ts`: criação a partir do prontuário (textarea, Salvar rascunho, Emitir PDF, confirmação interna); “Nome do modelo” / “Criar modelo”; secretária bloqueada em clínico.

Estratégia: documentos **sem** `system_template_key` mantêm o editor clássico; o estúdio aplica-se a documentos criados pelos templates canônicos.

## Restrições desta rodada

- Não Twilio, não Receita Saúde, não ICP-Brasil, não Gov.br.
- Não copiar logo nem texto literal do contrato PDF de referência; usar lógica e profundidade.
- Não hardcodar nome da clínica, profissional ou CRP.
- SVG/WEBP: armazenar original; embed no PDF apenas PNG/JPEG (pdf-lib), sem distorcer.
- `GEMINI_MODEL_DOCUMENTS` opcional; default `gemini-3.6-flash` centralizado.

## Plano de implementação (fases 2–7)

1. Fundação: identity, logos, presets, seções, renderer único, PDF.
2. Biblioteca: ~18 templates canônicos em `src/features/documents/system-templates/`.
3. Contrato psicoterapêutico completo (tradicional + livreto).
4. IA assistida + importação seletiva do prontuário.
5. Workflow: revisão, emissão, versionamento, assinatura pendente, entrega.
6. UX: busca, favoritos, recentes, meus modelos, Configurações → Documentos.
