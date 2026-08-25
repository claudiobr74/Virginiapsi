# Fonte de Verdade e Escopo do Tesseli

## Hierarquia de autoridade

1. Este diretório `docs/` para produto/arquitetura e `src/lib/ai/prompts/**` para comportamento de IA em runtime. Go-live multiclínicas (decisões D1–D5 e inventário G0): `docs/26-go-live.md` — **não** substitui este kit; a G2 deve emendar papéis quando D4b/D5b forem implementados (`psychologist` + operadora de plataforma). Até lá o texto abaixo (“duas funções”) descreve o código vigente, não o alvo travado.
2. `src/lib/ai/contracts/**` para structured outputs da IA.
3. `.cursor/rules/`.
4. prompt da fase atual.
5. código já aceito pelos gates de qualidade.

## Conceitos obrigatórios do produto

O Tesseli deve implementar:

- navegação principal por oito módulos;
- identidade visual sage/bone, tipografia elegante e interface acolhedora;
- duas funções de acesso: Psicóloga Administradora e Secretaria;
- dashboard **Meu Dia** orientado à rotina;
- prontuário por paciente e sessão clínica em modo foco;
- DPEP: Demanda, Procedimentos, Evolução, Plano/Encaminhamentos;
- área de trabalho clínico separada;
- transcrição ao vivo;
- Supervisor Clínico IA;
- base de conhecimento clínico;
- Google Calendar como agenda externa oficial nesta etapa;
- Google Meet associado a consultas online;
- WhatsApp/Twilio para lembretes e comunicação;
- financeiro com cobranças, pagamentos, despesas, planos/pacotes, recibos e relatórios;
- documentos/TCLE/PDF/assinaturas;
- segurança por bloqueio de inatividade, auditoria e LGPD conforme `docs/19-lgpd-privacy.md`.

## Decisões arquiteturais obrigatórias

- Uma única aplicação Next.js com Supabase como backend de dados, autenticação e storage.
- Sem Firebase ou Firestore.
- Sem Google Drive, Docs ou Sheets como backend operacional.
- Sem NotebookLM como dependência do produto.
- Sem backend Express ou NestJS paralelo.
- Sem ORM que duplique a definição do schema do Supabase.
- Sem fallbacks de estado em memória para dados persistentes.
- Autenticação validada por primitives oficiais do Supabase.
- Google Meet criado exclusivamente por `conferenceData` da Calendar API.
- Áudio de fallback enviado diretamente para storage privado, sem payload grande/base64 pelo backend.
- Autorização multi-organização baseada em membership validado e RLS, nunca em posição de array.

## Regra de fidelidade

“Fiel ao Tesseli” significa cumprir a experiência, intenção, hierarquia visual, fluxos clínicos/administrativos e contratos definidos neste kit.


## IA em runtime

Os textos em `src/lib/ai/prompts/**` são fonte de verdade do comportamento clínico da IA. Structured outputs ficam em `src/lib/ai/contracts/**`. Alterações técnicas não autorizam reescrita desses prompts. Consulte `RUNTIME_AI_PROMPTS.md` e `docs/14-runtime-ai-architecture.md`.


## Gate pré-implementação

Antes da Fase 0, executar `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md`. Nenhum código deve ser implementado durante essa auditoria. Após as correções técnicas v1.3 (`docs/18-preimplementation-fixes-v1.3.md`) e v1.4 (`docs/20-preimplementation-fixes-v1.4.md`), o gate exige reauditoria com verdict `READY`; `READY_WITH_FIXES` não autoriza Fase 0.
