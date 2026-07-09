"use client";

import { useState } from "react";
import {
  CopyIcon,
  CheckIcon,
  ShareIcon,
  DownloadIcon,
  WhatsAppIcon,
} from "@/app/components/icons";

export default function SharePanel({
  joinUrl,
  qrDataUrl,
  eventName,
}: {
  joinUrl: string;
  qrDataUrl: string;
  eventName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    // `navigator.clipboard` sólo existe en contexto seguro (HTTPS/localhost);
    // si no, caemos a execCommand. Sólo mostramos "¡Copiado!" si funcionó.
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinUrl);
        ok = true;
      } else {
        const ta = document.createElement("textarea");
        ta.value = joinUrl;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      }
    } catch {
      ok = false;
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else {
      // Último recurso: seleccionamos el link para que lo copie a mano.
      window.prompt("Copia el link:", joinUrl);
    }
  }

  async function share() {
    if (navigator.share) {
      await navigator
        .share({ title: eventName, text: "Sube tus fotos y videos:", url: joinUrl })
        .catch(() => {});
    } else {
      copy();
    }
  }

  return (
    <aside className="h-fit rounded-md border border-hairline bg-card/50 p-6 lg:sticky lg:top-6">
      <p className="eyebrow">Comparte</p>
      <h2 className="font-display mt-1.5 text-2xl font-light">
        Invita a tus invitados
      </h2>
      <p className="mt-2 text-sm text-muted">
        Escanean el QR o abren el link. No instalan nada.
      </p>

      <div className="mt-5 flex justify-center rounded-xl bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="QR del evento" width={260} height={260} />
      </div>

      <div className="mt-4 break-all rounded-md border border-hairline bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed text-muted">
        {joinUrl}
      </div>

      {/* WhatsApp con mensaje prellenado: funciona también en escritorio
          (WhatsApp Web), donde navigator.share no existe. */}
      <a
        href={`https://wa.me/?text=${encodeURIComponent(
          `¡Sube tus fotos y videos de ${eventName}! 📸 Escanea el QR o entra aquí (sin instalar nada): ${joinUrl}`,
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#25D366] py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
      >
        <WhatsAppIcon width={16} height={16} /> Compartir por WhatsApp
      </a>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={copy}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-hairline py-2 text-sm transition-colors hover:border-accent"
        >
          {copied ? (
            <>
              <CheckIcon width={15} height={15} className="text-accent" /> ¡Copiado!
            </>
          ) : (
            <>
              <CopyIcon width={15} height={15} /> Copiar link
            </>
          )}
        </button>
        <button
          onClick={share}
          className="btn-primary flex cursor-pointer items-center justify-center gap-1.5 py-2 text-sm"
        >
          <ShareIcon width={15} height={15} /> Compartir
        </button>
      </div>

      <a
        href={qrDataUrl}
        download={`qr-${eventName.replace(/\s+/g, "-").toLowerCase()}.png`}
        className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted transition-colors hover:text-foreground"
      >
        <DownloadIcon width={13} height={13} /> Descargar QR para imprimir
      </a>

      <a
        href={joinUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-center text-xs text-muted underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Ver cómo lo ven los invitados ↗
      </a>
    </aside>
  );
}
