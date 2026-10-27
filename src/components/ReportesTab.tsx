import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudDownload, FileDown } from "lucide-react";
import { toast } from "sonner";
import { db, getSetting, setSetting } from "@/lib/db";
import { exportCsv } from "@/lib/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  useEffect(() => {
    (async () => setCfg({
      cuposDefault: await getSetting("cuposDefault"),
      pinPortero: await getSetting("pinPortero"),
      pinAdmin: await getSetting("pinAdmin"),
    }))();
  }, []);

  async function prepare() {
    await getSetting("secret");
    await navigator.storage?.persist?.().catch(() => false);
    const n = await db().tickets.count();
    setReady(`Listo para funcionar sin internet: ${n} tickets cargados en este dispositivo.`);
  }

  async function saveCfg() {
    if (!/^\d{4,8}$/.test(cfg.pinPortero) || !/^\d{4,8}$/.test(cfg.pinAdmin)) { toast.error("Los PIN deben tener de 4 a 8 dígitos"); return; }
    await Promise.all(Object.entries(cfg).map(([k, v]) => setSetting(k, v)));
    toast.success("Configuración guardada");
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
        <Button size="lg" variant="outline" className="w-full" onClick={exportCsv}><FileDown /> Exportar CSV</Button>
      </div>

      <section className="space-y-3 rounded-xl border-2 border-border bg-card p-4">
        <h2 className="text-lg">Configuración</h2>
        <div className="space-y-1"><Label>Cupos por defecto</Label><Input type="number" className="h-11" value={cfg.cuposDefault} onChange={(e) => setCfg({ ...cfg, cuposDefault: e.target.value })} /></div>
        <div className="space-y-1"><Label>PIN de portero</Label><Input inputMode="numeric" className="h-11" value={cfg.pinPortero} onChange={(e) => setCfg({ ...cfg, pinPortero: e.target.value })} /></div>
        <div className="space-y-1"><Label>PIN de administrador</Label><Input inputMode="numeric" className="h-11" value={cfg.pinAdmin} onChange={(e) => setCfg({ ...cfg, pinAdmin: e.target.value })} /></div>
        <Button className="w-full" onClick={saveCfg}>Guardar configuración</Button>
        <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          Sin internet, cada dispositivo solo conoce sus propios ingresos. Usa <b>un solo dispositivo de control por puerta</b> y prepara los tickets en ese mismo dispositivo.
        </p>
      </section>
    </div>
  );
}
