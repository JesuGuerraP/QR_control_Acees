import QRCode from "qrcode";
import type { Graduando, Ticket } from "./db";
import { qrPayload } from "./codes";

/** Render a printable ticket card to a PNG data URL (browser only). */
export async function ticketPng(g: Graduando, t: Ticket): Promise<string> {
  const W = 600, H = 820;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0b1f4d"; ctx.fillRect(0, 0, W, 120);
  ctx.fillStyle = "#f5b800"; ctx.fillRect(0, 120, W, 10);
  ctx.fillStyle = "#ffffff"; ctx.font = "800 30px Archivo, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("CEREMONIA DE GRADO", W / 2, 58);
  ctx.font = "600 22px Archivo, sans-serif";
  ctx.fillText(`Invitado ${t.index} de ${t.total}`, W / 2, 94);
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, qrPayload(t.code, t.sig), { width: 420, margin: 1, errorCorrectionLevel: "M" });
  ctx.drawImage(qr, (W - 420) / 2, 160);
  ctx.fillStyle = "#0b1f4d"; ctx.font = "800 44px monospace";
  ctx.fillText(t.code, W / 2, 640);
  ctx.font = "700 28px Archivo, sans-serif";
  ctx.fillText(g.nombre.slice(0, 34), W / 2, 700);
  ctx.fillStyle = "#4a5578"; ctx.font = "500 20px Archivo, sans-serif";
  ctx.fillText(g.programa.slice(0, 44), W / 2, 736);
  ctx.fillText("Un solo uso · Presentar en la entrada", W / 2, 790);
  return c.toDataURL("image/png");
}
