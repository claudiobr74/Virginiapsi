// Sonda rápida: qual configuração de quantização produz saída sã em pt-BR.
// A pesquisa de docs/22 alertava que q8 no encoder degrada a qualidade e que
// o recomendado é híbrido (encoder fp32 + decoder quantizado). Aqui isso é
// medido em vez de presumido.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const CORPUS_DIR = path.join(import.meta.dirname, "corpus");
const manifest = JSON.parse(readFileSync(path.join(CORPUS_DIR, "manifest.json"), "utf8"));

function readWav16kMono(filePath) {
  const buffer = readFileSync(filePath);
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
  const samples = new Float32Array(dataSize / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = buffer.readInt16LE(dataStart + i * 2) / 32768;
  }
  return samples;
}

const clip = manifest.clips[0];
const audio = readWav16kMono(path.join(CORPUS_DIR, clip.wav));
console.log(`clipe: ${clip.duration}s | amostras: ${audio.length} (${(audio.length / 16000).toFixed(1)}s)`);
console.log(`REF: ${clip.reference.slice(0, 110)}\n`);

const CONFIGS = [
  { label: "q8 (tudo)", dtype: "q8" },
  { label: "fp32 (tudo)", dtype: "fp32" },
  { label: "híbrido enc fp32 / dec q4", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } },
];

for (const config of CONFIGS) {
  try {
    const start = performance.now();
    const transcriber = await pipeline("automatic-speech-recognition", "onnx-community/whisper-base", {
      dtype: config.dtype,
    });
    const output = await transcriber(audio, { language: "pt", task: "transcribe", chunk_length_s: 30 });
    const seconds = (performance.now() - start) / 1000;
    console.log(`--- ${config.label} (${seconds.toFixed(1)}s)`);
    console.log(`HYP: ${(output.text ?? "").trim().slice(0, 110)}\n`);
  } catch (error) {
    console.log(`--- ${config.label}: FALHOU ${error.message}\n`);
  }
}
