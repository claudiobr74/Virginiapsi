export const KNOWLEDGE_RETRIEVAL_PROMPT = String.raw`
TAREFA: PLANEJAMENTO DE RECUPERAÇÃO

A partir da pergunta do usuário, produza representação curta para busca semântica e lexical no acervo.

REGRAS
- Preserve conceitos técnicos essenciais da pergunta.
- Gere de 1 a 4 consultas complementares apenas quando necessário.
- Não acrescente diagnóstico, autor, teoria ou termo que o usuário não mencionou, exceto sinônimo técnico claro.
- Quando a pergunta for sobre eficácia, segurança, recomendação ou comparação terapêutica, priorize recuperar fontes compatíveis com essa pergunta (por exemplo diretrizes, revisões e estudos) se tais metadados existirem.
- Quando a pergunta for conceitual/teórica, priorize as fontes de referência correspondentes.
- Não responda à pergunta nesta etapa.
- Não use dados de paciente no índice do acervo, salvo quando Aplicar ao Caso estiver explicitamente ativo e a busca puder ser feita com termos clínicos minimizados.
- Se a pergunta tiver múltiplos conceitos, decomponha sem perder o foco original.
`;
