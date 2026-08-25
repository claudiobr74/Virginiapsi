# LGPD e Privacidade por Design — Tesseli

Este documento fecha o achado `LGPD-P1-004` da auditoria pré-implementação. Ele define papéis, operadores externos, base de transferência internacional, retenção por classe de dado e o fluxo de exclusão. **Não é parecer jurídico.** Os itens marcados `⚠ VALIDAÇÃO JURÍDICA HUMANA` exigem revisão por profissional habilitado antes de qualquer texto ser usado em produção, em especial o TCLE.

## 1. Papéis

- **Controlador**: cada clínica (`organizations` + `practice_settings`), sobre os pacientes que ela atende. Multiclínicas = várias controladoras no mesmo produto.
- **Operadora da plataforma**: quem hospeda e administra o Supabase/Vercel do produto. **Não** coincide com uma clínica. Go-live D5b (`docs/26-go-live.md`): só a plataforma autoriza criar organização. A operadora **não** usa service-role para ler prontuário de tenant no dia a dia.
- **Profissional da clínica**: membership na organização; D4b restringe o clínico ao responsável pelo paciente (detalhe de papéis na G2). A secretaria permanece sem payload clínico.
- **Suboperadores**: prestadores que processam dado em nome da controladora. Ver inventário abaixo.

⚠ VALIDAÇÃO JURÍDICA HUMANA: confirmação formal dessa qualificação (SaaS multi-controladora + allowlist de plataforma) antes de titular real. Este parágrafo **não** é parecer nem DPA.

**Região do projeto Supabase (G0, 2026-08-25):** **não registrada**. MCP/CLI sem acesso ao projeto hospedado. Sem região concreta não há base de transferência internacional preenchível. Status: **EXTERNAL_BLOCKED**. Desbloquear com o ref + região (staging e produção, D2) e reescrever a linha do Supabase na tabela abaixo.

## 2. Inventário de suboperadores e o que cada um recebe

| Suboperador | Dado recebido | Finalidade | Localização | Base de transferência internacional |
|---|---|---|---|---|
| Supabase | Todo o dado estruturado do produto (Postgres, Auth, Storage) | Persistência, autenticação, armazenamento de arquivo | **G0 EXTERNAL_BLOCKED** — região do projeto hospedado ainda não observada (`docs/26-go-live.md`). Staging e produção devem ser projetos distintos (D2). | ⚠ VALIDAÇÃO JURÍDICA HUMANA |
| Google (Calendar/Meet) | Nome do paciente + `PAC-###` (no título do evento), horário, modalidade | Agenda externa oficial e videochamada | Global (Google Workspace/Cloud) | ⚠ VALIDAÇÃO JURÍDICA HUMANA |
| Twilio | Número de telefone, conteúdo de template de mensagem | Confirmação e lembrete de consulta via WhatsApp | EUA | ⚠ VALIDAÇÃO JURÍDICA HUMANA |
| Groq — **somente se o fallback de transcrição for habilitado** | Áudio bruto da sessão (apenas no fallback) | Transcrição de fala em texto quando o dispositivo não sustenta a transcrição local | EUA | ⚠ VALIDAÇÃO JURÍDICA HUMANA — dado de saúde, exige atenção redobrada |
| Google (Gemini) | Contexto clínico minimizado — nunca áudio bruto, nunca DPEP completo indiscriminado | Supervisor IA, Session AI, Knowledge | Global (Google Cloud) | ⚠ VALIDAÇÃO JURÍDICA HUMANA — dado de saúde |

**No caminho padrão de transcrição nenhum suboperador recebe áudio de sessão**: o modelo roda no dispositivo da profissional (`docs/22-transcription-provider-decision.md`). A linha do Groq só se aplica a organizações que habilitarem explicitamente o fallback — habilitar o fallback muda o inventário e exige nova versão de consentimento.

Todo suboperador desta lista precisa estar nomeado no TCLE antes da Fase 6 entrar em uso com paciente real. Adição de novo suboperador no futuro exige atualização do TCLE e nova versão de consentimento (`consents.version`).

## 3. Retenção por classe de dado

| Classe | Prazo padrão | Onde é configurado | Rationale |
|---|---|---|---|
| Áudio bruto de fallback (`session-audio-fallback`) | 7 dias após transcrição bem-sucedida, eliminação automática | `practice_settings.session_audio_fallback_retention_days` | O áudio não tem valor após virar texto; é o dado de maior sensibilidade e maior custo de exposição em caso de vazamento. No caminho local não existe áudio persistido: ele é consumido em memória no dispositivo |
| Segmentos de transcrição (`session_transcript_segments`) | Acompanha o prontuário por padrão; organização pode fixar prazo menor | `practice_settings.transcript_retention_policy` / `transcript_retention_fixed_days` | Transcrição é insumo do DPEP; uma vez incorporada ao registro clínico, sua retenção deveria seguir a mesma regra |
| Prontuário/DPEP/working notes | Mínimo 5 anos (configurável só para cima) | `practice_settings.clinical_record_minimum_retention_years` | Guarda mínima de prontuário psicológico conforme norma profissional aplicável — ⚠ VALIDAÇÃO JURÍDICA HUMANA para confirmar o número exato e a norma vigente na data da Fase 6 |
| `ai_runs` / `ai_artifacts` (metadata) | Acompanha o prontuário | — | Metadata de execução de IA é parte do histórico clínico para fins de auditoria técnica |
| `audit_events` | Sem expiração automática | — | Trilha de auditoria é append-only e não é eliminada por rotina de retenção |
| Backup/exportação lógica | Conforme política de backup da plataforma, separada da retenção operacional | `docs/06-integrations.md` §5 | Backup de DR não é dado operacional acessível por rotina de retenção do produto |

