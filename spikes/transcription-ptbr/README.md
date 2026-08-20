# Spike — transcrição local em pt-BR

Fecha o item pendente de `docs/22-transcription-provider-decision.md` §7: medir WER e velocidade da transcrição local antes de fechar a Fase 6.

Resultados e conclusões: **`docs/23-transcription-spike-results.md`**.

Isolado de propósito: tem `package.json` próprio, não entra no bundle do app nem nas dependências do produto, e é ignorado pelo ESLint. Nada aqui é código de produção.

## Como reproduzir

```bash
cd spikes/transcription-ptbr
pnpm install

# 1. baixa corpus pt-BR com transcrição de referência (MLS português, split test)
node fetch-corpus.mjs

# 2. mede WER e velocidade em CPU (Node + onnxruntime)
MODELS="onnx-community/whisper-small@hybrid,onnx-community/whisper-large-v3-turbo@hybrid" node bench.mjs

# 3. roda em navegador real e AUDITA a rede (falha se áudio sair do dispositivo)
MODEL=onnx-community/whisper-small node browser-check.mjs
```

`@dtype` aceita `q8`, `fp32` ou `hybrid` (encoder fp32 + decoder q4).

## O que cada script responde

| Script | Pergunta |
|---|---|
| `fetch-corpus.mjs` | Que áudio pt-BR com referência confiável usar para medir? |
| `bench.mjs` | Qual modelo/quantização atinge WER aceitável, e a que velocidade? |
| `probe-dtype.mjs` | A quantização degrada a qualidade a ponto de inviabilizar? |
| `browser-check.mjs` | Funciona em navegador real e o áudio realmente não sai da máquina? |

## Limitação conhecida

O corpus é fala **lida** de audiolivro (MLS): limpa, um falante, sem ruído de sala. Sessão de consultório é fala espontânea, dois falantes e ruído. O WER medido aqui é um **piso otimista** — serve para escolher modelo e quantização, não para prometer qualidade clínica. A validação com áudio representativo no hardware da profissional continua pendente.
