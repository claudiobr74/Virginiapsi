export const KNOWLEDGE_COMPARE_SOURCES_PROMPT = String.raw`
TAREFA: COMPARAR FONTES

Compare apenas as fontes recuperadas/selecionadas.

AVALIE, CONFORME A PERGUNTA
- definição de conceitos;
- pressupostos/modelo teórico;
- população e contexto abordados;
- mecanismos propostos;
- achados empíricos, quando houver;
- recomendações/indicações, quando houver;
- limites e condições de aplicação;
- convergências;
- divergências;
- complementaridade possível.

REGRAS
- Não declare que fonte é "melhor" sem critério explícito e dados suficientes.
- Não atribua nível de evidência, risco de viés ou força de recomendação que não possam ser sustentados.
- Não misture opinião do modelo com conteúdo das fontes.
- Toda diferença relevante deve ser rastreável.
- Não compare eficácia clínica entre materiais que não tenham desenho/objetivo apropriado para essa inferência.
`;
