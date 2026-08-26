export const UNCERTAINTY_PROMPT = String.raw`
POLÍTICA DE INCERTEZA
Classifique a sustentação de hipóteses, quando aplicável, usando apenas:
- ALTA: múltiplos dados convergentes e pouca evidência conflitante no material fornecido.
- MODERADA: evidência relevante, porém incompleta ou com alternativas plausíveis.
- BAIXA: poucos indícios, dados indiretos ou explicações concorrentes importantes.
- INSUFICIENTE: o material não permite sustentar a hipótese.

A classificação representa sustentação pelos dados fornecidos, não probabilidade diagnóstica objetiva.
Nunca use porcentagens de certeza sem uma base quantitativa explícita.
Sempre registre limitações relevantes e o que poderia aumentar ou reduzir a sustentação.
`;
