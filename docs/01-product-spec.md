# Especificação Funcional Tesseli

## 1. Perfis

### Psicóloga Administradora (`psychologist_admin`)

Opera a clínica: equipe, settings, cadastro administrativo de todos os pacientes, agenda e financeiro. **Não** vê prontuário, sessão, DPEP, transcrição, IA clínica nem documentos clínicos de pacientes em que não é `responsible_psychologist_user_id`. Se ela mesma for a responsável, vê o clínico desses pacientes.

Não cria outra clínica (D5b). Convites de equipe são desta função.

### Psicóloga clínica (`psychologist`)

Vê e trata somente os pacientes em que é responsável. Sem settings/equipe e sem criar clínica.

### Secretaria

Pode operar rotinas administrativas autorizadas: lista administrativa de pacientes, agenda, confirmações/lembretes e financeiro conforme `secretary_finance_access` (`none|view|manage`). Não recebe dados clínicos, transcrições, notas clínicas internas, formulação, Supervisor IA, Knowledge clínico privado ou documentos clínicos cujo conteúdo exceda sua permissão.

### Operadora da plataforma

Allowlist `platform_operators`. Única autoridade para `bootstrap_organization`. Não lê prontuário de tenant no dia a dia.

## 2. Login e sessão

- E-mail/senha via Supabase Auth.
- Recuperação de senha.
- Login Google opcional via Supabase Auth.
- Mensagem de segurança/LGPD em acesso inválido.
- Bloqueio por inatividade configurável.
- Botão “Bloquear Tela (LGPD)” imediato.
- Logout com confirmação.
- Google Calendar OAuth é configuração separada do login.

## 3. Shell/navegação

### Desktop

Sidebar esquerda fixa ~256 px. Logo/nome no topo, grupos de navegação, usuário/CRP e ações no rodapé.

### Mobile

Top bar sage com Tesseli + estado; bottom nav com “Meu Dia”, “Agenda”, “Pacientes”, “Mais”.

### Módulos

1. Meu Dia
2. Pacientes
3. Agenda
4. Financeiro
5. Documentos
6. Supervisor IA
7. Conhecimento
8. Configurações

## 4. Meu Dia

Tela mais operacional do produto.

Conteúdos:

- saudação personalizável, nome da profissional e frase curta;
- próxima sessão em destaque;
- linha do tempo de hoje;
- status de confirmação;
- modalidade presencial/online;
- botão de WhatsApp/lembrete;
- link Meet quando aplicável;
- sessões a finalizar;
- pendências financeiras;
- tarefas pendentes;
- documentos recentes/gerados;
- estado vazio positivo quando o dia está resolvido.

## 5. Pacientes

### Lista

- busca rápida;
- filtros por status/modalidade;
- cadastro novo;
- código público amigável `PAC-###`, gerado atomicamente pelo banco por organização, imutável e único no tenant;
- nome preferencial e nome completo;
- telefone/e-mail;
- situação e modalidade;
- acesso ao Patient Hub.

### Cadastro/edição

Seções guiadas:

1. Identificação
2. Contato e responsáveis
3. Atendimento e situação
4. Financeiro e termos

### Patient Hub

- Dados do paciente
- Adesão e planos ativos
- Pendências
- Acompanhamento
- Registro histórico de prontuário
- Documentos
- Extrato financeiro
- Gestão de TCLE

### Exclusão LGPD

Fluxo explícito com relatório do que será apagado, o que precisa ser mantido por obrigação aplicável e confirmação forte. Não fazer hard delete indiscriminado sem política documentada.

## 6. Agenda

### Visualizações

- dia;
- semana;
- mês.

### Evento Tesseli

- paciente;
- início/fim;
- modalidade;
- status;
- calendar_id;
- external_event_id;
- origem;
- política de sync;
- Meet URL quando online;
- confirmação WhatsApp.

### UX

- “Hoje”;
- nova consulta;
- editar/remarcar/cancelar;
- detecção de conflito;
- cores do Google quando possível;
- eventos externos visíveis sem serem automaticamente assumidos pelo Tesseli;
- nomes de pacientes em eventos gerenciados: `Nome Sobrenome • PAC-###`.

### Regras de sincronização

- `TESSELI`: gerenciado pelo app, bidirecional.
- `GOOGLE_EXTERNAL`: importado/externo, read-only por padrão.
- nunca apagar/alterar evento externo sem ação explícita de assumir gestão.

## 7. Sessão clínica ativa

Modo sem distrações, separado do shell normal.

### Cabeçalho

- paciente;
- horário;
- modalidade;
- Meet;
- status de gravação/transcrição;
- finalizar atendimento.

### Agenda da sessão

Estrutura de apoio TCC configurável.

### DPEP

Campos principais:

- Demanda
- Procedimentos
- Evolução
- Plano / Encaminhamentos

### Área de trabalho clínico separada

- notas clínicas internas;
- formulação clínica;
- hipóteses;
- observações de trabalho.

A Secretaria jamais recebe esse conteúdo. O produto não deve presumir que uma área separada seja juridicamente inacessível à pessoa atendida; armazenamento, acesso e eventual compartilhamento seguem finalidade e normas profissionais aplicáveis. A área separada nunca pode ser usada para ocultar informação necessária ou contornar direitos.

### Transcrição

