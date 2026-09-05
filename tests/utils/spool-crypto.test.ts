import { describe, expect, it } from "vitest";
import {
  encryptBytes,
  decryptBytes,
  generateAesGcmKey,
  probeWebCryptoAesGcm,
} from "@/features/sessions/transcription/spool-crypto";

describe("spool AES-GCM", () => {
  it("cifra e recupera o payload sem plaintext no envelope", async () => {
    expect(await probeWebCryptoAesGcm()).toBe(true);
    const key = await generateAesGcmKey();
    const ivs: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const { iv, ciphertext } = await encryptBytes(key, new TextEncoder().encode(`chunk-${index}`));
      ivs.push(Buffer.from(iv).toString("hex"));
      const plain = await decryptBytes(
        key,
        iv as BufferSource,
        ciphertext as BufferSource,
      );
      expect(new TextDecoder().decode(plain)).toBe(`chunk-${index}`);
      expect(Buffer.from(ciphertext).includes(Buffer.from("chunk-"))).toBe(false);
    }
    expect(new Set(ivs).size).toBe(3);
  });
});