A rotina de retenção do áudio de fallback é job assíncrono (mesmo scheduler pg_cron/pg_net da Fase 11), não decisão do modelo de IA nem do frontend.

## 4. Minimização

- `patients` administrativa não recebe dado clínico (já garantido pela separação de tabela).
- Contexto enviado a Gemini é sempre DTO minimizado — nunca a tabela inteira do paciente, nunca o histórico completo indiscriminado (ver `docs/16-runtime-ai-data-contracts.md`).
- Logs de aplicação nunca contêm transcrição, notas clínicas, corpo de prompt clínico, refresh token do Google ou auth token do Twilio (já coberto por `.cursor/rules/03-security-privacy.mdc`).
- Mensagem de WhatsApp evita conteúdo clínico no corpo — apenas confirmação/lembrete administrativo.

## 5. Direitos do titular e fluxo de exclusão

Fluxo operacional de `docs/01-product-spec.md` §5, com suporte em `patients.elimination_status`:

1. Psicóloga Administradora inicia solicitação de exclusão para um paciente.
2. Sistema gera relatório do que será eliminado versus o que precisa ser mantido (ex.: prontuário dentro da guarda mínima, registros financeiros com obrigação fiscal).
3. Confirmação forte (reautenticação ou frase de confirmação) antes de prosseguir.
4. `elimination_status` muda para `elimination_requested`, depois `partially_eliminated` ou `eliminated` conforme o que a norma permite eliminar.
5. Campos identificadores dos registros elegíveis são anonimizados por rotina server-side; o que é retido registra `elimination_retained_reason`.
6. Evento correspondente em `audit_events`.

Direitos cobertos pelo fluxo acima: eliminação. Os demais direitos do titular (acesso, correção, portabilidade) são cobertos pela exportação lógica já especificada em `docs/06-integrations.md` §5 (escopo paciente) e pelas telas normais de edição de cadastro.

⚠ VALIDAÇÃO JURÍDICA HUMANA: confirmar prazo de resposta a solicitação de titular e processo de verificação de identidade do solicitante.

## 6. Resposta a incidente

Mínimo operacional (Fase 13). **Não é parecer jurídico.**

1. **Detecção**: alerta de plataforma (Vercel/Supabase) ou relato interno. Classificar: (a) indisponibilidade sem vazamento; (b) acesso indevido a dado de titular; (c) exposição de secret/env; (d) eliminação/restore indevido.
2. **Contenção**: rotacionar o secret afetado (Vercel + Vault no mesmo valor); revogar sessões Auth se a conta foi comprometida; rollback de deploy se o binário for a causa (`docs/24-rollback.md`).
3. **Registro interno**: hora UTC, SHA, sistemas atingidos, se dado de saúde pode ter saído. Sem colar transcrição, DPEP, tokens ou números na ficha.
4. **Comunicação ao titular**: quando houver risco relevante a dado pessoal, avisar a profissional responsável pelo consultório (controladora) para contactar o titular pelos canais já usados no cuidado. Canal interno sugerido: e-mail do perfil em Configurações. Prazo alvo operacional: 72 horas após a ciência — ⚠ VALIDAÇÃO JURÍDICA HUMANA para o prazo e o conteúdo.
5. **ANPD**: avaliar notificação quando o incidente puder acarretar risco ou dano relevante ao titular (art. 48 da LGPD). A decisão é da controladora com assessoria jurídica — o produto só fornece o registro técnico. ⚠ VALIDAÇÃO JURÍDICA HUMANA: este item inteiro.

Não há ainda um canal público de “fale sobre privacidade” além do consultório. Não inventar notificação automática à ANPD.

## 7. Relação com o TCLE

O texto final do TCLE (Fase 9, usando o registro mínimo de consentimento da Fase 5.5) deve nomear, no mínimo:
- os suboperadores da seção 2, em linguagem acessível;
- como o áudio é transcrito: no caminho padrão, no próprio dispositivo, sem sair dele; se a organização habilitar o fallback, que o áudio é processado por serviço de transcrição fora do país e eliminado após uso conforme seção 3;
- que apoio de IA (Supervisor/Session AI) processa contexto clínico minimizado, nunca decide sozinho, e todo resultado passa por revisão humana antes de entrar no prontuário;
- os prazos de retenção da seção 3, em linguagem acessível;
- como exercer os direitos da seção 5.

⚠ VALIDAÇÃO JURÍDICA HUMANA obrigatória sobre o texto final antes do primeiro uso com paciente real.
