import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudDownload, FileDown, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { db, getProgramas, getSetting, saveProgramas, setSetting } from "@/lib/db";
import { cloudSaveProgramas, cloudSaveSettings } from "@/lib/sync.functions";
import { requirePin, syncNow } from "@/lib/sync";
import { exportCsv } from "@/lib/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function ReportesTab() {
  const stats = useLiveQuery(async () => {
    const [g, t, u] = await Promise.all([
      db().graduandos.count(),
      db().tickets.count(),
      db().tickets.where("usedAt").above(0).count(),
    ]);
    return { g, t, u };
  }, []);
  const [cfg, setCfg] = useState({ cuposDefault: "", pinPortero: "", pinAdmin: "" });
  const [ready, setReady] = useState<string | null>(null);
  const [programas, setProgramas] = useState<string[]>([]);
  const [nuevo, setNuevo] = useState("");

  useEffect(() => {
    (async () => {
      setCfg({
        cuposDefault: await getSetting("cuposDefault"),
        pinPortero: await getSetting("pinPortero"),
        pinAdmin: await getSetting("pinAdmin"),
      });
      setProgramas(await getProgramas());
    })();
  }, []);

  async function persistProgramas(next: string[], accion: "agregado" | "eliminado") {
    setProgramas(next);
    await saveProgramas(next);
    try {
      await cloudSaveProgramas({ data: { pin: requirePin(), programas: JSON.stringify(next) } });
      await db().settings.delete("programasDirty");
      toast.success(`Programa ${accion} con éxito`, { description: "Disponible también en los otros dispositivos." });
    } catch {
      await setSetting("programasDirty", "1");
      toast.success(`Programa ${accion} en este dispositivo`, {
        description: "Se enviará a la nube cuando vuelva internet.",
      });
    }
  }

  async function agregarPrograma() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    if (nombre.length > 80) { toast.error("El nombre del programa es muy largo (máx. 80 caracteres)"); return; }
    if (programas.some((p) => p.toLowerCase() === nombre.toLowerCase())) {
      toast.warning("Ese programa ya está agregado");
      setNuevo("");
      return;
    }
    setNuevo("");
    await persistProgramas([...programas, nombre], "agregado");
  }

  async function eliminarPrograma(nombre: string) {
    await persistProgramas(programas.filter((p) => p !== nombre), "eliminado");
  }

  async function prepare() {
    try {
      await syncNow();
      toast.success("Datos descargados con éxito");
    } catch {
      toast.error("No se pudo conectar con la nube; se usan los datos guardados");
    }
    await navigator.storage?.persist?.().catch(() => false);
    const n = await db().tickets.count();
    setReady(`Listo para funcionar sin internet: ${n} tickets cargados en este dispositivo.`);
  }

  async function saveCfg() {
    if (!/^\d{4,8}$/.test(cfg.pinPortero) || !/^\d{4,8}$/.test(cfg.pinAdmin)) { toast.error("Los PIN deben tener de 4 a 8 dígitos"); return; }
    try { await cloudSaveSettings({ data: { pin: requirePin(), ...cfg } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Necesitas internet para cambiar la configuración"); return; }
    await Promise.all(Object.entries(cfg).map(([k, v]) => setSetting(k, v)));
    toast.success("Configuración guardada con éxito");
  }

  async function exportar() {
    try {
      await exportCsv();
      toast.success("Reporte exportado con éxito", { description: "Se descargó el archivo CSV con todos los tickets." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo exportar el reporte");
    }
  }

  const pend = (stats?.t ?? 0) - (stats?.u ?? 0);
  const pct = stats?.t ? Math.round((stats.u / stats.t) * 100) : 0;
  const cards = [
    ["Graduandos", stats?.g ?? 0],
    ["Tickets emitidos", stats?.t ?? 0],
    ["Ingresados", stats?.u ?? 0],
    ["Pendientes", pend],
  ] as const;

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl">Reportes</h1>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(([l, v]) => (
          <div key={l} className="rounded-xl border-2 border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold text-muted-foreground">{l}</p>
            <p className="font-display text-3xl tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border-2 border-border bg-card p-4">
        <div className="flex justify-between font-bold"><span>Asistencia</span><span>{pct}%</span></div>
        <div className="mt-2 h-4 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        <Button size="lg" variant="gold" className="w-full" onClick={prepare}><CloudDownload /> Descargar datos para el evento</Button>
        {ready && <p className="rounded-lg bg-success p-3 font-semibold text-success-foreground">{ready}</p>}
        <Button size="lg" variant="outline" className="w-full" onClick={exportar}><FileDown /> Exportar CSV</Button>
      </div>

      <section className="space-y-3 rounded-xl border-2 border-border bg-card p-4">
        <h2 className="text-lg">Programas de estudio</h2>
        <div className="flex gap-2">
          <Input
            className="h-11 text-base"
            placeholder="Nombre del programa (ej. Sistemas)"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarPrograma(); } }}
          />
          <Button className="h-11 shrink-0" onClick={agregarPrograma}><Plus /> Agregar</Button>
        </div>
        {programas.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {programas.map((p) => (
              <Badge key={p} variant="secondary" className="gap-1 px-3 py-1.5 text-sm font-semibold">
                {p}
                <button onClick={() => eliminarPrograma(p)} aria-label={`Quitar ${p}`} className="ml-1 rounded-full hover:bg-destructive/15">
                  <X className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no hay programas. Agrégalos y aparecerán como lista al crear o editar graduandos.</p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border-2 border-border bg-card p-4">
        <h2 className="text-lg">Configuración</h2>
        <div className="space-y-1"><Label>Cupos por defecto</Label><Input type="number" className="h-11" value={cfg.cuposDefault} onChange={(e) => setCfg({ ...cfg, cuposDefault: e.target.value })} /></div>
        <div className="space-y-1"><Label>PIN de portero</Label><Input inputMode="numeric" className="h-11" value={cfg.pinPortero} onChange={(e) => setCfg({ ...cfg, pinPortero: e.target.value })} /></div>
        <div className="space-y-1"><Label>PIN de administrador</Label><Input inputMode="numeric" className="h-11" value={cfg.pinAdmin} onChange={(e) => setCfg({ ...cfg, pinAdmin: e.target.value })} /></div>
        <Button className="w-full" onClick={saveCfg}>Guardar configuración</Button>
        <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          La lista y los ingresos se comparten en la nube entre todos los dispositivos. Sin internet, cada equipo sigue escaneando con su última copia y envía los ingresos al reconectar.
        </p>
      </section>
    </div>
  );
}
