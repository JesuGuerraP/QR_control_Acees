import { useEffect, useState } from "react";
import { Download, Images, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { db, type Graduando, type Ticket } from "@/lib/db";
import { ticketPng } from "@/lib/ticket-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Item = { t: Ticket; png: string };

function fileSafe(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "-") || "graduando";
}

/** Convert a data-URL PNG into a File that navigator.share can use. */
function toFile(i: Item): File {
  const [, b64] = i.png.split(",");
  const bin = atob(b64!);
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  return new File([bytes], `${i.t.code}.png`, { type: "image/png" });
}

export function TicketsDialog({ graduando, onClose }: { graduando: Graduando | null; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!graduando) return setItems([]);
    let alive = true;
    (async () => {
      const ts = await db().tickets.where("graduandoId").equals(graduando.id).sortBy("index");
      const out = await Promise.all(ts.map(async (t) => ({ t, png: await ticketPng(graduando, t) })));
      if (alive) setItems(out);
    })();
    return () => { alive = false; };
  }, [graduando]);

  function download({ t, png }: Item) {
    const a = document.createElement("a");
    a.href = png;
    a.download = `${t.code}.png`;
    a.click();
    toast.success(`Ticket ${t.code} descargado con éxito`);
  }

  async function share({ t, png }: Item) {
    const text = `Instituto Técnico Laboral ATUCSARA · Ticket de grado de ${graduando?.nombre} (${t.index} de ${t.total}). Código: ${t.code}`;
    try {
      const blob = await (await fetch(png)).blob();
      const file = new File([blob], `${t.code}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        toast.success(`Ticket ${t.code} compartido con éxito`);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      /* The WhatsApp fallback works outside the editor's sandboxed preview. */
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function downloadAll() {
    if (!graduando || !items.length) return;
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const i of items) {
        const [, b64] = i.png.split(",");
        zip.file(`${i.t.index}-${i.t.code}.png`, b64!, { base64: true });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `tickets-${fileSafe(graduando.nombre)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${items.length} tickets descargados con éxito`, { description: `Archivo tickets-${fileSafe(graduando.nombre)}.zip` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el archivo ZIP");
    }
  }

  async function shareAll() {
    if (!graduando || !items.length) return;
    const text = `Instituto Técnico Laboral ATUCSARA · ${items.length} tickets de grado de ${graduando.nombre}. Ingresa con tu QR el día de la ceremonia (una entrada por ticket).`;
    const files = items.map((i) => toFile(i));
    if (navigator.canShare?.({ files }) && navigator.share) {
      try {
        await navigator.share({ files, text });
        toast.success(`${items.length} tickets compartidos con éxito`);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    toast.warning("Este dispositivo no permite compartir varias imágenes de una vez", {
      description: "Comparte uno por uno o descarga todos en un ZIP.",
    });
  }

  function printAll() {
    const w = window.open("", "_blank");
    if (!w) { toast.error("El navegador bloqueó la ventana de impresión"); return; }
    w.document.write(`<html><head><title>Tickets ${graduando?.nombre}</title><style>body{margin:0}img{width:48%;margin:1%;page-break-inside:avoid}</style></head><body>${items.map((i) => `<img src="${i.png}"/>`).join("")}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
    toast.success(`Enviando ${items.length} tickets a imprimir`, { description: "Elige la impresora en la ventana que se abrió." });
  }

  return (
    <Dialog open={!!graduando} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tickets de {graduando?.nombre}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={printAll} disabled={!items.length} variant="gold"><Printer /> Imprimir todos</Button>
          <Button onClick={downloadAll} disabled={!items.length} variant="outline"><Download /> Descargar ZIP</Button>
        </div>
        <Button onClick={shareAll} disabled={!items.length} variant="success" className="w-full"><Images /> Compartir todos</Button>
        <div className="space-y-4">
          {items.map((i) => (
            <div key={i.t.code} className="rounded-xl border-2 border-border p-2">
              <img src={i.png} alt={`Ticket ${i.t.code}`} className="w-full rounded-lg" />
              <p className="py-1 text-center text-sm font-semibold">{i.t.usedAt ? `Usado ${new Date(i.t.usedAt).toLocaleTimeString("es-CO")}` : "Disponible"}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => download(i)}><Download /> PNG</Button>
                <Button variant="success" onClick={() => share(i)}><Share2 /> WhatsApp</Button>
              </div>
            </div>
          ))}
          {graduando && graduando.cupos === 0 && <p className="text-muted-foreground">Sin cupos asignados.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
