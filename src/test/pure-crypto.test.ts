import { createHash, createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { hmacSha256Bytes, sha256Bytes, uuid } from "@/lib/pure-crypto";

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
const enc = new TextEncoder();

const msgA = enc.encode("abc");
const msgEmpty = enc.encode("");
const msgF = enc.encode("The quick brown fox jumps over the lazy dog");
const key = enc.encode("key");
const secret = enc.encode("secreto-de-prueba-con-acentos-áéíóú-0123456789");

it("sha256 contra golden values", () => {
  expect(hex(sha256Bytes(msgA))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  expect(hex(sha256Bytes(msgEmpty))).toBe(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

it("sha256 contra node:crypto", () => {
  for (const m of [msgA, msgEmpty, msgF, secret]) {
    expect(hex(sha256Bytes(m))).toBe(createHash("sha256").update(m).digest("hex"));
  }
});

it("hmac coincide con node:crypto", () => {
  for (const m of [msgA, msgEmpty, msgF, secret]) {
    expect(hex(hmacSha256Bytes(key, m))).toBe(
      createHmac("sha256", key).update(m).digest("hex"),
    );
  }
});

it("hmac ('key', raposa) golden", () => {
  expect(hex(hmacSha256Bytes(key, msgF))).toBe(
    createHmac("sha256", key).update("The quick brown fox jumps over the lazy dog").digest("hex"),
  );
});

it("claves más largas que el bloque de 64 bytes también coinciden", () => {
  const longKey = enc.encode("x".repeat(200));
  expect(hex(hmacSha256Bytes(longKey, msgF))).toBe(
    createHmac("sha256", longKey).update("The quick brown fox jumps over the lazy dog").digest("hex"),
  );
});

it("uuid es formato v4", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const u = uuid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    seen.add(u);
  }
  expect(seen.size).toBe(50); // sin repeticiones
});
