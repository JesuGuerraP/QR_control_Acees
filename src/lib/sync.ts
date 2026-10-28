import { db, setSetting, type Graduando, type Ticket } from "./db";
import { cloudBootstrap, cloudPull } from "./sync.functions";

let session: { pin: string; role: "admin" | "portero" } | null = null;

export function getSession() {
  if (!session && typeof sessionStorage !== "undefined") {
    const raw = sessionStorage.getItem("cupos-session");
    if (raw) session = JSON.parse(raw);
  }
  return session;
}
function setSession(s: typeof session) {
  session = s;
  if (s) sessionStorage.setItem("cupos-session", JSON.stringify(s));
}
export const isOnline = () => typeof navigator === "undefined" || navigator.onLine;
export function requirePin(): string {
  const s = getSession();
  if (!s) throw new Error("Vuelve a ingresar el PIN");
  return s.pin;
}

type Pulled = Awaited<ReturnType<typeof cloudPull>>;

async function apply(p: Pulled) {
  const d = db();
  const pending = new Map((await d.outbox.toArray()).map((o) => [o.code, o.usedAt]));
  await d.transaction("rw", d.graduandos, d.tickets, d.settings, async () => {
    await d.graduandos.clear();
    await d.tickets.clear();
    await d.graduandos.bulkPut(p.graduandos as Graduando[]);
    await d.tickets.bulkPut(
      p.tickets.map((t): Ticket => {
        const usedAt = t.usedAt ?? pending.get(t.code);
        const { usedAt: _u, ...rest } = t;
        return usedAt ? { ...rest, usedAt } : rest;
      }),
    );
    if (p.settings.secret) await d.settings.put({ key: "secret", value: p.settings.secret });
    await d.settings.put({ key: "cuposDefault", value: p.settings.cuposDefault });
    await d.settings.put({ key: "pinPortero", value: p.settings.pinPortero });
    if (p.settings.pinAdmin) await d.settings.put({ key: "pinAdmin", value: p.settings.pinAdmin });
  });
}

let running: Promise<void> | null = null;
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const s = getSession();
    if (!s || !isOnline()) return;
    const { cloudMark } = await import("./sync.functions");
    for (const o of await db().outbox.toArray()) {
      await cloudMark({ data: { pin: s.pin, code: o.code, usedAt: o.usedAt } });
      await db().outbox.delete(o.code);
    }
    let p = await cloudPull({ data: { pin: s.pin } });
    if (!p.settings.secret && s.role === "admin") {
      const { getSetting } = await import("./db");
      await cloudBootstrap({
        data: { pin: s.pin, secret: await getSetting("secret"), graduandos: await db().graduandos.toArray(), tickets: await db().tickets.toArray() },
      });
      p = await cloudPull({ data: { pin: s.pin } });
    }
    await apply(p);
    lastSync = Date.now();
  })().finally(() => { running = null; });
  return running;
}
export let lastSync = 0;

/** Verify the PIN against the cloud when online, else against the last synced copy. */
export async function login(pin: string, need: "admin" | "portero"): Promise<boolean> {
  if (isOnline()) {
    try {
      const p = await cloudPull({ data: { pin } });
      if (need === "admin" && p.role !== "admin") return false;
      setSession({ pin, role: p.role });
      await syncNow();
      return true;
    } catch (e) {
      if (e instanceof Error && /PIN incorrecto/.test(e.message)) return false;
    }
  }
  const { getSetting } = await import("./db");
  const role = pin === (await getSetting("pinAdmin")) ? "admin" : pin === (await getSetting("pinPortero")) ? "portero" : null;
  if (!role || (need === "admin" && role !== "admin")) return false;
  setSession({ pin, role });
  return true;
}

export async function saveLocalSettings(cfg: Record<string, string>) {
  await Promise.all(Object.entries(cfg).map(([k, v]) => setSetting(k, v)));
}
