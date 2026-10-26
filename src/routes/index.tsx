import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, ScanLine, Users, Wifi, WifiOff, Lock } from "lucide-react";
import { getSetting } from "@/lib/db";
import { setupServiceWorker } from "@/lib/pwa";
import { GraduandosTab } from "@/components/GraduandosTab";
import { ScannerTab } from "@/components/ScannerTab";
import { ReportesTab } from "@/components/ReportesTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Control de Cupos de Grado" },
      { name: "description", content: "Controla la entrada de invitados a la ceremonia de grado con tickets QR, incluso sin internet." },
      { property: "og:title", content: "Control de Cupos de Grado" },
      { property: "og:description", content: "Tickets QR de un solo uso y escáner que funciona sin conexión." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Tab = "graduandos" | "scanner" | "reportes";

function Index() {
  const [tab, setTab] = useState<Tab>("scanner");
  const [online, setOnline] = useState(true);
  const [unlocked, setUnlocked] = useState<{ admin: boolean; portero: boolean }>({ admin: false, portero: false });

  useEffect(() => {
    setupServiceWorker();
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);

  const needs = tab === "scanner" ? "portero" : "admin";
  const ok = unlocked.admin || (needs === "portero" && unlocked.portero);

  const tabs = [
    { id: "graduandos", label: "Graduandos", Icon: Users },
    { id: "scanner", label: "Escáner", Icon: ScanLine },
    { id: "reportes", label: "Reportes", Icon: BarChart3 },
  ] as const;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col bg-background pb-20">
      <div className={`flex items-center justify-center gap-2 py-1 text-xs font-semibold ${online ? "bg-muted text-muted-foreground" : "bg-warning text-warning-foreground"}`}>
        {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
        {online ? "Conectado" : "Sin conexión: funcionando en local"}
      </div>
      <main className="flex-1">
        {!ok ? (
          <PinGate role={needs} onOk={() => setUnlocked((u) => ({ ...u, [needs]: true }))} />
        ) : tab === "graduandos" ? <GraduandosTab /> : tab === "scanner" ? <ScannerTab /> : <ReportesTab />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-card">
        <div className="mx-auto grid max-w-xl grid-cols-3">
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={`flex flex-col items-center gap-1 py-3 text-sm font-bold ${tab === id ? "text-primary" : "text-muted-foreground"}`}>
              <span className={`rounded-full px-4 py-1 ${tab === id ? "bg-secondary" : ""}`}><Icon className="size-6" /></span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function PinGate({ role, onOk }: { role: "admin" | "portero"; onOk: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const [a, p] = [await getSetting("pinAdmin"), await getSetting("pinPortero")];
    if (pin === a || (role === "portero" && pin === p)) onOk();
    else { setErr(true); setPin(""); }
  }
  return (
    <form onSubmit={submit} className="flex flex-col items-center gap-4 px-6 pt-20 text-center">
      <span className="rounded-full bg-secondary p-5"><Lock className="size-10 text-secondary-foreground" /></span>
      <h1 className="text-3xl">Control de Cupos de Grado</h1>
      <p className="text-muted-foreground">Ingresa el PIN de {role === "admin" ? "administrador" : "portero"}</p>
      <Input autoFocus type="password" inputMode="numeric" value={pin} onChange={(e) => { setPin(e.target.value); setErr(false); }} className="h-16 max-w-xs text-center text-3xl tracking-[0.5em]" />
      {err && <p className="font-bold text-destructive">PIN incorrecto</p>}
      <Button type="submit" size="lg" className="w-full max-w-xs">Entrar</Button>
    </form>
  );
}
