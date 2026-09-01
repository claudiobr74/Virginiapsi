# Blueprint de Fidelidade por Tela

Este documento define a identidade visual do Tesseli por tela. Em caso de conflito, `docs/02-visual-spec.md` e este blueprint prevalecem sobre decisões genéricas do framework.

## Linguagem visual transversal

A sensação deve ser de consultório digital acolhedor e sofisticado, não de ERP. O fundo warm-bone permanece visível entre cards. Sage é a cor funcional dominante; azul, âmbar e vermelho entram apenas como semântica. Cards têm muito respiro, bordas suaves e radius grande. Títulos editoriais Playfair Display em itálico dão personalidade; Inter sustenta toda a operação.

Densidade: média-baixa. Não comprimir formulários para “caber mais”. Priorizar hierarquia, agrupamento e disclosure progressivo.

## 1. Login

Composição centralizada em fundo `#FAF9F6`. Atrás do card, usar duas ou três formas orgânicas grandes, muito desfocadas, de baixa opacidade em sage/teal; não usar gradiente neon.

Card central:
- largura máxima aproximada 448 px;
- fundo branco;
- `rounded-3xl`;
- sombra macia e ampla;
- padding generoso;
- marca Tesseli centralizada no topo;
- título de acolhimento curto;
- subtítulo discreto;
- e-mail e senha empilhados;
- “Esqueci minha senha” próximo ao campo de senha;
- botão primário largura total;
- divisor horizontal com “ou”;
- botão Google branco, borda suave;
- aviso LGPD/segurança pequeno ao fim.

Não usar painel lateral de marketing, métricas, ilustração 3D ou vídeo.

## 2. Shell desktop

Sidebar fixa/sticky de 256 px em superfície clara. Cabeçalho da sidebar com marca, nome Tesseli e identificação da profissional. Navegação em blocos com espaçamento claro. Ícones lineares Lucide, 18–20 px.

Item ativo: sage `#6B705C`, texto branco, radius 12–14 px. Item inativo: transparente, texto sage/deep neutral; hover bone/sage muito claro.

Rodapé da sidebar:
- avatar/nome/CRP;
- instalar app quando aplicável;
- Bloquear Tela (LGPD);
- sair.

Conteúdo principal usa fundo `#FAF9F6`, max-width confortável e padding 24–32 px no desktop.

## 3. Shell mobile

Top bar compacta em sage profundo. Marca pequena à esquerda; estado discreto e ações à direita. Bottom navigation fixa com 4 itens: Meu Dia, Agenda, Pacientes, Mais. A navegação não deve cobrir conteúdo: reservar safe-area inferior.

Cards passam a largura total com margins 12–16 px. Modais complexos podem ocupar tela cheia.

## 4. Meu Dia

Primeiro bloco: PageHeader Tesseli e saudação. Em seguida, um card de “Próxima sessão” visualmente prioritário, sem parecer alerta. Mostrar horário em JetBrains Mono ou Inter tabular, paciente, modalidade, confirmação, WhatsApp e Meet quando cabível.

Abaixo, organizar a rotina em seções respiradas:
- Linha do tempo de hoje;
- Sessões a finalizar;
- Pendências financeiras;
- Tarefas;
- Documentos recentes.

Cada seção deve ter estado vazio positivo. Evitar grid de KPI corporativo. Indicadores numéricos podem existir, mas subordinados ao fluxo do dia.

## 5. Pacientes — lista

PageHeader com ícone, título “Pacientes”, subtítulo e CTA “Novo paciente”. Linha de busca ampla + filtros pequenos. Lista/card deve exibir nome, `PAC-###`, contato essencial, status e modalidade. O clique principal abre Patient Hub.

No mobile, evitar tabela horizontal; usar cards/list rows empilhados.

## 6. Cadastro/edição de paciente

Formulário guiado em quatro seções visíveis no mesmo fluxo ou stepper simples:
1. Identificação;
2. Contato & Responsáveis;
3. Atendimento & Situação;
4. Financeiro & Termos.

Labels pequenas e fortes. Campos agrupados em cards claros. CTA salvar sempre previsível. Não misturar notas clínicas nesta tela administrativa.

## 7. Patient Hub

Topo com identidade do paciente, código, status e ações rápidas. Abaixo, cards/seções:
- Dados do Paciente;
- Adesão & Planos Ativos;
- Pendências;
- Acompanhamento;
- Registro Histórico de Prontuário;
- Documentos Administrativos/Clínicos conforme perfil;
- Extrato Financeiro;
- Gestão de TCLE.

