# Document Studio V3 — auditoria pós-implementação

**Projeto:** VirgíniaPsi (repositório `claudiobr74/serenapsi`, alias Virginiapsi)  
**Branch:** `cursor/document-studio-v3-ec92`  
**Base:** `main` (`bdc799b`)  
**Data:** 30/08/2026  
**Escopo:** transformar o módulo Documentos no Estúdio de Documentos profissionais, sem stack paralela, sem Twilio, sem ICP-Brasil/Gov.br/Receita Saúde.

**Recomendação:** `READY_WITH_FIXES`

Os critérios de pronto da seção 124 do master prompt estão atendidos na prática: a profissional consegue gerar, revisar, emitir e entregar um PDF A4 com identidade configurável, texto desenvolvido e o mesmo renderer no preview. Correção pós-revisão de IA (30/08): o gate `aiProcessingAllowed` passa a valer em **toda** chamada Gemini com `patient_id`, independentemente de importar o prontuário; o contexto vai em `packContext`; a saída é JSON validado (fail-closed).

Os “fixes” restantes são polimento (editor visual, busca semântica, diff visual, catálogo além do primeiro lote) — não bloqueiam o uso profissional do primeiro lote.

---

## 1. Arquitetura final

Aplicação única Next.js App Router + Supabase. Nenhuma API paralela, nenhum ORM duplicado, nenhum Firebase.

| Camada | Onde |
|---|---|
| Contratos Zod | `src/features/documents/contracts.ts`, `branding-contracts.ts` |
| Ações servidor | `studio-actions.ts`, `branding-actions.ts`, `actions.ts` (caminho clássico) |
| Queries | `queries.ts`, `branding-queries.ts` |
| Templates canônicos | `src/features/documents/system-templates/**` (código versionado, somente leitura) |
| PDF único | `src/lib/documents/studio-pdf.ts` — preview (`/app/documents/[id]/preview`) e emissão chamam a mesma função |
| Caminho clássico | documentos **sem** `system_template_key` continuam no textarea + `generate-pdf.ts` (`classicMode`) |
| IA | `src/lib/ai/documents-model.ts` + `RUNTIME_PROMPTS.documentStudio` |
| Identidade | Configurações → aba **Documentos** (`BrandingSettingsPanel`) |

Fluxo: **Documentos → Novo → modelo/paciente/finalidade → gerar estrutura → editar seções → preview PDF → revisar → emitir → registrar entrega.**

Confirmação eletrônica interna (`virginiapsi_internal`) **não** é assinatura digital ICP/Gov.br.

---

## 2. Migrations

Não se editou migration já aplicada. Novos arquivos:

1. `supabase/migrations/20260830170000_document_studio_enums.sql`  
   - `document_kind`: `parecer`, `autorizacao`, `requerimento`, `protocolo`  
   - `document_status`: `under_review`, `reviewed`, `signature_pending`, `externally_signed`, `delivered`

2. `supabase/migrations/20260830170100_document_studio.sql`  
   - Colunas de estúdio em `documents` / `document_versions` / `document_templates`  
   - `parecer` força `sensitivity = clinical` (inclusive sem `patient_id`)  
   - `autorizacao|requerimento|protocolo` forçam `administrative`  
   - Tabelas: `document_branding`, `document_logos`, `document_visual_profiles`, `document_template_favorites`, `document_delivery`, `document_external_signature_metadata`  
   - Bucket privado `document-branding` **sem** policy aberta em `storage.objects` (download por URL assinada após autorização em TypeScript)  
   - Branding/logos: SELECT para membro da org; INSERT/UPDATE só `psychologist_admin`  
   - Entrega de documento clínico: secretária não insere

Versões de conteúdo continuam **append-only** em `document_versions`. Documento emitido não sofre edição in-place do corpo.

---

## 3. Templates implantados (primeiro lote — 18)

