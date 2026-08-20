# Spike de transcrição local em pt-BR — resultados

Fecha o item pendente de `docs/22-transcription-provider-decision.md` §7. Executado em 20/08/2026. Harness reproduzível em `spikes/transcription-ptbr/`.

**Veredito: a decisão de local-first se confirma, e com folga maior que a esperada.** O `whisper-large-v3-turbo` atinge **5,9% de WER em pt-BR** rodando localmente — melhor que os ~6% do melhor provider pago que havíamos comparado (ElevenLabs Scribe v2, US$ 0,22/h), a custo zero e sem o áudio sair do dispositivo.

## 1. Como foi medido

- **Corpus**: 23 clipes, 6,1 min, **10 falantes distintos** — Multilingual LibriSpeech português, split `test` (aberto, com referência, e usado como benchmark público pelos cards de modelo comparados em `docs/22`).
- **Métrica**: WER por distância de edição em palavras, com normalização idêntica em referência e hipótese (minúsculas, sem pontuação, espaços colapsados) — a mesma convenção dos benchmarks publicados, para os números serem comparáveis.
- **Hardware**: 4 vCPU Xeon, 15 GB RAM, **sem GPU**. Isso é o pior caso de propósito: representa o notebook sem WebGPU, que é justamente o cenário de risco.

## 2. WER e velocidade (Node, CPU nativo)

| Modelo | Quantização | WER | Velocidade | Sessão de 50 min |
|---|---|---:|---:|---:|
| whisper-base | q8 | 83–131% | 12–17× | 3–4 min |
| whisper-base | híbrida | 21,7% | 27× | 2 min |
| whisper-small | q8 | 66–106% | 6,8–7,4× | 7 min |
| whisper-small | híbrida | 15,1% | 10,9× | 5 min |
| **whisper-large-v3-turbo** | **híbrida** | **5,9%** | **4,2×** | **12 min** |

"Híbrida" = encoder fp32 + decoder q4. Velocidade em múltiplos de tempo real: 4,2× significa que processa 4 segundos de áudio por segundo de CPU, ou seja, **acompanha a sessão ao vivo mesmo sem GPU**.

As configurações híbridas foram **reproduzíveis entre execuções** (21,7%, 15,1% e 5,9% saíram idênticos em duas rodadas). As de q8 **não**: variaram de 83% para 131% e de 66% para 106% entre rodadas, com o mesmo corpus. Por isso a faixa na tabela — a instabilidade é o próprio resultado.

## 3. Navegador real (WASM, sem GPU)

| Modelo | Velocidade | Download da 1ª sessão |
|---|---:|---:|
| whisper-base híbrida | 5,79× | 201 MB |
| whisper-small híbrida | 1,44× | 563 MB |

O WASM é ~5× mais lento que o CPU nativo do Node. Extrapolando desse fator, o `turbo` em WASM ficaria **abaixo do tempo real** (~0,6×) — ou seja, **`turbo` exige WebGPU**. Não foi possível medir WebGPU aqui (ambiente sem GPU); essa medição fica para o hardware real.

## 4. Achados que mudam a implementação da Fase 6

1. **Quantização q8 está desqualificada.** Não é "um pouco pior": ela produz alucinação em loop, com WER acima de 100% — e, pior, de forma **instável entre execuções**, o que é inaceitável em contexto clínico porque o mesmo áudio pode gerar textos com qualidades muito diferentes. A quantização **híbrida é obrigatória**: no mesmo corpus, cai para 21,7% (`base`) e 15,1% (`small`), de forma reproduzível. Um adapter que use q8 por padrão entrega texto clinicamente inútil.
2. **Detecção de WebGPU precisa pedir o adapter.** `navigator.gpu` existe em máquina sem GPU e a inicialização quebra depois. O correto é `await navigator.gpu?.requestAdapter()` e cair para WASM quando vier `null`. O spike quebrou exatamente assim antes da correção.
3. **Threaded WASM exige isolamento cross-origin**: `Cross-Origin-Embedder-Policy: require-corp` e `Cross-Origin-Opener-Policy: same-origin` nas rotas que carregam o modelo.
4. **Seleção de modelo deve ser por capacidade do dispositivo**, não fixa:
   - com WebGPU: `whisper-large-v3-turbo` híbrido (qualidade de referência, ~1,6 GB no primeiro uso);
   - sem WebGPU: `whisper-small` híbrido (15,1% WER, 1,44× tempo real, 563 MB) — ainda acompanha o ao vivo;
   - `base` só como piso para hardware fraco, com o WER de ~22% comunicado à profissional.
5. **O download da primeira sessão é custo de UX real** (201 MB a 1,6 GB) e precisa de progresso visível e cache explícito, não de uma tela parada.

## 5. Prova de que o áudio não sai do dispositivo

O `browser-check.mjs` roda a transcrição em Chromium real e audita **todas** as requisições de rede da execução. Resultado nas duas configurações testadas:

- requisições totais: 25;
- hosts externos: `cdn.jsdelivr.net`, `huggingface.co`, `us.aws.cdn.hf.co` — **somente biblioteca e pesos de modelo**;
- **uploads (corpo > 2 KB): 0**.

Isto é a verificação empírica da afirmação central de `docs/22`: privacidade por arquitetura, não por política. O teste é executável e deve virar teste de regressão na Fase 6 — se alguém trocar o adapter por um que mande áudio para fora, ele falha.

## 6. O que continua pendente

⚠ **O corpus é fala lida de audiolivro**: limpa, um falante por clipe, sem ruído de sala nem sobreposição. Sessão de consultório é fala espontânea, dois falantes e ruído ambiente — o WER real será **pior** que o medido aqui. Os números servem para escolher modelo e quantização; não são promessa de qualidade clínica.

⚠ **WebGPU não foi medido** (ambiente sem GPU). A validação do `turbo` no hardware real da profissional continua necessária antes de fixá-lo como padrão.

Nenhum dos dois pendentes altera a decisão de `docs/22`: mesmo no pior caso medido — WASM, sem GPU, modelo `small` — a transcrição local acompanha a sessão ao vivo com WER de 15%, sem custo e sem enviar áudio a terceiros.
