# Segurança, RBAC, RLS e LGPD

## Princípios

1. Supabase RLS é enforcement de tenant.
2. RBAC do servidor complementa RLS.
3. “Ocultar botão” não é autorização.
4. service-role só server-side e excepcional.
5. conteúdo clínico é minimizado em logs e integrações.

## Funções SQL sugeridas

Criar helpers estáveis, testados e sem recursão de policy:

- `is_org_member(org_id uuid)`
- `has_org_role(org_id uuid, allowed_roles text[])`
- `is_psychologist_admin(org_id uuid)`
- `is_clinical_practitioner(org_id uuid)`
- `can_access_patient_clinical(org_id uuid, patient_id uuid)` — responsável + papel clínico
- `is_platform_operator()`

Contrato obrigatório dos helpers usados para evitar recursão de RLS:
- `returns boolean` (ou tipo escalar explícito quando aplicável);
- `language sql`;
- `stable`;
- `security definer` somente para helpers que precisam consultar membership/settings sem recursão;
- `set search_path = ''`;
- toda referência a tabela/função deve ser schema-qualified (ex.: `public.organization_members`, `auth.uid()`);
- proprietário controlado; `REVOKE ALL FROM PUBLIC`; conceder apenas o `EXECUTE` mínimo a `authenticated` quando necessário;
- helpers nunca aceitam `user_id` fornecido pelo cliente como autoridade: usam `auth.uid()` internamente.

Adicionar helper de permissão financeira, por exemplo `secretary_finance_access(org_id uuid)`, que lê exclusivamente `practice_settings.secretary_finance_access` da organização já validada.

## Matriz resumida

| Recurso | psychologist_admin | psychologist | secretary |
|---|---:|---:|---:|
| patients administrativos | CRUD todos | só se responsável | CRUD conforme permissão |
| patient_clinical_profile | só se responsável | só se responsável | NENHUM |
| appointments | CRUD todos | só se responsável | CRUD |
| calendar sync (conexão Google) | CRUD | leitura da agenda dos seus | CRUD permitido |
| session DPEP | só se responsável | só se responsável | NENHUM |
| clinical working notes | só se responsável | só se responsável | NENHUM |
| transcripts | só se responsável | só se responsável | NENHUM |
| supervisor/AI clinical | só se responsável | só se responsável | NENHUM |
| knowledge (biblioteca da clínica) | CRUD | CRUD | NENHUM |
| finance | R/W + void/audit (sem hard delete) | NENHUM | conforme `secretary_finance_access`: none/view/manage |
| documents/patient_attachments | clínico só se responsável; administrativo todos | clínico só se responsável; administrativo dos seus | somente `sensitivity = 'administrative'` |
| settings/security/team | CRUD | NENHUM | NENHUM |
| criar `organizations` | NENHUM | NENHUM | NENHUM (só `platform_operators`) |

## Permissão financeira da Secretaria

`practice_settings.secretary_finance_access` é enforcement de banco, não toggle visual:
- `none`: policies de SELECT/INSERT/UPDATE/DELETE negam acesso financeiro à Secretaria;
- `view`: somente SELECT;
- `manage`: SELECT/INSERT/UPDATE operacional;
- DELETE físico de charges/payments/expenses/plan movements/closings permanece negado; usar estados de void/cancel/estorno com auditoria.

A UI deve refletir a policy, mas nunca substituí-la. Testes RLS devem cobrir os três estados.

## Autenticação

- não aceitar JWT forjado;
- não usar fallback unsigned;
- não confiar em `decodeJwt` como verificação;
- server routes sensíveis validam usuário por Supabase server client;
- testes adversariais devem chamar o código real da camada de autenticação.

## Multi-membership

- nunca `members[0]` como autorização;
- seleção de organização não concede acesso;
- toda query e policy valida membership do usuário autenticado;
- teste obrigatório: usuário membro de A e B, contexto B retorna B; usuário só A tentando B recebe 403/RLS denial.

## Storage

Buckets privados, por exemplo:

- `clinical-documents`
- `consents`
- `patient-attachments`
- `practice-assets` (retrato da profissional; zero policies em `storage.objects`; leitura só por signed URL)
- `knowledge-sources`
- `session-audio-fallback` (se ativado)

Path inclui `organization_id` e, quando aplicável, `patient_id`.

Links de download são signed URLs de curta duração.

## Tokens Google

- refresh token criptografado com AES-GCM ou mecanismo equivalente server-side;
- chave de criptografia só no Vercel Secret;
- state OAuth assinado e ligado ao usuário/organização;
- validar redirect;
- tratar revogação/expiração.

## Twilio webhooks

- validar assinatura oficial;
- não processar status/inbound se assinatura inválida;
- deduplicar por MessageSid/Event identity;
- limitar tamanho do body;
- logs sem mensagem completa por padrão.

## IA

- chave server-side;
- prompt injection mitigations no RAG;
- fontes recuperadas tratadas como dados, não instruções;
- resultado clínico é apoio e exige revisão;
- não criar automações que alterem prontuário sem confirmação humana.

## Áudio/transcrição

- no caminho padrão o áudio é transcrito no dispositivo e não trafega para nenhum provider;
- chave de provider de fallback (`GROQ_API_KEY`) é server-only e nunca vai ao browser;
- grant de captura de vida curta por sessão autenticada, emitido somente após o consent gate;
- servidor recusa persistir segmento de transcrição sem grant de captura válido;
- rate limit dos endpoints de grant: 30 requisições/min por IP, janela deslizante **best-effort por instância** (`src/lib/security/rate-limit.ts`) — não é cota global de cluster na Vercel;
- teto de body nos grants/segmentos (64 KiB), metadata de transcribe (16 KiB) e webhooks Twilio (32 KiB);
- rate limit das server actions de IA (Supervisor, Session AI, Knowledge): 20/min por organização + usuário, mesma janela in-memory;
- fallback de áudio privado e temporário;
- o bucket `session-audio-fallback` não pode ter INSERT genérico baseado apenas em membership: capacidade de upload deve ser emitida server-side somente após o mesmo consent gate de gravação/transcrição;
- política de retenção configurável;
- nunca base64 grande em JSON.

## Testes obrigatórios antes de produção

- forged JWT real path;
- tenant isolation;
- role isolation;
- storage isolation;
- Google OAuth state replay/tamper;
- Twilio invalid signature;
- idempotent webhooks;
- URL signed expiration;
- secretary cannot receive clinical payload;
- logs do fluxo clínico não contêm transcrição.
