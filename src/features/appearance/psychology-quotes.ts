/**
 * Canonical daily-quote bank. Product-owned copy: no third-party attribution.
 * Keep this list at exactly 30 items; the daily index is `ordinal % 30`.
 */
export const PSYCHOLOGY_QUOTES = [
  "Escutar com presença é abrir espaço para que o outro também se escute.",
  "Nomear uma emoção pode mudar a maneira como nos relacionamos com ela.",
  "Mudanças consistentes costumam nascer de pequenos movimentos repetidos.",
  "Aquilo que evitamos compreender tende a continuar pedindo nossa atenção.",
  "Autoconhecimento não elimina o desconforto; amplia nossas possibilidades diante dele.",
  "Limites claros podem proteger vínculos importantes.",
  "Pensamentos merecem ser examinados, não necessariamente obedecidos.",
  "Emoções trazem informações, mas não precisam decidir sozinhas nossos próximos passos.",
  "Perceber um padrão é o primeiro movimento para poder escolher diferente.",
  "Cuidar de si também inclui reconhecer quando é preciso pedir apoio.",
  "A forma como contamos nossa história influencia a forma como a vivemos.",
  "Curiosidade sobre si costuma abrir caminhos onde o julgamento fecha portas.",
  "Segurança emocional cresce quando podemos existir sem precisar esconder o que sentimos.",
  "Pedir ajuda também pode ser uma expressão de coragem.",
  "Mudança começa quando aquilo que era automático passa a ser percebido.",
  "Criar alguns segundos entre impulso e ação pode abrir espaço para novas escolhas.",
  "O corpo muitas vezes sinaliza aquilo que ainda não conseguimos colocar em palavras.",
  "Aceitar uma emoção não significa concordar com tudo o que ela nos pede.",
  "Relações saudáveis comportam proximidade, diferença e limites.",
  "A autocompaixão pode ser mais transformadora do que a autocrítica constante.",
  "Pequenos registros do cotidiano ajudam a tornar visíveis padrões que antes passavam despercebidos.",
  "Um pensamento pode parecer verdadeiro sem ser a única interpretação possível.",
  "A terapia não entrega respostas prontas; ajuda a construir perguntas mais úteis.",
  "Quando os valores ficam mais claros, as escolhas podem ganhar direção.",
  "O passado influencia o presente sem precisar determinar o futuro.",
  "Aprender a dizer não também é aprender a escolher onde dizer sim.",
  "Flexibilidade psicológica é conseguir ajustar caminhos sem abandonar o que importa.",
  "Sentir tristeza, medo ou raiva não reduz a complexidade de quem somos.",
  "Reconhecer progresso é importante mesmo quando ainda existe caminho pela frente.",
  "Uma escuta cuidadosa pode transformar silêncio em possibilidade de compreensão.",
] as const;

export const PSYCHOLOGY_QUOTE_COUNT = PSYCHOLOGY_QUOTES.length;

export type PsychologyQuote = (typeof PSYCHOLOGY_QUOTES)[number];
export type QuoteMode = "daily" | "custom";

export const QUOTE_MODES = ["daily", "custom"] as const;
