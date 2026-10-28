import Dexie, { type Table } from "dexie";

export interface Graduando {
  id: string;
  nombre: string;
  documento: string;
  programa: string;
  cupos: number;
  createdAt: number;
}

export interface Ticket {
  code: string;
  sig: string;
  graduandoId: string;
  index: number;
  total: number;
  usedAt?: number;
}

export interface Setting {
  key: string;
  value: string;
}

class CuposDB extends Dexie {
  graduandos!: Table<Graduando, string>;
  tickets!: Table<Ticket, string>;
  settings!: Table<Setting, string>;
  outbox!: Table<{ code: string; usedAt: number }, string>;
  constructor() {
    super("cupos-grado");
    this.version(1).stores({
      graduandos: "id, documento, nombre",
      tickets: "code, graduandoId, usedAt",
      settings: "key",
    });
    this.version(2).stores({ outbox: "code" });
  }
}

let _db: CuposDB | null = null;
export function db() {
  if (!_db) _db = new CuposDB();
  return _db;
}

export const DEFAULTS = {
  cuposDefault: "4",
  pinPortero: "0000",
  pinAdmin: "1234",
} as const;

export async function getSetting(key: keyof typeof DEFAULTS | "secret"): Promise<string> {
  const row = await db().settings.get(key);
  if (row) return row.value;
  if (key === "secret") {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const value = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await db().settings.put({ key, value });
    return value;
  }
  return DEFAULTS[key];
}

export async function setSetting(key: string, value: string) {
  await db().settings.put({ key, value });
}
