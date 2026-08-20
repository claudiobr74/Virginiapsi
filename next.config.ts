import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Playwright/CI drive the dev server via 127.0.0.1; without this the dev
  // asset firewall blocks static chunks and the app never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Cross-origin isolation for the active clinical session route,
        // where the local-transcription model/WASM runtime loads
        // (docs/08-implementation-phases.md Fase 6). This unlocks
        // SharedArrayBuffer, which onnxruntime-web's WASM backend needs for
        // multi-threaded inference — without it, WASM still works, just
        // single-threaded (2-4x slower). Safe only because
        // scripts/copy-onnx-wasm.mjs self-hosts the ONNX Runtime Web
        // worker/WASM assets same-origin under /ort/: with the default
        // CDN wasmPaths, COEP blocks that worker script entirely (no
        // Cross-Origin-Resource-Policy from the CDN) — confirmed against
        // this pinned @huggingface/transformers version. The Whisper model
        // weights themselves keep loading cross-origin from the Hugging
        // Face Hub via a normal CORS fetch, which COEP does not affect.
        source: "/session/:sessionId",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
