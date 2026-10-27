// Pure ticket code + signature helpers (no database).
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "GRA-" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function signCode(code: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(code)));
  return Array.from(mac.slice(0, 8), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function qrPayload(code: string, sig: string) {
  return `${code}.${sig}`;
}

export function parsePayload(text: string): { code: string; sig?: string | undefined } | null {
  const clean = text.trim().toUpperCase().replace(/\s+/g, "");
  const m = clean.match(/^(GRA-[A-Z0-9]{6})(?:\.([A-Z0-9]{8}))?$/);
  if (!m) return null;
  return { code: m[1]!, sig: m[2] };
}
