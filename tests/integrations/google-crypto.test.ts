import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/integrations/google/crypto";

describe("encryptToken / decryptToken", () => {
  const secret = "test-encryption-secret";

  it("faz o round-trip preservando o valor original", () => {
    const plain = "ya29.a0AfH6SMB_example_refresh_token";
    const encrypted = encryptToken(plain, secret);
    expect(encrypted).not.toContain(plain);
    expect(decryptToken(encrypted, secret)).toBe(plain);
  });

  it("gera ciphertexts diferentes para o mesmo valor (IV aleatório)", () => {
    const plain = "same-token-value";
    const first = encryptToken(plain, secret);
    const second = encryptToken(plain, secret);
    expect(first).not.toBe(second);
    expect(decryptToken(first, secret)).toBe(plain);
    expect(decryptToken(second, secret)).toBe(plain);
  });

  it("falha ao decriptar com a chave errada", () => {
    const encrypted = encryptToken("valor-secreto", secret);
    expect(() => decryptToken(encrypted, "chave-errada")).toThrow();
  });

  it("falha com um valor malformado", () => {
    expect(() => decryptToken("not-a-valid-token", secret)).toThrow(
      /malformed/i,
    );
  });

  it("detecta adulteração do ciphertext (tag de autenticação)", () => {
    const encrypted = encryptToken("valor-original", secret);
    const [iv, tag, ciphertext] = encrypted.split(":");
    const tamperedCiphertext = `${ciphertext.slice(0, -2)}zz`;
    expect(() => decryptToken(`${iv}:${tag}:${tamperedCiphertext}`, secret)).toThrow();
  });
});
