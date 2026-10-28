import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, Flashlight, AlertTriangle, XCircle, Keyboard } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { anularIngreso, validateAndMark, type ScanResult } from "@/lib/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function feedback(kind: ScanResult["kind"]) {
  try {
    navigator.vibrate?.(kind === "ok" ? 120 : [250, 100, 250]);
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = kind === "ok" ? 1046 : kind === "used" ? 220 : 440;
    o.type = kind === "ok" ? "sine" : "square";
    g.gain.value = 0.25;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (kind === "ok" ? 0.18 : 0.5));
  } catch { /* ignore */ }
}

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function ScannerTab() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busy = useRef(false);
  const resultRef = useRef<ScanResult | null>(null);
  resultRef.current = result;

  const total = useLiveQuery(() => db().tickets.count(), []) ?? 0;
  const used = useLiveQuery(() => db().tickets.where("usedAt").above(0).count(), []) ?? 0;
  const recent = useLiveQuery(async () => {
    const ts = await db().tickets.orderBy("usedAt").reverse().limit(15).toArray();
    const gs = await db().graduandos.bulkGet(ts.map((t) => t.graduandoId));
    return ts.map((t, i) => ({ t, g: gs[i] }));
  }, []);

  const handle = useCallback(async (text: string) => {
    const key = text.trim().toUpperCase();
    const now = Date.now();
    if (busy.current || resultRef.current) return;
    if (key === last.current.code && now - last.current.at < 3000) return; // anti-rebote 3s
    last.current = { code: key, at: now };
    busy.current = true;
    try {
      const r = await validateAndMark(key);
      feedback(r.kind);
      setResult(r);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (stopped) return;
      const s = new Html5Qrcode("qr-reader", { verbose: false });
      scannerRef.current = s;
      try {
        await s.start({ facingMode: "environment" }, { fps: 12, qrbox: (w, h) => { const m = Math.floor(Math.min(w, h) * 0.7); return { width: m, height: m }; } }, (t) => handle(t), () => {});
      } catch (e) {
        setCamError("No se pudo abrir la cámara. Usa el código manual o revisa los permisos.");
        console.warn(e);
      }
    })();
    return () => {
      stopped = true;
      const s = scannerRef.current;
      if (s?.isScanning) s.stop().catch(() => {});
    };
  }, [handle]);

  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => setResult(null), result.kind === "ok" ? 2500 : 4000);
    return () => clearTimeout(id);
  }, [result]);

  async function toggleTorch() {
    try {
      await scannerRef.current?.applyVideoConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn(!torchOn);
    } catch {
      toast.error("Este dispositivo no permite linterna");
    }
  }

  async function anular(code: string) {
    const pin = prompt("PIN de administrador para anular el ingreso");
    if (pin === null) return;
    try { await anularIngreso(code, pin); } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo anular"); return; }
    toast.success(`Ingreso ${code} anulado`);
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
        <span className="text-sm font-semibold uppercase tracking-wide">Ingresados</span>
        <span className="font-display text-3xl tabular-nums">{used} <span className="text-lg opacity-70">/ {total}</span></span>
      </div>

      <div className="relative aspect-[3/4] w-full overflow-hidden bg-foreground">
        <div id="qr-reader" className="h-full w-full" />
        {camError && <p className="absolute inset-0 flex items-center justify-center p-6 text-center font-semibold text-background">{camError}</p>}
        <div className="absolute bottom-3 right-3 flex gap-2">
          <Button size="icon" variant={torchOn ? "gold" : "secondary"} onClick={toggleTorch} aria-label="Linterna"><Flashlight /></Button>
          <Button size="icon" variant="secondary" onClick={() => setShowManual((v) => !v)} aria-label="Código manual"><Keyboard /></Button>
        </div>
      </div>

      {showManual && (
        <form className="flex gap-2 p-4" onSubmit={(e) => { e.preventDefault(); last.current = { code: "", at: 0 }; handle(manual); setManual(""); }}>
          <Input autoFocus value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} placeholder="GRA-XXXXXX" className="h-14 font-mono text-xl uppercase" />
          <Button type="submit" size="lg">Validar</Button>
        </form>
      )}

      <section className="p-4">
        <h2 className="mb-2 text-lg">Últimos ingresos</h2>
        <ul className="space-y-2">
          {recent?.map(({ t, g }) => (
            <li key={t.code} className="flex items-center gap-3 rounded-xl border-2 border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{g?.nombre ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{t.code} · {t.index} de {t.total} · {t.usedAt && hora(t.usedAt)}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => anular(t.code)}>Anular</Button>
            </li>
          ))}
          {recent?.length === 0 && <li className="text-muted-foreground">Aún no hay ingresos.</li>}
        </ul>
      </section>

      {result && <ResultOverlay r={result} onClose={() => setResult(null)} />}
    </div>
  );
}

function ResultOverlay({ r, onClose }: { r: ScanResult; onClose: () => void }) {
  const cls = r.kind === "ok" ? "bg-success text-success-foreground" : r.kind === "used" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground";
  const Icon = r.kind === "ok" ? CheckCircle2 : r.kind === "used" ? XCircle : AlertTriangle;
  return (
    <button onClick={onClose} className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-6 text-center ${cls}`}>
      <Icon className="size-40 animate-pop" strokeWidth={2.5} />
      <h2 className="text-5xl leading-none">
        {r.kind === "ok" ? "ENTRADA VÁLIDA" : r.kind === "used" ? "TICKET YA UTILIZADO" : "TICKET NO VÁLIDO"}
      </h2>
      {r.kind !== "invalid" && (
        <>
          <p className="text-3xl font-bold">{r.graduando?.nombre}</p>
          <p className="text-2xl font-semibold">Ticket {r.ticket.index} de {r.ticket.total}</p>
          {r.kind === "used" && <p className="text-3xl font-bold">Usado a las {hora(r.usedAt)}</p>}
        </>
      )}
      {r.kind === "invalid" && <p className="text-2xl font-semibold">{r.reason}</p>}
      <p className="mt-6 text-base opacity-80">Toca para continuar</p>
    </button>
  );
}
