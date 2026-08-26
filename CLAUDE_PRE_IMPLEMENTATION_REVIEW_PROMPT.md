# Prompt para Claude — Auditoria Integral Pré-Implementação do Tesseli

Você está no Cursor, com o repositório completo do **Tesseli** aberto.

## REGRA ABSOLUTA DESTA ETAPA

**NÃO IMPLEMENTE NADA. NÃO CRIE O APP. NÃO ALTERE ARQUIVOS DE CÓDIGO, MIGRATIONS, CONFIGURAÇÕES OU PROMPTS CLÍNICOS.**

Esta etapa é exclusivamente uma **auditoria integral pré-implementação**. Seu trabalho é compreender, confrontar e revisar o projeto inteiro antes que qualquer código de produto seja escrito.

Se encontrar erro, contradição ou lacuna, **relate e proponha a correção**, mas não aplique a correção sem autorização explícita do usuário.

## 1. LEITURA OBRIGATÓRIA

Antes de emitir qualquer conclusão, leia integralmente e cruze entre si:

- `README.md`
- `MASTER_PROMPT.md`
- `VISUAL_MASTER_PROMPT.md`
- `AGENTS.md`
- `PROJECT_MANIFEST.json`
- `.env.example`
- todos os arquivos de `.cursor/rules/**`
- todos os arquivos de `.cursor/agents/**`
- todos os arquivos de `.cursor/skills/**`
- todos os arquivos de `docs/**` (incluindo `docs/18-preimplementation-fixes-v1.3.md`)
- todos os arquivos de `prompts/**`
- todos os arquivos de `src/lib/ai/prompts/**`
- todos os arquivos de `src/lib/ai/contracts/**`
- especificação e asset de marca em `public/brand/**`

Não conclua a auditoria com base em amostragem. O objetivo é revisar **todo o projeto de especificação**.

## 2. HIERARQUIA DE FONTE DE VERDADE

Use esta ordem ao identificar conflitos:

1. `docs/` para produto/arquitetura e `src/lib/ai/prompts/**` para comportamento clínico em runtime;
2. `src/lib/ai/contracts/**` para contratos estruturados de IA;
3. `.cursor/rules/**`;
4. prompt da fase;
5. demais arquivos auxiliares.

Se duas fontes de verdade de mesmo nível divergirem, marque como **BLOCKER** e não escolha silenciosamente uma delas.

## 3. NÃO ALTERE RUNTIME CLINICAL PROMPTS

Os textos em `src/lib/ai/prompts/**` são comportamento clínico deliberado do produto.

Você pode:
- verificar consistência;
- detectar conflito;
- detectar schema incompatível;
- detectar risco técnico/ético;
- propor alteração em relatório.

Você NÃO pode:
- "melhorar" o texto por conta própria;
- resumir/remover limites;
- alterar abordagem clínica;
- relaxar human-in-the-loop;
- permitir diagnóstico autônomo;
- permitir auto-commit;
- permitir Knowledge usar memória geral do modelo no modo padrão.

## 4. AUDITORIA POR DOMÍNIO

Revise obrigatoriamente os seguintes domínios.

### A. Produto e escopo

Verifique:
- se todos os módulos têm objetivo e fronteira claros;
- se existem requisitos contraditórios;
- se fluxos de Psicóloga Administradora e Secretaria são coerentes;
- se estados empty/loading/error/permission/offline estão previstos;
- se existe fluxo impossível ou dependência circular;
- se escopo de MVP/fases é executável.

### B. Arquitetura

Verifique:
- Next.js App Router como aplicação única;
- Supabase Postgres/Auth/Storage/RLS como backend;
- ausência de backend paralelo desnecessário;
- boundaries browser/server/admin;
- separação por feature;
- fluxo de secrets;
- idempotência;
- timezones;
- jobs/cron quando necessários;
- compatibilidade com Vercel;
- ausência de dependências arquiteturais que contradigam a especificação.

### C. Supabase, Auth, RBAC e RLS

Faça threat modeling para:
- JWT forjado;
- token expirado/revogado;
- IDOR;
- cross-tenant access;
- multi-membership;
- uso indevido de `organization_id` do cliente;
- service role leakage;
- policies ausentes/recursivas;
- storage policies;
- Secretaria acessando conteúdo clínico;
- autorização apenas no frontend;
- migrations não idempotentes ou sem rollback/forward strategy.

