import QRCode from "qrcode";
import type { Graduando, Ticket } from "./db";
import { qrPayload } from "./codes";
import instituteLogo from "@/assets/atucsara-logo.jpg";

let logoPromise: Promise<HTMLImageElement | null> | undefined;
function loadLogo() {
  logoPromise ??= new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { logoPromise = undefined; resolve(null); };
    image.src = instituteLogo;
  });
  return logoPromise;
}

/** Render a printable ticket card to a PNG data URL (browser only). */
export async function ticketPng(g: Graduando, t: Ticket): Promise<string> {
  const W = 600, H = 970;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear la imagen del ticket.");
  const logo = await loadLogo();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  if (logo) ctx.drawImage(logo, 24, 12, 126, 126);
  ctx.fillStyle = "#0b1f4d"; ctx.font = "600 18px Archivo, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("INSTITUTO TÉCNICO LABORAL", 370, 57);
  ctx.font = "800 38px Archivo, sans-serif";
  ctx.fillText("ATUCSARA", 370, 103);
  ctx.fillStyle = "#0b1f4d"; ctx.fillRect(0, 150, W, 120);
  ctx.fillStyle = "#f5b800"; ctx.fillRect(0, 270, W, 10);
  ctx.fillStyle = "#ffffff"; ctx.font = "800 30px Archivo, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("CEREMONIA DE GRADO", W / 2, 208);
  ctx.font = "600 22px Archivo, sans-serif";
  ctx.fillText(`Invitado ${t.index} de ${t.total}`, W / 2, 244);
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, qrPayload(t.code, t.sig), { width: 420, margin: 1, errorCorrectionLevel: "M" });
  ctx.drawImage(qr, (W - 420) / 2, 310);
  ctx.fillStyle = "#0b1f4d"; ctx.font = "800 44px monospace";
  ctx.fillText(t.code, W / 2, 790);
  ctx.font = "700 28px Archivo, sans-serif";
  ctx.fillText(g.nombre.slice(0, 34), W / 2, 850);
  ctx.fillStyle = "#4a5578"; ctx.font = "500 20px Archivo, sans-serif";
  ctx.fillText(g.programa.slice(0, 44), W / 2, 886);
  ctx.fillText("Un solo uso · Presentar en la entrada", W / 2, 940);
  return c.toDataURL("image/png");
}
