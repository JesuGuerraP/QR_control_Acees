import { db, getSetting, type Graduando, type Ticket } from "./db";
import { randomCode, signCode, parsePayload } from "./codes";
import { uuid } from "./pure-crypto";
import { cloudAnular, cloudDeleteGraduando, cloudMark, cloudSaveGraduando } from "./sync.functions";
import { isOnline, requirePin } from "./sync";

function needCloud() {
  if (!isOnline()) throw new Error("Necesitas internet para modificar la lista compartida");
  return requirePin();
}

async function uniqueCode(): Promise<string> {
  for (;;) {
    const c = randomCode();
    if (!(await db().tickets.get(c))) return c;
  }
}

/** Create or update a graduando and keep one ticket per cupo. */
export async function saveGraduando(g: Omit<Graduando, "id" | "createdAt"> & { id?: string }) {
  const pin = needCloud();
  const secret = await getSetting("secret");
  const id = g.id ?? uuid();
  const existing = await db().tickets.where("graduandoId").equals(id).sortBy("index");
  const cupos = Math.max(0, Math.floor(g.cupos));

  // Remove extra unused tickets from the end
  let keep = existing;
  if (existing.length > cupos) {
    const extra = existing.slice(cupos);
    if (extra.some((t) => t.usedAt)) throw new Error("No se pueden quitar cupos ya utilizados");
    keep = existing.slice(0, cupos);
  }
  const fresh: Ticket[] = [];
  for (let i = keep.length; i < cupos; i++) {
    const code = await uniqueCode();
    fresh.push({ code, sig: await signCode(code, secret), graduandoId: id, index: i + 1, total: cupos });
  }
  const prev = g.id ? await db().graduandos.get(g.id) : undefined;
  const graduando: Graduando = {
    id,
    nombre: g.nombre.trim(),
    documento: g.documento.trim(),
    programa: g.programa.trim(),
    cupos,
    createdAt: prev?.createdAt ?? Date.now(),
  };
  const all = [...keep.map((t, i) => ({ ...t, index: i + 1, total: cupos })), ...fresh];
  await cloudSaveGraduando({ data: { pin, graduando, tickets: all } });
  await db().transaction("rw", db().graduandos, db().tickets, async () => {
    if (existing.length > cupos) await db().tickets.bulkDelete(existing.slice(cupos).map((t) => t.code));
    await db().graduandos.put(graduando);
    await db().tickets.bulkPut(all);
  });
  return id;
}

export async function deleteGraduando(id: string) {
  await cloudDeleteGraduando({ data: { pin: needCloud(), id } });
  await db().transaction("rw", db().graduandos, db().tickets, async () => {
    await db().tickets.where("graduandoId").equals(id).delete();
    await db().graduandos.delete(id);
  });
}

export type ScanResult =
  | { kind: "ok"; ticket: Ticket; graduando?: Graduando | undefined }
  | { kind: "used"; ticket: Ticket; graduando?: Graduando | undefined; usedAt: number }
  | { kind: "invalid"; reason: string };

/** Validate a scanned/typed code locally and mark it used exactly once. */
export async function validateAndMark(text: string): Promise<ScanResult> {
  const parsed = parsePayload(text);
  if (!parsed) return { kind: "invalid", reason: "Formato no reconocido" };
  if (parsed.sig) {
    const expected = await signCode(parsed.code, await getSetting("secret"));
    if (expected !== parsed.sig) return { kind: "invalid", reason: "Firma incorrecta" };
  }
  const d = db();
  return d.transaction("rw", d.tickets, d.graduandos, async (): Promise<ScanResult> => {
    const t = await d.tickets.get(parsed.code);
    if (!t) return { kind: "invalid", reason: "Código inexistente" };
    if (parsed.sig && t.sig !== parsed.sig) return { kind: "invalid", reason: "Firma incorrecta" };
    const g = await d.graduandos.get(t.graduandoId);
    if (t.usedAt) return { kind: "used", ticket: t, graduando: g, usedAt: t.usedAt };
    return { kind: "ok", ticket: t, graduando: g };
  }).then(async (r) => {
    if (r.kind !== "ok") return r;
    const usedAt = Date.now();
    const code = r.ticket.code;
    if (isOnline()) {
      try {
        const c = await cloudMark({ data: { pin: requirePin(), code, usedAt } });
        if (c.status === "missing") return { kind: "invalid", reason: "Código anulado o eliminado" };
        await d.tickets.update(code, { usedAt: c.usedAt! });
        if (c.status === "used") return { kind: "used", ticket: { ...r.ticket, usedAt: c.usedAt! }, graduando: r.graduando, usedAt: c.usedAt! };
        return { ...r, ticket: { ...r.ticket, usedAt } };
      } catch { /* sin conexión real: seguir local */ }
    }
    await d.transaction("rw", d.tickets, d.outbox, async () => {
      await d.tickets.update(code, { usedAt });
      await d.outbox.put({ code, usedAt });
    });
    return { ...r, ticket: { ...r.ticket, usedAt } };
  });
}

export async function anularIngreso(code: string, adminPin: string) {
  if (!isOnline()) throw new Error("Necesitas internet para anular");
  await cloudAnular({ data: { pin: adminPin, code } });
  await db().outbox.delete(code);
  await db().tickets.where("code").equals(code).modify((t) => {
    delete t.usedAt;
  });
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportCsv() {
  const [gs, ts] = await Promise.all([db().graduandos.toArray(), db().tickets.toArray()]);
  const map = new Map(gs.map((g) => [g.id, g]));
  const rows = [["codigo", "graduando", "documento", "programa", "ticket", "estado", "hora_ingreso"]];
  for (const t of ts) {
    const g = map.get(t.graduandoId);
    rows.push([
      t.code,
      g?.nombre ?? "",
      g?.documento ?? "",
      g?.programa ?? "",
      `${t.index} de ${t.total}`,
      t.usedAt ? "INGRESADO" : "PENDIENTE",
      t.usedAt ? new Date(t.usedAt).toLocaleString("es-CO") : "",
    ]);
  }
  const csv = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `tickets-grado-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse CSV text: nombre, documento, programa, cupos (header optional). */
export function parseGraduandosCsv(text: string, cuposDefault: number) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = lines[0]?.includes(";") ? ";" : ",";
  const out: { nombre: string; documento: string; programa: string; cupos: number }[] = [];
  for (const [i, line] of lines.entries()) {
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /nombre/i.test(cols[0] ?? "")) continue;
    if (!cols[0]) continue;
    const n = parseInt(cols[3] ?? "", 10);
    out.push({ nombre: cols[0], documento: cols[1] ?? "", programa: cols[2] ?? "", cupos: Number.isFinite(n) ? n : cuposDefault });
  }
  return out;
}