Cada um tem finalidade, seções, orientações, guardrails e `aiInstructions` próprios. Teste de regressão: 18 corpos únicos, cada um com mais de 400 caracteres, sem padrão “Demanda: Ansiedade.”.

| # | Chave | Nome |
|---|---|---|
| 1 | `declaration_attendance` | Declaração de comparecimento |
| 2 | `declaration_follow_up` | Declaração de acompanhamento |
| 3 | `psychological_certificate` | Atestado psicológico (confirmação humana de fundamentação) |
| 4 | `psychological_report_complete` | Relatório psicológico completo |
| 5 | `report_to_physician` | Relatório para médico |
| 6 | `report_to_psychiatrist` | Relatório para psiquiatra |
| 7 | `report_health_plan` | Relatório para plano de saúde |
| 8 | `report_school` | Relatório escolar |
| 9 | `report_multiprofessional` | Relatório multiprofissional |
| 10 | `psychological_laudo` | Laudo (exige confirmação de avaliação compatível) |
| 11 | `psychological_opinion` | Parecer (permite ausência de paciente) |
| 12 | `referral_generic` | Encaminhamento genérico |
| 13 | `referral_psychiatry` | Encaminhamento para psiquiatria |
| 14 | `psychotherapy_contract_complete` | Contrato psicoterapêutico completo (tradicional / livreto) |
| 15 | `psychotherapy_contract_online` | Contrato de atendimento online (corpo distinto do completo) |
| 16 | `minor_authorization` | Autorização para menor |
| 17 | `document_request` | Requerimento de documento |
| 18 | `delivery_protocol` | Protocolo de entrega |

Catálogo ampliado (declarações extras, demais especialidades de encaminhamento, TCLE dedicado, etc.) ficou de fora de propósito: qualidade do lote > quantidade.

Contrato de referência da proprietária: usado como **lógica e profundidade** (abertura institucional, encontros programados, cláusulas desenvolvidas). Logo antiga e texto literal **não** foram copiados. Nomes, CRP e clínica vêm do branding / variáveis.

---

## 4. Identidade visual

Configurações → **Documentos**:

- Dados da clínica e da profissional (exibição item a item)
- Cores (principal, secundária, títulos, divisores)
- Tipografia: Clássica / Moderna / Institucional / Editorial (no PDF: Times vs Helvetica, fontes padrão PDF — adequadas à impressão)
- Papel timbrado: Clínico, Minimalista, Institucional, Profissional, Premium
- Perfis: Essencial, Clínica, Institucional, Premium, com mapa por categoria
- Logos: PNG, JPG, JPEG, WEBP, SVG; variantes (principal, horizontal, compacta, monocromática, profissional, outra); uma pode ser padrão
- Por documento: logo da clínica / variante / sem logo; alinhamento; tamanho com teto 24–140 pt (não estica)
- SVG na tela; **PDF embute só PNG/JPEG** (`pdf-lib`)
- Cancelamento configurável (default 24 h, 1–168 h)
- Cláusula informativa de IA **opcional** no branding — consentimento específico de IA permanece separado

---

## 5. Renderer e PDF

- A4 (595×842 pt)
- Cabeçalho/rodapé a partir do branding
- `Página X de Y`, Document ID, versão, hash (quando ligados)
- Quebra de página, headings, listas, tabelas simples, negrito/itálico via marcação
- Livreto: abertura institucional; capa opcional em documentos longos
- Bloco de assinatura manuscrita (linhas + identificação; sem ICP)
- Preview = iframe da rota `/preview` = `generateStudioPdf`

Teste unitário: PDF multipágina, dimensões A4, logo PNG, SVG ignorado no embed.

---

## 6. Editor e workflow