Usar tabs apenas quando reduzem rolagem; não esconder informações essenciais em menus profundos. A Secretaria deve ver uma versão administrativa, não apenas a mesma tela com CSS ocultando conteúdo clínico.

## 8. Agenda

Header com alternador Dia/Semana/Mês, “Hoje” e CTA nova consulta. Calendário usa superfícies claras, linhas muito suaves e cores semânticas controladas. Eventos Tesseli e eventos Google externos devem ser visualmente distinguíveis sem excesso de legenda.

Drawer/modal de evento:
- paciente;
- início/fim;
- modalidade;
- confirmação;
- Meet;
- estado de sincronização;
- WhatsApp;
- editar/remarcar/cancelar.

Evento externo read-only deve mostrar claramente “Evento externo do Google” e não oferecer ações destrutivas por padrão.

## 9. Sessão clínica ativa

Rota dedicada, sem sidebar normal. Topo compacto com paciente, relógio/horário, modalidade, Meet, status de transcrição e finalizar.

Layout deve manter foco no registro:
- bloco “Agenda da Sessão Atual (TCC)”;
- DPEP em cards/campos amplos: Demanda, Procedimentos, Evolução, Plano/Encaminhamentos;
- área de trabalho clínico separada visualmente, mas sem cor alarmante: Notas Clínicas, Formulação, Hipóteses, Observações de Trabalho;
- transcrição em painel lateral/drawer ou área inferior, com interim discreto e finais legíveis;
- Supervisor IA acessível sem substituir a área de registro.

O botão “Finalizar atendimento” deve abrir wizard curto, nunca executar múltiplas operações silenciosamente.

## 10. Supervisor IA

Tela editorial, não chat genérico. Coluna de configuração com paciente, sessões, objetivo e abordagem. Área principal com pergunta/contexto e resultado estruturado.

Resultado em seções claras:
- Síntese;
- Hipóteses e grau de sustentação;
- Intervenções priorizadas;
- Perguntas úteis;
- Plano de próxima sessão;
- Rascunho técnico;
- Limitações/alertas.

Sempre oferecer “Ver dados enviados à IA” antes/ao redor da execução. Qualquer ação de anexar ao prontuário exige confirmação explícita.

## 11. Conhecimento

Biblioteca com coleções em cards/lista, fontes e status de processamento. Busca e pergunta teórica em destaque. Resposta RAG deve apresentar citações de fonte/chunk de modo visualmente distinto e navegável.

O módulo de Conhecimento deve seguir integralmente a identidade Tesseli, sem adotar a linguagem visual de outros produtos.

## 12. Documentos

Header com criar documento e upload. Cards/lista por tipo/status. Editor de documento com canvas branco e barra de ações mínima. Variáveis do paciente/profissional entram por inserção guiada. Versões e PDF ficam em painel secundário.

TCLE deve ter estado: rascunho, emitido, aceito, revogado, com histórico claro.

## 13. Financeiro

Tabs: Hoje, Recebimentos, Despesas, Relatórios. Paleta permanece neutra; dinheiro não transforma a tela em dashboard bancário.

Hoje: pendências e ações rápidas. Recebimentos: cobranças/pagamentos com status. Despesas: lista categorizada. Relatórios: blocos simples e gráficos apenas quando ajudam decisão.

Valores usam alinhamento/tabular. Estados atrasado/pendente usam âmbar/vermelho com parcimônia.

## 14. Configurações

Navegação interna por seções:
- Meu Perfil;
- Consultório;
- Aparência;
- Segurança;
- Equipe e Acessos;
- Integrações;
- Backup e Recuperação;
- Zona de Risco.

Integrações são cards com provider, conta conectada, estado, último sucesso/erro seguro e botões Conectar/Reconectar/Testar/Desconectar.

Zona de Risco fica visualmente separada no final, com confirmações fortes.

## 15. Marca VirgíniaPsi

Usar obrigatoriamente o lockup oficial `public/brand/virginia-psi-mark.png` (símbolo + wordmark no mesmo arquivo), exatamente como fornecido.

Não criar placeholder, SVG reinterpretado ou variação de cor do PNG. A imagem deve permanecer íntegra. Para adequação responsiva, modifique somente dimensões do container e preserve a razão de aspecto com `object-fit: contain`.

## Gate visual por rota

Antes de fechar cada rota:
- screenshot desktop 1440 px;
- screenshot mobile 390 px;
- conferir light e dark quando aplicável;
- conferir foco/teclado;
- conferir overflow e safe-area;
- comparar palette, radius, tipografia, densidade e hierarquia com este documento;
- rejeitar componentes que pareçam “template SaaS genérico”.
