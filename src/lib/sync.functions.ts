import { createServerFn } from "@tanstack/react-start";

// All cloud tables are locked (no public policies); every access goes through
// these PIN-checked functions using the privileged client.

const DEFAULTS: Record<string, string> = { cuposDefault: "4", pinPortero: "0000", pinAdmin: "1234" };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadSettings() {
  const sb = await admin();
  const { data, error } = await sb.from("app_settings").select("key, value");
  if (error) throw new Error(error.message);
  const m: Record<string, string> = { ...DEFAULTS };
  for (const r of data ?? []) m[r.key] = r.value;
  return {
    pinAdmin: m["pinAdmin"] ?? "1234",
    pinPortero: m["pinPortero"] ?? "0000",
    cuposDefault: m["cuposDefault"] ?? "4",
    secret: m["secret"] ?? null,
    programas: m["programas"] ?? "[]",
  };
}

async function roleFor(pin: string, need: "admin" | "portero" = "portero") {
  const s = await loadSettings();
  const role: "admin" | "portero" | null = pin === s.pinAdmin ? "admin" : pin === s.pinPortero ? "portero" : null;
  if (!role || (need === "admin" && role !== "admin")) throw new Error("PIN incorrecto");
  return { role, s };
}

type G = { id: string; nombre: string; documento: string; programa: string; cupos: number; createdAt: number };
type T = { code: string; sig: string; graduandoId: string; index: number; total: number; usedAt?: number | null };
const gRow = (g: G) => ({ id: g.id, nombre: g.nombre, documento: g.documento, programa: g.programa, cupos: g.cupos, created_at: g.createdAt });
const tRow = (t: T) => ({ code: t.code, sig: t.sig, graduando_id: t.graduandoId, idx: t.index, total: t.total, used_at: t.usedAt ?? null });

const str = (v: unknown) => { if (typeof v !== "string") throw new Error("Datos inválidos"); return v; };

export const cloudPull = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string }) => ({ pin: str(d.pin) }))
  .handler(async ({ data }) => {
    const { role, s } = await roleFor(data.pin);
    const sb = await admin();
    const [gs, ts] = await Promise.all([
      sb.from("graduandos").select("*").limit(10000),
      sb.from("tickets").select("*").limit(50000),
    ]);
    if (gs.error || ts.error) throw new Error("No se pudo leer la nube");
    return {
      role,
      settings: {
        secret: s.secret ?? null,
        cuposDefault: s.cuposDefault,
        pinPortero: s.pinPortero,
        pinAdmin: role === "admin" ? s.pinAdmin : null,
        programas: s.programas,
      },
      graduandos: gs.data.map((g) => ({ id: g.id, nombre: g.nombre, documento: g.documento, programa: g.programa, cupos: g.cupos, createdAt: Number(g.created_at) })),
      tickets: ts.data.map((t) => ({ code: t.code, sig: t.sig, graduandoId: t.graduando_id, index: t.idx, total: t.total, usedAt: t.used_at == null ? null : Number(t.used_at) })),
    };
  });

/** First admin sync: adopt this device's signing key and data if the cloud has none. */
export const cloudBootstrap = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string; secret: string; graduandos: G[]; tickets: T[] }) => d)
  .handler(async ({ data }) => {
    const { s } = await roleFor(data.pin, "admin");
    if (s.secret) return { adopted: false };
    const sb = await admin();
    const { error } = await sb.from("app_settings").insert({ key: "secret", value: str(data.secret) });
    if (error) return { adopted: false };
    if (data.graduandos.length) await sb.from("graduandos").upsert(data.graduandos.map(gRow));
    if (data.tickets.length) await sb.from("tickets").upsert(data.tickets.map(tRow));
    return { adopted: true };
  });

export const cloudSaveGraduando = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string; graduando: G; tickets: T[] }) => d)
  .handler(async ({ data }) => {
    await roleFor(data.pin, "admin");
    const sb = await admin();
    const { data: cur } = await sb.from("tickets").select("code, used_at").eq("graduando_id", data.graduando.id);
    const keep = new Set(data.tickets.map((t) => t.code));
    const remove = (cur ?? []).filter((t) => !keep.has(t.code));
    if (remove.some((t) => t.used_at != null)) throw new Error("No se pueden quitar cupos ya utilizados");
    const g = await sb.from("graduandos").upsert(gRow(data.graduando));
    if (g.error) throw new Error(g.error.message);
    if (remove.length) await sb.from("tickets").delete().in("code", remove.map((t) => t.code));
    // never overwrite used_at from a client edit
    const rows = data.tickets.map((t) => { const { used_at: _u, ...r } = tRow(t); return r; });
    if (rows.length) {
      const t = await sb.from("tickets").upsert(rows);
      if (t.error) throw new Error(t.error.message);
    }
    return { ok: true };
  });

export const cloudDeleteGraduando = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string; id: string }) => ({ pin: str(d.pin), id: str(d.id) }))
  .handler(async ({ data }) => {
    await roleFor(data.pin, "admin");
    const sb = await admin();
    await sb.from("graduandos").delete().eq("id", data.id);
    return { ok: true };
  });

/** Atomically mark a ticket used. First device wins. */
export const cloudMark = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string; code: string; usedAt: number }) => ({ pin: str(d.pin), code: str(d.code), usedAt: Number(d.usedAt) }))
  .handler(async ({ data }) => {
    await roleFor(data.pin);
    const sb = await admin();
    const upd = await sb.from("tickets").update({ used_at: data.usedAt }).eq("code", data.code).is("used_at", null).select("code");
    if (upd.error) throw new Error(upd.error.message);
    if (upd.data.length) return { status: "ok" as const, usedAt: data.usedAt };
    const { data: t } = await sb.from("tickets").select("used_at").eq("code", data.code).maybeSingle();
    if (!t) return { status: "missing" as const, usedAt: null };
    return { status: "used" as const, usedAt: Number(t.used_at) };
  });

export const cloudAnular = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string; code: string }) => ({ pin: str(d.pin), code: str(d.code) }))
  .handler(async ({ data }) => {
    await roleFor(data.pin, "admin");
    const sb = await admin();
    await sb.from("tickets").update({ used_at: null }).eq("code", data.code);
    return { ok: true };
  });

export const cloudSaveProgramas = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string; programas: string }) => ({ pin: str(d.pin), programas: str(d.programas) }))
  .handler(async ({ data }) => {
    await roleFor(data.pin, "admin");
    let list: unknown;
    try { list = JSON.parse(data.programas); } catch { throw new Error("Datos inválidos"); }
    if (!Array.isArray(list) || list.some((p) => typeof p !== "string" || p.length > 80)) throw new Error("Datos inválidos");
    const sb = await admin();
    const { error } = await sb.from("app_settings").upsert({ key: "programas", value: data.programas });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cloudSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string; cuposDefault: string; pinPortero: string; pinAdmin: string }) => d)
  .handler(async ({ data }) => {
    await roleFor(data.pin, "admin");
    if (!/^\d{4,8}$/.test(data.pinPortero) || !/^\d{4,8}$/.test(data.pinAdmin)) throw new Error("PIN inválido");
    const sb = await admin();
    await sb.from("app_settings").upsert([
      { key: "cuposDefault", value: String(data.cuposDefault) },
      { key: "pinPortero", value: data.pinPortero },
      { key: "pinAdmin", value: data.pinAdmin },
    ]);
    return { ok: true };
  });