- Seções `DocumentSection` (título, conteúdo, ordem, ativa, quebra)
- Adicionar: Texto, Análise, Conclusão, Observação, Tabela, Referências, Página nova
- Reordenar, modo foco, autosave (“Salvo agora”) sem reverter `reviewed` → `draft`
- Marcação segura (`#`, `**`, listas, tabela, `[page-break]`) — não é clone de Word
- Importar do prontuário com seleção (não envia o prontuário inteiro)
- Importar encontros futuros da agenda (editáveis)
- Comparar versões (snapshot textual)
- Duplicar / salvar como modelo da clínica
- Checklist de emissão: preview conferido; revisão humana em clínico; atestado/laudo com confirmações específicas
- `{{placeholder}}` não resolvido **bloqueia** emissão (não vira vazio)
- Status: draft → under_review / reviewed → issued → signature_pending / externally_signed / delivered / canceled
- Entrega: destinatário, data, método (presencial / download seguro / e-mail / outro), recebimento, devolutiva — **sem Twilio**

Auditoria: `document_created`, `document_updated`, `document_template_used`, `document_ai_draft_generated`, `document_reviewed`, `document_issued`, `document_signature_registered`, `document_delivered` (e duplicação de modelo).

---

## 7. IA

- Modelo padrão **`gemini-3.6-flash`**, override único `GEMINI_MODEL_DOCUMENTS`
- Prompt em `src/lib/ai/prompts/documents/studio.ts`, composto em `RUNTIME_PROMPTS.documentStudio` com o núcleo clínico
- **`RUNTIME_PROMPT_VERSION` permanece `1.2.0`** (não foi incrementado)
- **Consentimento:** `authorizeDocumentStudioAi(..., "provider")` exige `aiProcessingAllowed` em **toda** chamada Gemini com `patient_id`, mesmo sem importar o prontuário. Omitir `selectedContext` não contorna o gate. Parecer sem paciente não resolve consentimento de titular. Prévia do envelope (`preview`) exige só acesso clínico.
- Contexto empacotado com `packContext` (`DOCUMENT_BODY`, `CLINICIAN_ANSWERS`, `SELECTED_CHART_CONTEXT` como dados).
- Saída estruturada (`DOCUMENT_STUDIO_DRAFT_SCHEMA` + Zod `.strict()`); malformação falha fechada; a action não altera `status`.
- Prévia com hash SHA-256 do envelope; emissão da IA exige hash coincidente.
- TCLE `tcle-2026-08-v2` inclui redação assistida de documentos como finalidade do Gemini.
- Modos: Manual / Assistido; comandos de redação no editor
- Proibição de fabricação (diagnóstico, CID, DSM, sintomas, fatos, datas, sessões, testes, técnicas, resultados, medicamentos, profissionais, acontecimentos, referências)
- Atestado/laudo: decisão humana, não da IA
- Contrato principal **não** embute consentimento completo de IA

---

## 8. Segurança

- Multi-tenant preservado (`is_org_member` / `can_access_document`)
- Secretaria **não** lê `sensitivity=clinical` (relatório, laudo, atestado, parecer, encaminhamento)
- Parecer sem `patient_id` continua clínico
- Sem service role no frontend; logos/PDFs por URL assinada
- Bucket `document-branding` sem policy de INSERT para `authenticated`
- Comprovante interno de pagamento: aviso de que **não** é documento fiscal (Receita Saúde fora desta rodada)

---

## 9. Testes (executados nesta rodada)

| Comando | Resultado | Evidência |
|---|---|---|
| `pnpm lint` | **PASS** | eslint sem erros |
| `pnpm typecheck` | **PASS** | `next typegen` + `tsc --noEmit` |
| `pnpm test` | **PASS** | 66 arquivos, **365/365** (após correção do gate de IA) |
| `pnpm test:security` | **PASS** | 16 arquivos, **175/175** (Postgres local `127.0.0.1:5432`) |
| `pnpm test:e2e` | **PASS** | **194/194** (desktop + mobile Chromium, 8,1 min) |
| `pnpm build` | **PASS** | Next.js 16.3.1 compilou |
| `pnpm scan:client-bundle` | **PASS** | 59 chunks, nenhum nome de env server-only |