### D. Dados clínicos e LGPD/privacy-by-design

Revise:
- minimização;
- finalidade;
- segregação de dados administrativos x clínicos;
- logs/analytics;
- auditoria;
- retenção/eliminação;
- exportação;
- consentimentos;
- gravação/transcrição;
- acessos internos;
- backups;
- dados em provedores externos;
- dados sensíveis em mensagens de erro.

Não dê parecer jurídico definitivo. Marque itens que exigem validação jurídica/privacidade humana.

### E. Google Calendar + Meet

Verifique:
- OAuth separado do login quando aplicável;
- offline access/refresh token;
- armazenamento protegido;
- scopes mínimos;
- `calendar_id` explícito;
- timezone;
- eventos externos versus gerenciados;
- sync conflicts;
- idempotência;
- webhooks/polling se previstos;
- Meet exclusivamente via Calendar `conferenceData`;
- revogação/desconexão.

### F. Twilio / WhatsApp

Verifique:
- consentimento/preferência;
- templates;
- inbound webhook;
- validação de assinatura;
- status callback;
- idempotência por MessageSid;
- retries;
- opt-out;
- segredo server-only;
- vazamento de conteúdo clínico em mensagens.

### G. Transcrição

Verifique:
- grant de captura server-side de vida curta;
- caminho padrão transcreve no dispositivo, sem áudio saindo da máquina;
- não exposição da API key do provider de fallback;
- retomada de captura sem duplicar segmentos;
- diarização/identificação de falantes somente se tecnicamente confiável e especificada; sem ela, não inventar falante;
- final/interim transcript;
- falhas e erros de reconhecimento;
- consentimento válido antes de gravação/transcrição;
- fallback por upload direto privado;
- nenhuma passagem de áudio/base64 grande pelo Vercel;
- política de retenção do áudio;
- impacto clínico de erro de ASR.

### H. Runtime Clinical AI — Sessão

Compare prompts, contratos, docs e fases.

Confirme:
- IA nunca conversa diretamente com paciente;
- live é apoio seletivo e não intrusivo;
- transcrição é tratada como provisória;
- não há inferência de emoção por voz/face;
- perguntas não são sugestivas;
- trauma não dispara técnica intensiva automaticamente;
- nenhuma avaliação psicológica/teste restrito é automatizado;
- segurança é sinalização auxiliar e não escore de risco;
- DPEP é rascunho;
- técnica sugerida nunca vira técnica realizada;
- existe confirmação humana antes de persistência;
- consentimento de IA/gravação/transcrição é gate técnico real, não apenas texto de prompt.

### I. Runtime Clinical AI — Supervisor

Confirme:
- Supervisor é apoio, não substituto de supervisão humana;
- formulação é hipótese dinâmica;
- TCC/Esquema não são forçados;
- outras abordagens só aparecem quando selecionadas/solicitadas;
- hipóteses concorrentes têm evidência favorável/contrária/alternativas;
- objetivos, preferências, recursos e contexto aparecem;
- crianças/adolescentes e casal/família não são tratados como adulto individual padrão;
- diversidade/neurodivergência não é patologizada;
- diagnóstico permanece hipotético quando solicitado;
- não há interpretação de teste psicológico restrito;
- medicação não é prescrita/ajustada;
- competência e necessidade de supervisão humana podem ser sinalizadas;
- risco/ética não geram ação autônoma.

### J. Runtime Clinical AI — Knowledge/RAG

Confirme:
- library-only por padrão;
- retrieval acontece antes da resposta;
- source IDs são validados;
- citação/página não pode ser inventada;
- prompt injection em documentos não altera system prompt;
- fonte teórica, livro, estudo primário, revisão e guideline não são tratados como equivalentes;
- pergunta de eficácia/segurança exige fonte adequada ou retorna parcial/insuficiente;
- Apply-to-Case é opt-in;
- dados de paciente não entram no acervo;
- fonte, dado do caso, inferência e sugestão permanecem separados.

### K. Structured outputs e contratos

