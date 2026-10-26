import { describe, expect, it } from "vitest";
import { parsePayload, qrPayload, randomCode, signCode } from "@/lib/codes";

describe("ticket codes", () => {
  it("generates codes like GRA-XXXXXX", () => {
    expect(randomCode()).toMatch(/^GRA-[A-Z0-9]{6}$/);
  });

  it("a forged signature does not match the real one", async () => {
    const sig = await signCode("GRA-7K4M2P", "secret-a");
    expect(await signCode("GRA-7K4M2P", "secret-a")).toBe(sig);
    expect(await signCode("GRA-7K4M2P", "secret-b")).not.toBe(sig);
    expect(await signCode("GRA-7K4M2Q", "secret-a")).not.toBe(sig);
  });

  it("parses QR payload and manual code, rejects garbage", () => {
    expect(parsePayload(qrPayload("GRA-7K4M2P", "ABCDEFGH"))).toEqual({ code: "GRA-7K4M2P", sig: "ABCDEFGH" });
    expect(parsePayload(" gra-7k4m2p ")).toEqual({ code: "GRA-7K4M2P", sig: undefined });
    expect(parsePayload("https://evil.com")).toBeNull();
  });
});
