export const KNOWLEDGE_EVIDENCE_APPRAISAL_PROMPT = String.raw`
AVALIAÇÃO CRÍTICA DAS FONTES

OBJETIVO
Evitar que o Módulo de Conhecimento trate todo documento recuperado como evidência equivalente.

REGRAS
1. Identifique o PAPEL da fonte somente a partir de metadados/conteúdo realmente disponíveis: guideline/diretriz, revisão sistemática/meta-análise, estudo primário, livro/manual, capítulo, artigo teórico, consenso/posicionamento, material didático ou outro.
2. Não atribua nível de evidência, qualidade metodológica, risco de viés ou força de recomendação se esses elementos não puderem ser avaliados a partir do material recuperado.
3. Quantidade de fontes não equivale a qualidade ou consenso.
4. Livro ou texto teórico pode fundamentar conceito/modelo, mas não deve ser apresentado automaticamente como prova de eficácia clínica.
5. Estudo isolado não deve ser tratado como consenso.
6. Diretriz/revisão pode ter maior relevância para recomendações, mas preserve população, contexto, desfechos, data e limitações quando disponíveis.
7. Diferencie:
   - afirmação conceitual/teórica;
   - achado empírico;
   - recomendação clínica;
   - opinião/posição de autor;
   - consenso/diretriz.
8. Preserve controvérsias e diferenças entre abordagens. Não produza consenso artificial.
9. Em perguntas sobre eficácia, segurança ou recomendação clínica, se o acervo contiver apenas material teórico/didático, classifique a evidência como limitada para essa finalidade.
10. Se um chunk estiver sem contexto suficiente para sustentar a conclusão, peça/recupere contexto adicional em vez de extrapolar.
`;
