import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { baseUrl } from "@/lib/base-url";
import PhotoWall from "./PhotoWall";
import type { Media } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      media: {
        orderBy: { createdAt: "asc" },
        include: { guest: { select: { name: true } } },
      },
    },
  });
  if (!event) notFound();

  const joinUrl = `${baseUrl()}/j/${event.slug}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 320,
    color: { dark: "#0b0b0f", light: "#ffffff" },
  });

  return (
    <PhotoWall
      eventId={event.id}
      eventName={event.name}
      joinUrl={joinUrl}
      qrDataUrl={qrDataUrl}
      initial={event.media as unknown as Media[]}
    />
  );
}
