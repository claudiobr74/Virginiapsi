#!/usr/bin/env node
// Self-hosts the ONNX Runtime Web WASM/worker assets under public/ort/ so
// they are same-origin. This is what makes it safe to enable
// Cross-Origin-Embedder-Policy: require-corp on /session (needed for
// SharedArrayBuffer / multi-threaded WASM inference): with the default
// jsDelivr/CDN wasmPaths, COEP blocks the ORT worker script construction
// entirely, because the CDN does not send Cross-Origin-Resource-Policy
// (confirmed against @huggingface/transformers v4 —
// https://github.com/huggingface/transformers.js/issues/1527). Never commit
// these binaries to git — this script regenerates them from the already
//-installed dependency on every install/build (see package.json
// "postinstall"), and public/ort/ is gitignored.
import { copyFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEST = path.join(ROOT, "public", "ort");

// pnpm keeps transitive deps out of the root node_modules by default, and
// onnxruntime-web isn't re-exported by @huggingface/transformers, so we
// can't require.resolve() it directly — find it in pnpm's content-addressed
// store instead. Works the same way regardless of the exact pinned version.
function findOnnxRuntimeWebDist() {
  const pnpmDir = path.join(ROOT, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return null;
  const match = readdirSync(pnpmDir).find((name) => name.startsWith("onnxruntime-web@"));
  if (!match) return null;
  return path.join(pnpmDir, match, "node_modules", "onnxruntime-web", "dist");
}

const ortDistDir = findOnnxRuntimeWebDist();
if (!ortDistDir) {
  console.warn(
    "[copy-onnx-wasm] onnxruntime-web not found under node_modules/.pnpm (transitive dep of @huggingface/transformers) — skipping. WASM fallback transcription will use the CDN default and COEP must stay disabled.",
  );
  process.exit(0);
}

if (!existsSync(ortDistDir)) {
  console.warn(`[copy-onnx-wasm] ${ortDistDir} not found — skipping.`);
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });

const files = readdirSync(ortDistDir).filter(
  (name) =>
    (name.endsWith(".wasm") || name.endsWith(".mjs")) && !name.endsWith(".map"),
);

for (const name of files) {
  copyFileSync(path.join(ortDistDir, name), path.join(DEST, name));
}

console.log(`[copy-onnx-wasm] copied ${files.length} file(s) to public/ort/`);
