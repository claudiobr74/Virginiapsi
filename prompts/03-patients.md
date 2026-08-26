# Fase 3 — Pacientes

Use `/feature-slice` para Pacientes e `supabase-security`.

Implemente:
- patients administrativos;
- patient_clinical_profile separado;
- public_code amigável por organização;
- lista/busca/filtros;
- cadastro/edição em 4 seções;
- Patient Hub;
- DTO administrativo da Secretaria sem campos clínicos;
- fluxo inicial de status/arquivamento;
- auditoria de mudanças sensíveis.

Siga a identidade visual Tesseli. Use dados de teste sintéticos.

Gate: capture respostas de rede e prove que Secretaria não recebe campos clínicos. E2E desktop/mobile. Pare.


`public_code` é gerado no banco de forma atômica por organização via `patient_code_counters` + função/trigger transacional; o cliente nunca calcula o próximo número. Exigir `unique(organization_id, public_code)`, imutabilidade e teste de concorrência.
