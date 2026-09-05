/**
 * TCLE text — docs/19-lgpd-privacy.md §7 sets the minimum required content
 * (suboperators, how audio is transcribed, AI review boundary, retention,
 * how to exercise rights). This is a structurally-compliant DRAFT, not a
 * finished legal instrument.
 *
 * ⚠ VALIDAÇÃO JURÍDICA HUMANA OBRIGATÓRIA antes do primeiro uso com
 * paciente real (docs/19 §7, última linha). Bumping `TCLE_VERSION` is what
 * makes an older acceptance show as outdated in the UI — do it whenever
 * this text changes materially (docs/19 §2: "adição de novo suboperador...
 * exige... nova versão de consentimento").
 */
export const TCLE_VERSION = "tcle-2026-09-v3";

export const TCLE_LEGAL_REVIEW_DISCLAIMER =
  "Rascunho estrutural pendente de validação jurídica humana (docs/19-lgpd-privacy.md §7). Não usar com paciente real antes dessa revisão.";

export const TCLE_BODY_TEMPLATE = `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO

Consultório: {{organization.name}}
Profissional responsável: {{professional.name}}
Paciente: {{patient.full_name}} ({{patient.public_code}})
Data: {{date.today}}

1. NATUREZA DO ATENDIMENTO
Este documento formaliza o consentimento para o acompanhamento psicoterapêutico e para o uso das ferramentas administrativas e de apoio clínico do VirgíniaPsi descritas abaixo.

2. TERCEIROS QUE PROCESSAM DADOS EM NOME DO CONSULTÓRIO (SUBOPERADORES)
- Supabase: armazenamento de todo o dado estruturado do prontuário, autenticação e arquivos.
- Google (Calendar/Meet): nome e código do paciente, horário e modalidade da consulta, para agenda e videochamada, quando a consulta for online.
- Twilio: número de telefone e conteúdo de mensagens de confirmação/lembrete via WhatsApp, quando esse canal for utilizado.
- Groq: processa trechos de áudio da sessão para gerar a transcrição em tempo real. O áudio não é guardado no prontuário; o texto transcrito sim. Política de retenção zero (ZDR) do suboperador: não verificada nesta versão.
- Google (Gemini): recebe contexto clínico minimizado para apoio de IA (Supervisor Clínico, apoio durante a sessão, acervo de conhecimento e redação assistida de documentos profissionais) — nunca o áudio bruto da sessão, nunca o prontuário completo indiscriminado.

3. TRANSCRIÇÃO DA SESSÃO
Durante a sessão, pequenos trechos de áudio podem ser enviados com segurança ao serviço de transcrição para gerar o texto. Se a conexão for interrompida, trechos ainda não processados podem ficar preservados de forma criptografada neste dispositivo até a transcrição poder continuar. Também é possível importar uma gravação feita em outro gravador; nesse caso o arquivo fica em armazenamento temporário privado só até a transcrição ser gravada no prontuário. Recusar ou revogar a transcrição não impede o atendimento.

4. APOIO DE INTELIGÊNCIA ARTIFICIAL
As ferramentas de apoio de IA (Supervisor Clínico, apoio durante a sessão, acervo de conhecimento e redação assistida de documentos) processam um recorte minimizado do contexto clínico, nunca decidem de forma autônoma sobre diagnóstico, avaliação psicológica, conduta ou emissão de documento, e todo resultado passa por revisão humana da profissional antes de ser incorporado ao prontuário ou emitido.

5. PRAZOS DE GUARDA
- Áudio bruto da transcrição ao vivo: não é armazenado no prontuário.
- Áudio importado temporário: eliminado após a transcrição ser persistida, com rotina de retenção residual.
- Trechos criptografados no dispositivo: apenas até a transcrição ser concluída.
- Transcrição e prontuário: seguem o prazo mínimo de guarda profissional aplicável.
- Trilha de auditoria técnica: sem prazo de eliminação automática.

6. DIREITOS DA PESSOA ATENDIDA
A pessoa atendida pode, a qualquer momento, solicitar acesso, correção, portabilidade ou eliminação de seus dados, e pode recusar ou revogar este consentimento sem prejuízo do atendimento, observadas as guardas mínimas de prontuário exigidas por norma profissional.

Ao aceitar este termo, a pessoa atendida (ou seu responsável legal, quando aplicável) declara ter lido e compreendido as informações acima.`;
