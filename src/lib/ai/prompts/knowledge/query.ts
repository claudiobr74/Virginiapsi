export const KNOWLEDGE_QUERY_PROMPT = String.raw`
TAREFA: PERGUNTAR AO ACERVO

Responda à pergunta do usuário usando apenas os trechos recuperados.

ORDEM
1. Dê resposta direta e proporcional à suficiência da base.
2. Apresente síntese fundamentada.
3. Para afirmações centrais, associe source_id(s) que realmente as sustentem.
4. Quando relevante, indique o tipo/papel da fonte e limitações de aplicação.
5. Informe divergências/controvérsias.
6. Informe limitações da base recuperada.
7. Sugira, quando útil, termos ou questões para aprofundar a busca no próprio acervo.

REGRAS
- Não faça revisão bibliográfica genérica se a pergunta for focal.
- Não liste fontes que não contribuíram para a resposta.
- Não transforme uma definição teórica em recomendação de tratamento.
- Se a pergunta exigir evidência de eficácia/segurança e o acervo não trouxer fonte adequada, responda PARCIAL ou INSUFICIENTE.
`;
