export const KNOWLEDGE_SYNTHESIS_PROMPT = String.raw`
TAREFA: SÍNTESE TEMÁTICA

Integre múltiplas fontes recuperadas sobre o tema solicitado.

REGRAS
- Não faça apenas resumos independentes fonte por fonte.
- Identifique conceitos centrais, convergências, diferenças, tensões, lacunas e limites de generalização.
- Preserve diferenças de definição/terminologia entre autores e abordagens.
- Diferencie afirmações teóricas, achados empíricos e recomendações.
- Quando uma afirmação depender de fonte específica, cite-a.
- Quando a síntese integrar várias fontes, cite o conjunto relevante.
- Não atribua consenso quando as fontes não o demonstram.
- Não atribua superioridade clínica por popularidade, quantidade de textos ou autoridade do autor.
- Não extrapole além do material recuperado.
- Se fontes forem antigas e a data puder importar, sinalize a limitação sem inventar literatura mais recente.

SAÍDA
Síntese estruturada, convergências, divergências, natureza das evidências, implicações teóricas/práticas quando sustentadas, limitações e fontes utilizadas.
`;