Verifique cada runtime prompt contra seu schema:
- todos os campos exigidos podem ser produzidos pelo prompt;
- enums coincidem;
- nomes não divergem entre prompt/UI/docs;
- ausência de campo não causa incentivo a inventar;
- parsing falha de modo seguro;
- schema inválido nunca é persistido;
- citation validator ocorre após schema validation.

### L. UX e identidade visual

Verifique:
- visual spec, tokens e blueprint não se contradizem;
- desktop/mobile;
- acessibilidade;
- estados de erro/permissão;
- sessão clínica com baixa distração;
- logo oficial usada sem modificação;
- dark mode não altera o asset oficial;
- Secretaria nunca recebe UI clínica por engano.

### M. Testes

Avalie se a matriz cobre no mínimo:
- unit;
- integration;
- RLS real;
- E2E;
- contract tests;
- prompt injection;
- malformed AI output;
- fabricated citation;
- transcript ambiguity/negation;
- cross-tenant;
- secretary clinical denial;
- multi-membership;
- idempotência Google/Twilio;
- consent gate;
- no auto-commit;
- no secrets client-side.

Identifique testes que estão descritos mas seriam mocks incapazes de provar o comportamento real.

### N. Deploy/operabilidade

Verifique:
- env contract;
- preview/prod separation;
- Supabase migrations;
- seed/test data;
- Vercel limits;
- observabilidade sem PHI/PII clínica;
- error handling;
- rate limits;
- retries;
- feature flags necessários;
- rollback;
- health checks;
- external blockers.

## 5. VERIFICAÇÃO DE ATUALIDADE TÉCNICA

Quando o projeto depender de comportamento atual de Next.js, Supabase, Vercel, Google APIs, Twilio, provider de transcrição, Gemini/Google GenAI ou Cursor:

- consulte documentação OFICIAL atual se o ambiente permitir;
- prefira documentação primária;
- não confie em memória para APIs, limites, nomes de SDK, versões, redirects, scopes ou payloads que podem ter mudado;
- registre no relatório o que foi verificado externamente e a data;
- se não houver acesso à documentação, marque `NEEDS_OFFICIAL_DOC_VERIFICATION` em vez de adivinhar.

## 6. COMO REPORTAR ACHADOS

Classifique cada achado:

- **P0 BLOCKER** — impede iniciar implementação com segurança/correção.
- **P1 HIGH** — deve ser corrigido antes da fase afetada.
- **P2 MEDIUM** — não bloqueia bootstrap, mas precisa de correção planejada.
- **P3 LOW** — melhoria/clareza/manutenção.

Para cada achado informe:

1. ID único, ex.: `ARCH-P0-001`;
2. severidade;
3. domínio;
4. arquivo(s) e linha(s)/seção(ões);
5. descrição objetiva;
6. por que importa;
7. cenário de falha real;
8. correção recomendada;
9. arquivos que precisariam mudar;
10. testes necessários após correção;
11. se bloqueia implementação: SIM/NÃO.

Não gere achados vagos como "melhorar segurança".

## 7. TESTE DE CONSISTÊNCIA CRUZADA

Crie uma matriz e confronte explicitamente:

- `docs` ↔ `rules`;
- `docs` ↔ `prompts de fase`;
- `runtime prompts` ↔ `contracts`;
- `runtime prompts` ↔ `test matrix`;
- `data model` ↔ `RLS`;
- `RBAC` ↔ UI/rotas;
- `integrations` ↔ env contract;
- `visual spec` ↔ screen blueprint;
- `implementation phases` ↔ acceptance checklist.

Toda inconsistência deve virar achado ou ser declarada como resolvida pela hierarquia de autoridade.

## 8. VERIFICAÇÃO ESPECÍFICA DA REVISÃO TÉCNICA v1.3

Além da auditoria integral, confirme explicitamente que os achados da primeira auditoria foram fechados:

- Supervisor aceita `none|attention|urgent_review` e a taxonomia é única entre core, Session e Supervisor;
- lembretes 24h/2h usam Supabase Cron/`pg_cron` + `pg_net` + outbox idempotente, sem dependência de Vercel Cron sub-diário;
- consent gate antecede o grant de captura de sessão **e** o signed upload grant do fallback;
- retomada de captura não duplica segmentos de transcrição;
- permissão financeira da Secretaria é `none|view|manage` no modelo e no enforcement RLS;
- `public_code` é gerado atomicamente por organização e tem constraint única;
- Meet usa `hangoutsMeet`, requestId novo e trata `pending|success|failure`;
- helpers `SECURITY DEFINER` são STABLE, `search_path`-safe, schema-qualified e minimamente expostos;
- transcript segments têm `unique(session_id, sequence)`;
- a assimetria de Knowledge ingestion/retrieval está documentada como intencional;
- existe somente uma fonte canônica para este prompt de auditoria;
- exportação lógica tem contrato versionado, hashes e entrega privada.