- iniciar/parar;
- estado: idle, connecting, recording, reconnecting, stopping, completed, error;
- gate obrigatório de consentimento válido antes de iniciar gravação/transcrição;
- a pessoa atendida pode recusar gravação/transcrição/uso de IA sem prejuízo do atendimento;
- para criança/adolescente, respeitar os estados de autorização/anuência definidos pelo produto;
- transcrição interim visual e explicitamente provisória;
- persistir texto final de forma incremental;
- histórico de transcrições da sessão conforme política de retenção;
- tratar erro de ASR como risco clínico: negações, nomes, regionalismos e termos técnicos podem estar incorretos;
- nunca depender de um payload único de áudio pelo backend.

### IA clínica na sessão

Consulta opcional e silenciosa para a psicóloga. Só opera quando os consentimentos aplicáveis estiverem válidos. A IA não conversa com o paciente, não conduz a sessão, não faz avaliação psicológica autônoma e não interpreta testes restritos. Resultado só é anexado ao prontuário por ação humana explícita.

### Encerramento

Wizard curto:

- apenas finalizar;
- agendar próximo encontro;
- gerar/lançar cobrança conforme regra financeira;
- gerar recibo quando solicitado;
- confirmar ações antes do commit final.

## 8. Supervisor Clínico IA

- selecionar paciente;
- selecionar sessões relevantes;
- objetivo: preparar próxima sessão, dúvida clínica, atualizar formulação etc.;
- abordagem: priorizar TCC, priorizar Terapia do Esquema ou integrar lentes adicionais explicitamente selecionadas;
- TCC/Terapia do Esquema são referenciais principais, mas nunca devem ser forçados quando os dados não sustentarem;
- pergunta clínica obrigatória em modos que exigem;
- prévia dos dados que serão enviados à IA;
- contexto opcional: etapa do desenvolvimento, modalidade individual/casal/família/grupo, objetivos, preferências e fatores contextuais relevantes;
- saída estruturada: resposta direta, síntese, dados relevantes, hipóteses concorrentes, formulações, recursos/contexto, processo terapêutico, intervenções priorizadas com pré-requisitos/cautelas, perguntas, plano flexível, competência/supervisão humana, risco/ética e limitações;
- raciocínio diagnóstico somente quando solicitado, sempre hipotético;
- nenhuma interpretação autônoma de testes psicológicos restritos;
- nenhuma prescrição/ajuste de medicação;
- histórico de supervisões;
- revisão humana obrigatória e nenhum auto-commit.

## 9. Conhecimento

Biblioteca teórica privada e rastreável do Tesseli:

- coleções temáticas;
- fontes: livro, capítulo, artigo, estudo, revisão, guideline/diretriz, manual, protocolo, guia, consenso/posicionamento e nota;
- upload para Supabase Storage;
- extração/normalização de texto;
- chunks e embeddings;
- pergunta clínica teórica;
- resposta RAG com fontes citadas e validação de source IDs;
- diferenciação entre conceito teórico, achado empírico, recomendação e posição de autor;
- source appraisal sem inventar score de qualidade;
- perguntas de eficácia/segurança exigem fonte compatível ou retornam PARCIAL/INSUFICIENTE;
- isolamento por organização;
- Knowledge padrão é library-only e não recebe contexto de paciente;
- `Aplicar ao caso` é fluxo explícito, com minimização e separação entre FATO_FONTE, DADO_CASO, INFERÊNCIA e SUGESTÃO;
- dados do paciente nunca são ingeridos como fonte/chunk da biblioteca.

## 10. Documentos

- modelos do consultório;
- documento em branco;
- laudo/relatório/atestado/declaração/encaminhamento/recibo/TCLE/contrato;
- editor simples;
- variáveis do paciente/profissional;
- versionamento;
- PDF final;
- anexos externos;
- assinatura profissional;
- TCLE com assinatura/aceite e histórico;
- arquivos privados no Supabase Storage;
- links temporários assinados para download.

## 11. Financeiro

Subabas:

- Hoje
- Recebimentos
- Despesas
- Relatórios

### Cobranças e pagamentos

- sessão avulsa;
- pacote pré-pago/pós-pago;
- mensalidade;
- lançamento administrativo;
- baixa rápida;
- parcial;
- atraso;
- cancelamento/estorno lógico;
- recibo individual ou lote mensal;
- solicitação administrativa de NFS-e (sem prometer emissão fiscal se não houver integração fiscal real).

### Planos/pacotes

- sessões totais/usadas/restantes;
- preço;
- validade;
- renovação;
- status;
- ajustes auditados.

### Despesas

- categoria;
- valor;
- vencimento;
- pagamento;
- recorrência;
- fornecedor;
- observações;
- anexo.

### Relatórios

- caixa/competência;
- recebido/faturado;
- despesas;
- resultado;
- exportações contábeis em CSV quando aplicável;
- fechamento mensal auditado.

## 12. Twilio/WhatsApp

- mensagens manuais guiadas;
- lembretes 24h e 2h configuráveis;
- confirmação de consulta;
- mensagem de boas-vindas;
- cobrança;
- status de entrega;
- inbound;
- preferência/consentimento;
- templates oficiais aprovados quando necessários.

## 13. Configurações

Seções:

- Meu Perfil
- Consultório
- Aparência
- Segurança
- Equipe e Acessos
- Integrações
- Backup e Recuperação
- Zona de Risco

Integrações exibem status real, último sucesso/erro e botão de diagnóstico seguro.
