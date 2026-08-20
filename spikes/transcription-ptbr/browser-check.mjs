// Roda a transcrição local em um navegador de verdade e AUDITA a rede.
//
// O objetivo não é performance: é provar a afirmação central de
// docs/22-transcription-provider-decision.md — no caminho padrão o áudio não
// sai do dispositivo. Toda requisição feita durante a transcrição é
// registrada; qualquer upload ou destino que não seja peso de modelo reprova.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = import.meta.dirname;
const MODEL = process.env.MODEL ?? "onnx-community/whisper-base";
const PORT = 8099;

const MIME = { ".html": "text/html", ".wav": "audio/wav", ".json": "application/json", ".mjs": "text/javascript" };

const server = createServer((req, res) => {
  const filePath = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream",
    // WASM com threads exige isolamento cross-origin.
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

const manifest = JSON.parse(readFileSync(path.join(ROOT, "corpus/manifest.json"), "utf8"));
const clip = manifest.clips[0];

const SELF_ORIGIN = `http://127.0.0.1:${PORT}`;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

/** @type {{method: string, url: string, bodyBytes: number}[]} */
const requests = [];
page.on("request", (request) => {
  const body = request.postData();
  requests.push({
    method: request.method(),
    url: request.url(),
    bodyBytes: body ? Buffer.byteLength(body) : 0,
  });
});

page.on("console", (message) => console.log(`  [browser] ${message.text()}`));

// Quanto a primeira sessão baixa: é custo de UX real, cacheado depois.
let downloadedBytes = 0;
page.on("response", async (response) => {
  if (response.url().startsWith(SELF_ORIGIN)) return;
  const length = Number(response.headers()["content-length"] ?? 0);
  downloadedBytes += length;
});

await page.goto(`http://127.0.0.1:${PORT}/browser/index.html`);
await page.waitForFunction(() => typeof window.spike === "function");

console.log(`\nexecutando ${MODEL} no navegador...`);
const result = await page.evaluate(
  ([model, wav]) => window.spike({ model, wav }),
  [MODEL, `/corpus/${clip.wav}`],
);

// --- auditoria de rede ---------------------------------------------------
const uploads = requests.filter((request) => request.bodyBytes > 2048);
const audioFetches = requests.filter(
  (request) => request.url.includes("/corpus/") && request.method === "GET",
);
const externalHosts = [
  ...new Set(
    requests
      .filter((request) => !request.url.startsWith(SELF_ORIGIN))
      .map((request) => new URL(request.url).host),
  ),
];

console.log("\n--- auditoria de rede ---");
console.log(`requisições totais: ${requests.length}`);
console.log(`hosts externos contatados: ${externalHosts.join(", ") || "nenhum"}`);
console.log(`uploads (corpo > 2 KB): ${uploads.length}`);
console.log(`baixado na primeira sessão: ${(downloadedBytes / 1024 / 1024).toFixed(0)} MB (cacheado depois)`);
console.log(`leituras locais do áudio (GET próprio origin): ${audioFetches.length}`);

const audioLeaked = uploads.length > 0;
console.log(
  audioLeaked
    ? "\nREPROVADO: houve requisição com corpo grande — investigar vazamento de áudio."
    : "\nAPROVADO: nenhum áudio saiu do dispositivo. Só pesos de modelo foram baixados.",
);

console.log("\n--- resultado ---");
console.log(`backend: ${result.device}`);
console.log(`carga do modelo: ${result.loadSeconds.toFixed(1)}s`);
console.log(`${result.realtimeFactor.toFixed(2)}x tempo real`);
console.log(`REF: ${clip.reference.slice(0, 110)}`);
console.log(`HYP: ${result.text.trim().slice(0, 110)}`);

await browser.close();
server.close();
process.exit(audioLeaked ? 1 : 0);