E2E do estúdio (os quatro fluxos pedidos):

1. Declaração → gerar → preview → emitir → PDF → entrega — **PASS** (desktop e mobile)
2. Relatório psicológico → contexto/IA opcional → editar → preview → revisar → emitir — **PASS**
3. Contrato completo livreto → identidade/regras → preview multipágina → emitir — **PASS**
4. Parecer sem `patient_id` → produzir → emitir — **PASS**

O fluxo clássico (`tests/e2e/documents.spec.ts`: textarea, modelo, secretária bloqueada, anexos, TCLE) também **PASS**.

**P1, corrigido:** preview de rascunho e PDF emitido usam o mesmo bloco de assinatura manuscrita (`includeManualSignature: true`).

---

## 10. Problemas encontrados durante a implementação

| Item | Tratamento |
|---|---|
| Typecheck: `renderTemplate` / tipos de status / CRP UF | Corrigido; CRP só de `document_branding.crp_state` |
| Lint: `"use server"` exportando constantes de IA | `DOCUMENT_AI_COMMANDS` movido para `contracts.ts` |
| 17 corpos únicos em 18 templates (contratos iguais) | Contrato online passou a forçar cláusulas digitais + seção de escopo |
| Gate de IA só rodava se houvesse importação de prontuário (P0 da revisão runtime) | Consentimento em toda chamada com `patient_id`; `packContext`; JSON + Zod; hash da prévia |
| Template `parecer` podia nascer `administrative` (P1 RLS) | Trigger força `default_sensitivity` pelo `document_kind` |
| `print_storage_path` sem prefixo de org (P1) | Trigger + validação TypeScript |
| Hash de logo no cliente | Web Crypto (`crypto.subtle`), sem `node:crypto` |
| Rebase em `main` sem o PR de integridade `#26` | Importação de prontuário via `chart-import.ts`; PDF clássico reexporta o renderer do estúdio |

Nenhum gate ficou EXTERNAL_BLOCKED.

---

## 11. Pendências (fixes — não bloqueiam o lote 1)

1. **Editor visual:** a marcação é editada em `textarea` com dicas (`**negrito**`, listas). Um toolbar WYSIWYG leve melhoraria a percepção, sem virar Word.
2. **Busca:** tokens no nome/descrição/destinatários — não é fuzzy/embeddings.
3. **Comparar versões:** mostra `body_snapshot` em texto, não um diff visual lado a lado do PDF.
4. **Catálogo:** demais declarações, especialidades de encaminhamento e termos além do lote de 18.
5. **Tipografia PDF:** fontes padrão (Helvetica/Times) — compatíveis com impressão; webfonts embutidas seriam um passo posterior.
6. **Encontros programados:** importação de consultas futuras da agenda existe; não há editor dedicado de série recorrente (dia/hora/frequência) além dos campos/placeholders editáveis.
7. **E2E de Configurações:** o teste ainda fala em “oito seções”; a aba Documentos é a nona (o teste continua passando porque verifica as oito originais).
8. **Assinatura digital / Receita Saúde / Twilio:** fora de escopo, como pedido. Arquitetura de `document_external_signature_metadata` (`manual`, `govbr_external`, `icp_external`, `other_verified`) está preparada, sem provedor.

---

## 12. Veredito

```text
READY_WITH_FIXES
```

O Estúdio de Documentos deixa de ser “formulário que gera PDF” e passa a ser o lugar onde a clínica produz documentos profissionais: dados estruturados → narrativa editável → identidade visual → preview idêntico ao PDF → revisão humana → emissão imutável → entrega auditada.

Pode-se imprimir ou enviar o primeiro lote sem passar pelo Word. Os fixes listados são evolução de UX e de catálogo, não regressão de segurança nem de arquitetura.
