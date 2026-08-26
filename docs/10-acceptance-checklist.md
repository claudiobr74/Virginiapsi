# Checklist de Aceitação Final

## Gate pré-implementação

- [ ] Auditoria integral do Claude executada antes da Fase 0.
- [ ] Nenhum P0 aberto.
- [ ] Reauditoria após correções v1.4 retornou `READY`.
- [ ] Usuário autorizou explicitamente o início da implementação.

## Fundação e arquitetura

- [ ] `rg -i "firebase|firestore"` não encontra dependência operacional.
- [ ] Não há Express/Nest/Drizzle paralelo.
- [ ] Não há adapters JS/TS duplicados para o mesmo serviço.
- [ ] Nenhuma tela reimplementa modal, drawer, estado vazio, estado de carregamento, busca ou confirmação fora dos onze primitivos canônicos de `docs/02-visual-spec.md`; verificar por busca de padrões comuns de overlay/spinner/`window.confirm` fora de `src/components/ui/`.

## Visual

- [ ] Paleta Tesseli fiel.
- [ ] Inter + Playfair Display + JetBrains Mono.
- [ ] Sidebar desktop e bottom nav mobile.
- [ ] Cards rounded-3xl e hierarquia editorial.
- [ ] Dark mode fiel.
- [ ] Login acolhedor.
- [ ] Sessão clínica em modo foco.

## Supabase/Auth

- [ ] RLS em todas as tabelas de tenant.
- [ ] Storage privado com policies.
- [ ] forged JWT rejeitado pelo caminho real.
- [ ] multi-membership não usa `members[0]`.
- [ ] secretary não recebe payload clínico.
- [ ] `secretary_finance_access` none/view/manage é enforced por RLS.
- [ ] `documents`/`patient_attachments.sensitivity` é enforced por RLS e imutável após criação; Secretaria não recebe registro `clinical` em nenhuma resposta de rede.
- [ ] public_code é atômico/único por organização sob concorrência.
- [ ] service-role/secret key nunca chega ao browser.
- [ ] `audit_events` é append-only: nenhum papel de aplicação tem UPDATE/DELETE via RLS.

## Google

- [ ] login e Calendar OAuth independentes.
- [ ] refresh token criptografado.
- [ ] calendar_id selecionável.
- [ ] evento externo read-only.
- [ ] Meet criado via Calendar API com `hangoutsMeet`, `conferenceDataVersion=1` e requestId novo.
- [ ] estados Meet pending/success/failure tratados sem URL fabricada.
- [ ] idempotência e audit de writes.

## Twilio

- [ ] assinatura webhook validada.
- [ ] MessageSid idempotente.
- [ ] status callbacks.
- [ ] templates/configuração.
- [ ] consentimento/preferência.
- [ ] scheduler de reminder usa Supabase Cron/pg_cron + pg_net, não depende de Vercel Cron sub-diário.
- [ ] outbox/claim/retry idempotente e execuções sobrepostas não duplicam 24h/2h.

## Transcrição

- [ ] caminho padrão transcreve no dispositivo e nenhum áudio sai da máquina.
- [ ] grant de captura é server-generated e de vida curta.
- [ ] servidor recusa persistir segmento de transcrição sem grant válido.
- [ ] chave de provider de fallback ausente no client.
- [ ] retomada de captura não duplica segmentos.
- [ ] fallback (quando habilitado) faz upload direto ao Storage.
- [ ] nenhum áudio/base64 grande passa por Vercel.
- [ ] consent gate bloqueia grant de captura **e** signed upload grant de fallback quando inválido/revogado.
- [ ] adapter sem diarização não inventa rótulo de falante.
- [ ] erro/ambiguidade de ASR não é tratado como fato clínico.

## Gemini/IA

- [ ] server-only.
- [ ] structured output validado e fail-closed.
- [ ] resultados exigem revisão humana.
- [ ] consent gate ocorre antes de provider calls aplicáveis.
- [ ] Session AI nunca conversa com paciente.
- [ ] não há diagnóstico autônomo, avaliação psicológica autônoma ou interpretação de testes restritos.
- [ ] não há ajuste de medicação pela IA.
- [ ] perguntas de trauma/abuso/infância não são sugestivas.
- [ ] contexto cultural/desenvolvimental/neurodiversidade não é patologizado.
- [ ] Supervisor pode sinalizar necessidade de supervisão humana/competência.
- [ ] RAG cita fontes recuperadas.
- [ ] Knowledge diferencia papel/tipo de fonte.
- [ ] eficácia/segurança sem fonte adequada retorna PARCIAL/INSUFICIENTE.
- [ ] nenhum dado de outro tenant.

## Produção

O estado honesto do release gate está em `docs/25-release-gate.md` (PASS / FAIL / EXTERNAL_BLOCKED). Preview `/login` da Fase 13 = PASS; não marcar Production enquanto o `main` antigo 404-ar.

- [ ] lint/typecheck/unit/integration/E2E PASS.
- [ ] build prod PASS.
- [ ] preview Vercel PASS.
- [ ] envs documentadas.
- [ ] logs sem dados clínicos.
- [ ] rollback documentado (`docs/24-rollback.md`).


## Runtime AI
- [ ] `src/lib/ai/prompts/**` is used as runtime source-of-truth.
- [ ] Session live/preparation/closing use approved prompts and structured contracts.
- [ ] Supervisor uses approved prompt, competing hypotheses, alternatives, competence/supervision flags and human review.
- [ ] Knowledge performs retrieval first, source appraisal and is library-only by default.
- [ ] No fabricated source/citation metadata.
- [ ] Prompt injection tests pass.
- [ ] Apply-to-Case is explicit and does not ingest patient data into knowledge.
- [ ] No AI output is auto-committed to the clinical record.
