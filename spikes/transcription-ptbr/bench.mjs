// Mede WER e velocidade dos modelos Whisper ONNX em pt-BR, no mesmo runtime
// que o navegador usaria (onnxruntime via @huggingface/transformers).
//
// Este processo roda em CPU, sem GPU. Isso é proposital: é o PIOR caso — o
// caminho WASM/CPU de um notebook sem WebGPU. Se o número fecha aqui, fecha
// com folga no caminho acelerado.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const CORPUS_DIR = path.join(import.meta.dirname, "corpus");
const manifest = JSON.parse(readFileSync(path.join(CORPUS_DIR, "manifest.json"), "utf8"));

// Sintaxe: "repo@dtype" — dtype "hybrid" usa encoder fp32 + decoder q4, que é
// a recomendação corrente para Whisper no navegador.
const MODELS = (process.env.MODELS ?? "onnx-community/whisper-base@q8")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [repo, dtypeLabel = "q8"] = entry.split("@");
    const dtype =
      dtypeLabel === "hybrid"
        ? { encoder_model: "fp32", decoder_model_merged: "q4" }
        : dtypeLabel;
    return { repo, dtypeLabel, dtype };
  });

/**
 * Normalização idêntica para referência e hipótese — minúsculas, sem
 * pontuação, espaços colapsados. É a mesma convenção usada pelos cards de
 * modelo que comparamos em docs/22, então os números são comparáveis.
 */
function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[.,!?;:"'`´“”‘’()\[\]{}…—–\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de edição em palavras (Levenshtein), base do WER. */
function wordEditDistance(reference, hypothesis) {
  const a = reference;
  const b = hypothesis;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1, // deleção
        current[j - 1] + 1, // inserção
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // substituição
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function readWav16kMono(filePath) {
  const buffer = readFileSync(filePath);
  // Percorre os chunks RIFF até achar `data`. Assumir 44 bytes fixos quebra:
  // o ffmpeg escreve um chunk LIST antes do áudio, e os primeiros bytes de
  // metadado entrariam na forma de onda.
  let offset = 12;
  let dataStart = -1;
  let dataSize = 0;
  while (offset < buffer.length - 8) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") {
      dataStart = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataStart < 0) {
    throw new Error(`chunk 'data' não encontrado em ${filePath}`);
  }

  const samples = new Float32Array(dataSize / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = buffer.readInt16LE(dataStart + i * 2) / 32768;
  }
  return samples;
}

const results = [];

for (const { repo, dtypeLabel, dtype } of MODELS) {
  const model = `${repo}@${dtypeLabel}`;
  process.stdout.write(`\n=== ${model}\ncarregando modelo... `);
  const loadStart = performance.now();
  let transcriber;
  try {
    transcriber = await pipeline("automatic-speech-recognition", repo, { dtype });
  } catch (error) {
    console.log(`FALHOU: ${error.message}`);
    results.push({ model, error: String(error.message ?? error) });
    continue;
  }
  const loadSeconds = (performance.now() - loadStart) / 1000;
  console.log(`${loadSeconds.toFixed(1)}s`);

  let totalErrors = 0;
  let totalWords = 0;
  let totalAudioSeconds = 0;
  let totalProcessSeconds = 0;
  const samples = [];

  for (const [index, clip] of manifest.clips.entries()) {
    const audio = readWav16kMono(path.join(CORPUS_DIR, clip.wav));
    const start = performance.now();
    const output = await transcriber(audio, { language: "pt", task: "transcribe", chunk_length_s: 30 });
    const processSeconds = (performance.now() - start) / 1000;

    const reference = normalize(clip.reference).split(" ");
    const hypothesis = normalize(output.text ?? "").split(" ").filter(Boolean);
    const errors = wordEditDistance(reference, hypothesis);

    totalErrors += errors;
    totalWords += reference.length;
    totalAudioSeconds += clip.duration;
    totalProcessSeconds += processSeconds;

    if (samples.length < 2) {
      samples.push({ reference: clip.reference.slice(0, 120), hypothesis: (output.text ?? "").trim().slice(0, 120) });
    }

    process.stdout.write(
      `\r  ${index + 1}/${manifest.clips.length} clipes | WER parcial ${((totalErrors / totalWords) * 100).toFixed(1)}%   `,
    );
  }

  const wer = totalErrors / totalWords;
  const rtf = totalAudioSeconds / totalProcessSeconds;
  console.log(
    `\n  WER ${(wer * 100).toFixed(1)}% | ${rtf.toFixed(2)}x tempo real | ${totalProcessSeconds.toFixed(0)}s para ${(
      totalAudioSeconds / 60
    ).toFixed(1)} min de áudio`,
  );

  results.push({
    model,
    wer,
    realtimeFactor: rtf,
    loadSeconds,
    audioSeconds: totalAudioSeconds,
    processSeconds: totalProcessSeconds,
    samples,
  });
}

writeFileSync(
  path.join(import.meta.dirname, "results.json"),
  JSON.stringify({ corpus: manifest.source, clips: manifest.clips.length, hardware: "4 vCPU, sem GPU", results }, null, 2),
);

console.log("\n--- resumo ---");
for (const entry of results) {
  if (entry.error) {
    console.log(`${entry.model}: ERRO ${entry.error}`);
    continue;
  }
  const minutesPerSession = 50 / entry.realtimeFactor;
  console.log(
    `${entry.model.padEnd(34)} WER ${(entry.wer * 100).toFixed(1).padStart(5)}%  ${entry.realtimeFactor
      .toFixed(2)
      .padStart(5)}x  sessão de 50min => ${minutesPerSession.toFixed(0)} min de processamento`,
  );
}
