// Baixa um corpus pt-BR com transcrição de referência para medir WER.
//
// Fonte: Multilingual LibriSpeech (facebook/multilingual_librispeech, config
// "portuguese", split "test") — aberto, com referência já normalizada, e usado
// como benchmark público pelos cards de modelo que comparamos em docs/22.
// Isso permite conferir a nossa medição contra números publicados.
//
// Limitação importante e deliberada: MLS é fala LIDA de audiolivro, limpa e de
// um único falante. Sessão de consultório é fala espontânea, dois falantes e
// ruído de sala. O WER daqui é, portanto, um PISO otimista — serve para
// escolher modelo, não para prometer qualidade clínica.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(import.meta.dirname, "corpus");
const TARGET_SECONDS = Number(process.env.TARGET_SECONDS ?? 360);
const PAGE = 2;
const TOTAL_ROWS = 871;
// O split vem ordenado por falante/capítulo: ler sequencialmente do início dá
// um corpus de uma voz só. O passo é calculado para varrer o split inteiro
// dentro do número de páginas que precisamos, cobrindo falantes diferentes —
// que é o que importa para um WER representativo.
const STRIDE = 79;

async function fetchRows(offset, length) {
  const url =
    "https://datasets-server.huggingface.co/rows?dataset=facebook%2Fmultilingual_librispeech" +
    `&config=portuguese&split=test&offset=${offset}&length=${length}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`datasets-server ${response.status}`);
  }
  return (await response.json()).rows.map((entry) => entry.row);
}

mkdirSync(OUT_DIR, { recursive: true });

const manifest = [];
let totalSeconds = 0;
let offset = 0;

while (totalSeconds < TARGET_SECONDS && offset < TOTAL_ROWS) {
  const rows = await fetchRows(offset, PAGE);
  if (rows.length === 0) break;

  for (const row of rows) {
    if (totalSeconds >= TARGET_SECONDS) break;

    const src = row.audio?.[0]?.src;
    const reference = (row.transcript ?? "").trim();
    const duration = Number(row.audio_duration ?? 0);
    if (!src || !reference || duration <= 0) continue;

    const id = `${row.speaker_id}-${row.chapter_id}-${row.id}`.replace(/[^\w.-]/g, "_");
    const wavPath = path.join(OUT_DIR, `${id}.wav`);

    if (!existsSync(wavPath)) {
      const opus = Buffer.from(await (await fetch(src)).arrayBuffer());
      const tmp = path.join(OUT_DIR, `${id}.opus`);
      writeFileSync(tmp, opus);
      // Whisper espera 16 kHz mono.
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-ar", "16000", "-ac", "1", wavPath]);
      execFileSync("rm", [tmp]);
    }

    manifest.push({ id, wav: path.basename(wavPath), reference, duration, speaker: row.speaker_id });
    totalSeconds += duration;
  }

  offset += STRIDE;
}

writeFileSync(
  path.join(OUT_DIR, "manifest.json"),
  JSON.stringify({ source: "facebook/multilingual_librispeech pt test", totalSeconds, clips: manifest }, null, 2),
);

console.log(
  `corpus pronto: ${manifest.length} clipes, ${(totalSeconds / 60).toFixed(1)} min, ${
    new Set(manifest.map((clip) => clip.speaker)).size
  } falantes`,
);