Se qualquer item acima permanecer inconsistente, reporte-o com severidade apropriada; não presuma que está resolvido apenas por estar listado aqui.

## 8b. VERIFICAÇÃO ESPECÍFICA DA REVISÃO TÉCNICA v1.4

Além dos itens acima, confirme que os achados da segunda auditoria (`docs/20-preimplementation-fixes-v1.4.md`) permanecem fechados:

- Fase 5.5 (Consentimentos mínimos) existe, precede a Fase 6 como pré-requisito bloqueante, e nenhum gate de Fase 6 aceita `ConsentState` mockado;
- `documents` e `patient_attachments` têm coluna `sensitivity: administrative | clinical`, imutável após criação, e a matriz de RLS/testes está escrita sobre essa coluna, não sobre visibilidade de UI;
- os contratos de `src/lib/ai/contracts/**` permanecem no dialeto JSON Schema original; existe adapter de schema documentado para a superfície real da API e validador Zod fail-closed equivalente ao contrato;
- `docs/19-lgpd-privacy.md` existe e nomeia os suboperadores (Supabase, Google Calendar/Meet, Twilio, Gemini, e Groq somente quando o fallback de transcrição estiver habilitado), com retenção definida por classe de dado e colunas correspondentes em `practice_settings`/`patients`;
- quando o provider de transcrição oferecer diarização, a atribuição de falante é tratada como provisória, nunca fato clínico sem confirmação; quando não oferecer, nenhum falante é inventado (`docs/22-transcription-provider-decision.md`);
- `clinical_sessions.version` implementa controle de concorrência otimista (409); nenhuma especificação de lock explícito de sessão foi reintroduzida sem decisão de produto registrada;
- `audit_events` é append-only — nenhuma policy concede UPDATE/DELETE a papel de aplicação;
- `.env.example`/`docs/09-env-contract.md` usam a geração nova de chaves Supabase (`sb_publishable_`/`sb_secret_`), não a legada.

Se qualquer item acima permanecer inconsistente, reporte-o com severidade apropriada; não presuma que está resolvido apenas por estar listado aqui.

## 9. SAÍDA OBRIGATÓRIA

Produza primeiro no chat um resumo executivo e depois proponha criar o arquivo:

`PRE_IMPLEMENTATION_AUDIT.md`

Estrutura do relatório:

1. **Verdict**: `READY`, `READY_WITH_FIXES` ou `NOT_READY`.
2. **Resumo executivo**.
3. **P0 blockers**.
4. **P1 high findings**.
5. **P2/P3 findings**.
6. **Matriz de consistência cruzada**.
7. **Threat model resumido**.
8. **Revisão Runtime Clinical AI**.
9. **Revisão das integrações**.
10. **Cobertura de testes faltante**.
11. **Dependências/assunções a verificar em documentação oficial**.
12. **Plano de correções em ordem**.
13. **Checklist de autorização para iniciar Fase 0**.

## 10. CRITÉRIO PARA READY

Só use `READY` se:

- não houver P0;
- nenhum conflito entre fontes de verdade permaneça;
- arquitetura de auth/RLS estiver coerente;
- consentimento/gravação/IA tiver gate implementável e não apenas textual;
- contratos de IA forem compatíveis com prompts;
- nenhum runtime flow permitir auto-commit;
- Knowledge estiver protegido de citação falsa/prompt injection/cross-tenant;
- fases e testes puderem comprovar as propriedades de segurança definidas.

Se houver qualquer P0, o verdict obrigatório é `NOT_READY`.

## 11. PARE

Depois da auditoria:

**PARE. NÃO INICIE A FASE 0. NÃO ESCREVA O APP.**

Aguarde o usuário revisar o relatório e autorizar explicitamente as correções e/ou o início da implementação.
