import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Plus, QrCode, Trash2, Upload, Search } from "lucide-react";
import { toast } from "sonner";
import { db, getProgramas, getSetting, type Graduando } from "@/lib/db";
import { deleteGraduando, parseGraduandosCsv, saveGraduando } from "@/lib/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketsDialog } from "./TicketsDialog";

type Form = { id?: string; nombre: string; documento: string; programa: string; cupos: number };

export function GraduandosTab() {
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [ticketsFor, setTicketsFor] = useState<Graduando | null>(null);
  const graduandos = useLiveQuery(() => db().graduandos.orderBy("nombre").toArray(), []);
  const programasQuery = useLiveQuery(() => db().settings.get("programas"), []);
  const programas = programasQuery
    ? (() => {
        try {
          const parsed: unknown = JSON.parse(programasQuery.value);
          return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string" && p.trim().length > 0) : [];
        } catch { return []; }
      })()
    : [];
  const usedCounts = useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db().tickets.where("usedAt").above(0).each((t) => m.set(t.graduandoId, (m.get(t.graduandoId) ?? 0) + 1));
    return m;
  }, []);

  const filtered = (graduandos ?? []).filter((g) =>
    `${g.nombre} ${g.documento} ${g.programa}`.toLowerCase().includes(q.toLowerCase()),
  );

  async function openNew() {
    const list = await getProgramas();
    setForm({
      nombre: "",
      documento: "",
      // Si solo hay un programa, se preselecciona automáticamente.
      programa: list.length === 1 ? list[0] ?? "" : "",
      cupos: parseInt(await getSetting("cuposDefault"), 10) || 4,
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !form.nombre.trim()) return;
    try {
      await saveGraduando(form);
      if (form.id) toast.success("Cambios guardados con éxito");
      else toast.success("Graduando creado con éxito", { description: `Se generaron ${form.cupos} tickets con QR para ${form.nombre}.` });
      setForm(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function importCsv(file: File) {
    const def = parseInt(await getSetting("cuposDefault"), 10) || 4;
    const rows = parseGraduandosCsv(await file.text(), def);
    try { for (const r of rows) await saveGraduando(r); }
    catch (err) { toast.error((err as Error).message); return; }
    toast.success(`${rows.length} graduandos importados con éxito`);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl">Graduandos</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" asChild aria-label="Importar CSV">
            <label>
              <Upload />
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            </label>
          </Button>
          <Button variant="gold" onClick={openNew}><Plus /> Nuevo</Button>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
        <Input className="h-11 pl-9 text-base" placeholder="Buscar por nombre, documento o programa" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">CSV: nombre, documento, programa, cupos (desde Excel: Guardar como CSV).</p>

      <ul className="space-y-2">
        {filtered.map((g) => (
          <li key={g.id} className="flex items-center gap-3 rounded-xl border-2 border-border bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{g.nombre}</p>
              <p className="truncate text-sm text-muted-foreground">{g.documento} · {g.programa}</p>
              <p className="text-sm font-semibold">{usedCounts?.get(g.id) ?? 0} / {g.cupos} ingresados</p>
            </div>
            <Button size="icon" variant="default" aria-label="Ver tickets" onClick={() => setTicketsFor(g)}><QrCode /></Button>
            <Button size="icon" variant="outline" aria-label="Editar" onClick={() => setForm(g)}><Pencil /></Button>
            <Button size="icon" variant="ghost" aria-label="Eliminar" onClick={async () => {
              if (!confirm(`¿Eliminar a ${g.nombre} y sus tickets?`)) return;
              try {
                await deleteGraduando(g.id);
                toast.success(`Graduando "${g.nombre}" eliminado con éxito`);
              } catch (err) { toast.error((err as Error).message); }
            }}><Trash2 /></Button>
          </li>
        ))}
        {graduandos && filtered.length === 0 && (
          <li className="rounded-xl border-2 border-dashed border-border p-8 text-center text-muted-foreground">
            No hay graduandos. Crea uno o importa un CSV.
          </li>
        )}
      </ul>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "Editar graduando" : "Nuevo graduando"}</DialogTitle></DialogHeader>
          {form && (
            <form onSubmit={submit} className="space-y-3">
              {(["nombre", "documento"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label>{k === "nombre" ? "Nombre completo" : "Documento"}</Label>
                  <Input className="h-11 text-base" required={k === "nombre"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <div className="space-y-1">
                <Label>Programa</Label>
                {programas.length > 0 ? (
                  <Select value={form.programa} onValueChange={(v) => setForm({ ...form, programa: v })}>
                    <SelectTrigger className="h-11 w-full text-base">
                      <SelectValue placeholder="Selecciona un programa" />
                    </SelectTrigger>
                    <SelectContent>
                      {programas.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-11 text-base"
                    placeholder="Ej. Sistemas"
                    value={form.programa}
                    onChange={(e) => setForm({ ...form, programa: e.target.value })}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label>Número de cupos</Label>
                <Input className="h-11 text-base" type="number" min={0} max={50} value={form.cupos} onChange={(e) => setForm({ ...form, cupos: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <Button type="submit" size="lg" className="w-full">Guardar</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <TicketsDialog graduando={ticketsFor} onClose={() => setTicketsFor(null)} />
    </div>
  );
}
