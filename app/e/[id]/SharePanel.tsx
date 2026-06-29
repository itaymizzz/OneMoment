"use client";

import { useState } from "react";
import {
  CopyIcon,
  CheckIcon,
  ShareIcon,
  DownloadIcon,
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
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
    <aside className="card p-6 h-fit lg:sticky lg:top-6">
      <h2 className="font-semibold">Comparte con tus invitados</h2>
      <p className="mt-1 text-sm text-muted">
        Escanean el QR o abren el link. No instalan nada.
      </p>

      <div className="mt-5 flex justify-center rounded-xl bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="QR del evento" width={260} height={260} />
      </div>

      <div className="mt-4 break-all rounded-lg border border-border bg-[#0e0e14] px-3 py-2 text-sm text-muted">
        {joinUrl}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={copy}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-sm transition-colors hover:border-accent"
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
    </aside>
  );
}
