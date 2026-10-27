import { useEffect, useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import { db, type Graduando, type Ticket } from "@/lib/db";
import { ticketPng } from "@/lib/ticket-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Item = { t: Ticket; png: string };

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
  }

  async function share({ t, png }: Item) {
    const text = `Instituto Técnico Laboral ATUCSARA · Ticket de grado de ${graduando?.nombre} (${t.index} de ${t.total}). Código: ${t.code}`;
    try {
      const blob = await (await fetch(png)).blob();
      const file = new File([blob], `${t.code}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      /* The WhatsApp fallback works outside the editor's sandboxed preview. */
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function printAll() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Tickets ${graduando?.nombre}</title><style>body{margin:0}img{width:48%;margin:1%;page-break-inside:avoid}</style></head><body>${items.map((i) => `<img src="${i.png}"/>`).join("")}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  return (
    <Dialog open={!!graduando} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Tickets de {graduando?.nombre}</DialogTitle></DialogHeader>
        <Button onClick={printAll} disabled={!items.length} variant="gold"><Printer /> Imprimir todos</Button>
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
